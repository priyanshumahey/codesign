//! Layered layout for a whole document, boundaries included.
//!
//! The canvas has always had a dagre pass for top-level nodes, but it ignored
//! anything nested inside a boundary. Generated diagrams are mostly nested, so
//! this replaces it: children are laid out first, each boundary is then sized
//! to fit its contents, and the result is laid out as one graph at each level.

use std::collections::{HashMap, HashSet};

use crate::doc::{Doc, NodeKind, Point, Size, BOUNDARY_SIZE};

const MIN_GAP_X: f64 = 160.0;
const MAX_GAP_X: f64 = 280.0;
const BASE_GAP_Y: f64 = 72.0;
const MAX_GAP_Y: f64 = 128.0;
const FANOUT_GAP_Y: f64 = 12.0;
const PAD: f64 = 48.0;
/// Room for the boundary's label, which is drawn inside the top edge.
const PAD_TOP: f64 = 64.0;

/// Re-positions everything, or just the contents of one boundary.
pub fn layout(doc: &Doc, within: Option<&str>) -> Doc {
    let mut next = doc.clone();
    let size = layout_children(&mut next, within);

    // Laying out inside a boundary can change how much room it needs.
    if let Some(id) = within {
        if let Some(node) = next.node_mut(id) {
            node.width = Some((size.width + PAD * 2.0).max(BOUNDARY_SIZE.width));
            node.height = Some((size.height + PAD_TOP + PAD).max(BOUNDARY_SIZE.height));
        }
    }

    next.sort_by_parenting();
    next
}

/// Places every child of `parent` and returns the space they occupy.
fn layout_children(doc: &mut Doc, parent: Option<&str>) -> Size {
    let children: Vec<String> = doc
        .nodes
        .iter()
        .filter(|node| node.parent_id.as_deref() == parent)
        .map(|node| node.id.clone())
        .collect();

    if children.is_empty() {
        return Size {
            width: 0.0,
            height: 0.0,
        };
    }

    // Depth first, so a boundary knows its own size before it is placed.
    for id in &children {
        if doc
            .node(id)
            .is_some_and(|node| matches!(node.kind, NodeKind::Boundary))
        {
            let inner = layout_children(doc, Some(id));
            if let Some(node) = doc.node_mut(id) {
                node.width = Some((inner.width + PAD * 2.0).max(BOUNDARY_SIZE.width));
                node.height = Some((inner.height + PAD_TOP + PAD).max(BOUNDARY_SIZE.height));
            }
        }
    }

    let edges = projected_edges(doc, parent, &children);
    let ranked = assign_layers(&children, &break_cycles(&children, &edges));
    let layers = order(&children, &ranked, &edges);

    let origin = if parent.is_some() {
        Point { x: PAD, y: PAD_TOP }
    } else {
        Point::default()
    };
    let gap_x = horizontal_gap(doc, parent);
    let gap_y = vertical_gap(&edges);
    place(doc, &layers, origin, gap_x, gap_y)
}

/// Reserve enough room between columns for the widest connection chip at this
/// level. The UI caps chips at roughly 256px, so the upper bound prevents one
/// verbose label from making an otherwise small diagram enormous.
fn horizontal_gap(doc: &Doc, parent: Option<&str>) -> f64 {
    doc.edges
        .iter()
        .filter_map(|edge| {
            let source = ancestor_in(doc, &edge.source, parent)?;
            let target = ancestor_in(doc, &edge.target, parent)?;
            (source != target).then(|| estimated_label_clearance(edge))
        })
        .fold(MIN_GAP_X, f64::max)
        .min(MAX_GAP_X)
}

fn estimated_label_clearance(edge: &crate::doc::Edge) -> f64 {
    let label = edge
        .data
        .get("label")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let method = edge
        .data
        .get("method")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();

    if label.is_empty() && method.is_empty() {
        return MIN_GAP_X;
    }

    let label_width = label.chars().count() as f64 * 5.6;
    let method_width = method.chars().count() as f64 * 5.2;
    let between = if label.is_empty() || method.is_empty() {
        0.0
    } else {
        6.0
    };
    // Chip padding, method badge padding, and clear air on both sides.
    (label_width + method_width + between + 56.0).max(MIN_GAP_X)
}

/// A wide fan-out needs separate visual lanes. Increase row spacing with the
/// busiest source or target, but cap it so very dense graphs remain navigable.
fn vertical_gap(edges: &[(String, String)]) -> f64 {
    let mut incoming: HashMap<&str, usize> = HashMap::new();
    let mut outgoing: HashMap<&str, usize> = HashMap::new();
    for (source, target) in edges {
        *outgoing.entry(source).or_default() += 1;
        *incoming.entry(target).or_default() += 1;
    }
    let fanout = incoming
        .values()
        .chain(outgoing.values())
        .copied()
        .max()
        .unwrap_or(1);

    (BASE_GAP_Y + FANOUT_GAP_Y * fanout.saturating_sub(1) as f64).min(MAX_GAP_Y)
}

/// Layering assumes a DAG. Real architectures have feedback loops — a broadcast
/// returning to the gateway it came from — and leaving those in pushes layers
/// apart on every pass until the iteration cap, stranding the diagram across
/// hundreds of empty pixels. Drop the back edges for ranking only; they still
/// count when ordering rows and they are still drawn.
fn break_cycles(children: &[String], edges: &[(String, String)]) -> Vec<(String, String)> {
    let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
    for (source, target) in edges {
        adjacency.entry(source).or_default().push(target);
    }

    let mut state: HashMap<&str, Visit> = HashMap::new();
    let mut back: HashSet<(String, String)> = HashSet::new();
    for child in children {
        if !state.contains_key(child.as_str()) {
            walk(child, &adjacency, &mut state, &mut back);
        }
    }

    edges
        .iter()
        .filter(|edge| !back.contains(*edge))
        .cloned()
        .collect()
}

#[derive(Clone, Copy, PartialEq)]
enum Visit {
    Open,
    Done,
}

fn walk<'a>(
    node: &'a str,
    adjacency: &HashMap<&'a str, Vec<&'a str>>,
    state: &mut HashMap<&'a str, Visit>,
    back: &mut HashSet<(String, String)>,
) {
    state.insert(node, Visit::Open);
    for target in adjacency.get(node).into_iter().flatten() {
        match state.get(target) {
            None => walk(target, adjacency, state, back),
            // Still open means it is an ancestor, so this edge closes a loop.
            Some(Visit::Open) => {
                back.insert((node.to_string(), (*target).to_string()));
            }
            Some(Visit::Done) => {}
        }
    }
    state.insert(node, Visit::Done);
}

/// An edge between two nodes deep inside different boundaries still means those
/// boundaries are related, so project every edge onto the current level.
fn projected_edges(doc: &Doc, parent: Option<&str>, children: &[String]) -> Vec<(String, String)> {
    let siblings: HashSet<&str> = children.iter().map(String::as_str).collect();
    let mut seen: HashSet<(String, String)> = HashSet::new();

    for edge in &doc.edges {
        let (Some(source), Some(target)) = (
            ancestor_in(doc, &edge.source, parent),
            ancestor_in(doc, &edge.target, parent),
        ) else {
            continue;
        };
        if source == target || !siblings.contains(source.as_str()) {
            continue;
        }
        if !siblings.contains(target.as_str()) {
            continue;
        }
        seen.insert((source, target));
    }

    let mut edges: Vec<(String, String)> = seen.into_iter().collect();
    edges.sort();
    edges
}

/// Walks up from `id` to whichever ancestor is a direct child of `parent`.
fn ancestor_in(doc: &Doc, id: &str, parent: Option<&str>) -> Option<String> {
    let mut current = id.to_string();
    for _ in 0..64 {
        let node = doc.node(&current)?;
        if node.parent_id.as_deref() == parent {
            return Some(current);
        }
        current = node.parent_id.clone()?;
    }
    None
}

/// Longest-path layering, bounded so a cycle cannot spin.
fn assign_layers(children: &[String], edges: &[(String, String)]) -> HashMap<String, usize> {
    let mut layer: HashMap<String, usize> =
        children.iter().map(|id| (id.clone(), 0usize)).collect();

    for _ in 0..children.len() {
        let mut moved = false;
        for (source, target) in edges {
            let next = layer.get(source).copied().unwrap_or(0) + 1;
            if layer.get(target).copied().unwrap_or(0) < next {
                layer.insert(target.clone(), next);
                moved = true;
            }
        }
        if !moved {
            break;
        }
    }

    layer
}

/// Groups nodes into layers, then reduces crossings with barycentre sweeps.
fn order(
    children: &[String],
    layer: &HashMap<String, usize>,
    edges: &[(String, String)],
) -> Vec<Vec<String>> {
    let depth = layer.values().copied().max().unwrap_or(0) + 1;
    let mut layers: Vec<Vec<String>> = vec![Vec::new(); depth];
    for id in children {
        layers[layer.get(id).copied().unwrap_or(0)].push(id.clone());
    }

    let mut incoming: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut outgoing: HashMap<&str, Vec<&str>> = HashMap::new();
    for (source, target) in edges {
        outgoing.entry(source).or_default().push(target);
        incoming.entry(target).or_default().push(source);
    }

    for sweep in 0..4 {
        let downward = sweep % 2 == 0;
        let indices: Vec<usize> = if downward {
            (1..layers.len()).collect()
        } else {
            (0..layers.len().saturating_sub(1)).rev().collect()
        };

        for index in indices {
            let neighbour: HashMap<&str, usize> = layers
                [if downward { index - 1 } else { index + 1 }]
            .iter()
            .enumerate()
            .map(|(position, id)| (id.as_str(), position))
            .collect();
            let links = if downward { &incoming } else { &outgoing };

            let mut ranked: Vec<(f64, usize, String)> = layers[index]
                .iter()
                .enumerate()
                .map(|(position, id)| {
                    let scores: Vec<usize> = links
                        .get(id.as_str())
                        .map(|list| {
                            list.iter()
                                .filter_map(|other| neighbour.get(other).copied())
                                .collect()
                        })
                        .unwrap_or_default();
                    let barycentre = if scores.is_empty() {
                        position as f64
                    } else {
                        scores.iter().sum::<usize>() as f64 / scores.len() as f64
                    };
                    (barycentre, position, id.clone())
                })
                .collect();

            // Position breaks ties so the order stays stable run to run.
            ranked.sort_by(|a, b| {
                a.0.partial_cmp(&b.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.1.cmp(&b.1))
            });
            layers[index] = ranked.into_iter().map(|(_, _, id)| id).collect();
        }
    }

    layers
}

fn place(
    doc: &mut Doc,
    layers: &[Vec<String>],
    origin: Point,
    gap_x: f64,
    gap_y: f64,
) -> Size {
    let size_of = |doc: &Doc, id: &str| {
        doc.node(id)
            .map(|node| node.size())
            .unwrap_or(BOUNDARY_SIZE)
    };

    let mut columns: Vec<(f64, f64)> = Vec::with_capacity(layers.len());
    for column in layers {
        let width = column
            .iter()
            .map(|id| size_of(doc, id).width)
            .fold(0.0, f64::max);
        let height: f64 = column.iter().map(|id| size_of(doc, id).height).sum::<f64>()
            + gap_y * (column.len().saturating_sub(1)) as f64;
        columns.push((width, height));
    }

    let tallest = columns
        .iter()
        .map(|(_, height)| *height)
        .fold(0.0, f64::max);

    let mut x = origin.x;
    for (column, (width, height)) in layers.iter().zip(&columns) {
        // Centre each column against the tallest so the graph reads level.
        let mut y = origin.y + (tallest - height) / 2.0;
        for id in column {
            let size = size_of(doc, id);
            if let Some(node) = doc.node_mut(id) {
                node.position = Point {
                    x: x + (width - size.width) / 2.0,
                    y,
                };
            }
            y += size.height + gap_y;
        }
        x += width + gap_x;
    }

    Size {
        width: (x - origin.x - gap_x).max(0.0),
        height: tallest,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc::{Node, SERVICE_SIZE};

    fn service(id: &str, parent: Option<&str>) -> Node {
        Node {
            id: id.to_string(),
            kind: NodeKind::Service,
            position: Point::default(),
            data: Default::default(),
            width: None,
            height: None,
            parent_id: parent.map(str::to_string),
            extent: parent.map(|_| "parent".to_string()),
        }
    }

    fn boundary(id: &str, parent: Option<&str>) -> Node {
        Node {
            kind: NodeKind::Boundary,
            ..service(id, parent)
        }
    }

    fn edge(source: &str, target: &str) -> crate::doc::Edge {
        crate::doc::Edge {
            id: format!("{source}-{target}"),
            kind: "system".to_string(),
            source: source.to_string(),
            target: target.to_string(),
            source_handle: None,
            target_handle: None,
            data: Default::default(),
        }
    }

    #[test]
    fn a_chain_flows_left_to_right() {
        let doc = Doc {
            nodes: vec![service("c", None), service("a", None), service("b", None)],
            edges: vec![edge("a", "b"), edge("b", "c")],
        };

        let out = layout(&doc, None);
        let x = |id: &str| out.node(id).unwrap().position.x;
        assert!(x("a") < x("b"), "a should precede b");
        assert!(x("b") < x("c"), "b should precede c");
    }

    #[test]
    fn siblings_do_not_overlap() {
        let doc = Doc {
            nodes: vec![service("a", None), service("b", None), service("c", None)],
            edges: vec![edge("a", "b"), edge("a", "c")],
        };

        let out = layout(&doc, None);
        let b = out.node("b").unwrap().position;
        let c = out.node("c").unwrap().position;
        assert_eq!(b.x, c.x, "both are one hop from a");
        assert!((b.y - c.y).abs() >= SERVICE_SIZE.height, "b and c overlap");
    }

    #[test]
    fn fanout_reserves_separate_visual_lanes() {
        let doc = Doc {
            nodes: vec![
                service("source", None),
                service("a", None),
                service("b", None),
                service("c", None),
                service("d", None),
            ],
            edges: vec![
                edge("source", "a"),
                edge("source", "b"),
                edge("source", "c"),
                edge("source", "d"),
            ],
        };

        let out = layout(&doc, None);
        let mut rows: Vec<f64> = ["a", "b", "c", "d"]
            .iter()
            .map(|id| out.node(id).unwrap().position.y)
            .collect();
        rows.sort_by(|a, b| a.partial_cmp(b).unwrap());
        for pair in rows.windows(2) {
            assert!(
                pair[1] - pair[0] >= SERVICE_SIZE.height + 100.0,
                "fan-out rows are still crowded: {rows:?}"
            );
        }
    }

    #[test]
    fn long_edge_labels_get_a_readable_corridor() {
        let mut labelled = edge("a", "b");
        labelled.data.insert(
            "method".to_string(),
            serde_json::Value::String("MUTATION".to_string()),
        );
        labelled.data.insert(
            "label".to_string(),
            serde_json::Value::String("New unvisited URLs".to_string()),
        );
        let doc = Doc {
            nodes: vec![service("a", None), service("b", None)],
            edges: vec![labelled],
        };

        let out = layout(&doc, None);
        let left = out.node("a").unwrap();
        let right = out.node("b").unwrap();
        let corridor = right.position.x - left.position.x - left.size().width;
        assert!(corridor >= 200.0, "label corridor is too narrow: {corridor}");
    }

    #[test]
    fn a_boundary_grows_to_fit_its_contents() {
        let doc = Doc {
            nodes: vec![
                boundary("box", None),
                service("a", Some("box")),
                service("b", Some("box")),
            ],
            edges: vec![edge("a", "b")],
        };

        let out = layout(&doc, None);
        let box_size = out.node("box").unwrap().size();
        assert!(
            box_size.width >= SERVICE_SIZE.width * 2.0,
            "too narrow: {box_size:?}"
        );

        // Children sit inside, below the label strip.
        for id in ["a", "b"] {
            let at = out.node(id).unwrap().position;
            assert!(at.x >= PAD, "{id} is outside the left padding");
            assert!(
                at.y >= PAD_TOP - SERVICE_SIZE.height,
                "{id} is over the label"
            );
        }
    }

    #[test]
    fn edges_across_boundaries_order_the_boundaries() {
        let doc = Doc {
            nodes: vec![
                boundary("left", None),
                boundary("right", None),
                service("a", Some("left")),
                service("b", Some("right")),
            ],
            // The edge is between children, not the boundaries themselves.
            edges: vec![edge("a", "b")],
        };

        let out = layout(&doc, None);
        assert!(
            out.node("left").unwrap().position.x < out.node("right").unwrap().position.x,
            "the boundary containing the source should come first"
        );
    }

    #[test]
    fn a_cycle_still_terminates() {
        let doc = Doc {
            nodes: vec![service("a", None), service("b", None)],
            edges: vec![edge("a", "b"), edge("b", "a")],
        };
        let out = layout(&doc, None);
        assert_eq!(out.nodes.len(), 2);
    }

    /// A broadcast looping back to the gateway used to push everything after it
    /// into far-away columns, leaving a huge empty gap.
    #[test]
    fn a_feedback_loop_does_not_stretch_the_layout() {
        let chain = Doc {
            nodes: vec![service("a", None), service("b", None), service("c", None)],
            edges: vec![edge("a", "b"), edge("b", "c")],
        };
        let looped = Doc {
            edges: vec![edge("a", "b"), edge("b", "c"), edge("c", "a")],
            ..chain.clone()
        };

        let width = |doc: &Doc| {
            let laid = layout(doc, None);
            let xs: Vec<f64> = laid.nodes.iter().map(|node| node.position.x).collect();
            xs.iter().cloned().fold(f64::MIN, f64::max)
                - xs.iter().cloned().fold(f64::MAX, f64::min)
        };

        assert_eq!(
            width(&looped),
            width(&chain),
            "the back edge should not add columns"
        );
    }

    #[test]
    fn layout_is_stable_when_run_twice() {
        let doc = Doc {
            nodes: vec![service("a", None), service("b", None), service("c", None)],
            edges: vec![edge("a", "b"), edge("a", "c")],
        };
        let once = layout(&doc, None);
        let twice = layout(&once, None);
        for node in &once.nodes {
            assert_eq!(node.position, twice.node(&node.id).unwrap().position);
        }
    }
}
