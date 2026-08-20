//! `apply(doc, ops) -> doc'`.
//!
//! This is the only implementation of "edit a space". The live app, the MCP
//! server and the headless binary all route through here, so there is nothing
//! to keep in sync.
//!
//! Application is transactional: ops run in order against a copy, and the
//! first failure aborts the whole batch with the offending index. A model that
//! gets one argument wrong sees a precise error instead of a half-edited
//! diagram.

use std::collections::{HashMap, HashSet};

use crate::doc::{
    self, Doc, Edge, Node, NodeKind, Point, Size, BOUNDARY_COLORS, BOUNDARY_SIZE, EDGE_DIRECTIONS,
    HTTP_METHODS, NOTE_SIZE, SERVICE_SIZE, SERVICE_STATUSES, SYSTEM_EDGE,
};
use crate::icons::{self, IconEntry, IconIndex};
use crate::ids::IdGen;
use crate::ops::Op;
use crate::place;

pub struct ApplyCtx<'a> {
    pub ids: &'a mut IdGen,
    pub icons: &'a IconIndex,
    /// Handles created by earlier ops. An agent that calls tools one at a time
    /// passes the same map through the whole turn so `alias` still resolves.
    pub aliases: &'a mut Aliases,
}

impl<'a> ApplyCtx<'a> {
    /// A one-shot batch, where aliases only need to live as long as the call.
    pub fn new(ids: &'a mut IdGen, icons: &'a IconIndex, aliases: &'a mut Aliases) -> Self {
        Self {
            ids,
            icons,
            aliases,
        }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("op {index} ({op}): {message}")]
pub struct ApplyError {
    pub index: usize,
    pub op: String,
    pub message: String,
}

/// What one op did, phrased for feeding back to a model as a tool result.
#[derive(Clone, Debug)]
pub struct Outcome {
    pub index: usize,
    pub op: &'static str,
    pub ids: Vec<String>,
    pub message: String,
}

#[derive(Debug)]
pub struct Applied {
    pub doc: Doc,
    pub outcomes: Vec<Outcome>,
}

#[derive(Default)]
pub struct Aliases {
    nodes: HashMap<String, String>,
    edges: HashMap<String, String>,
}

pub fn apply(doc: &Doc, ops: &[Op], ctx: &mut ApplyCtx) -> Result<Applied, ApplyError> {
    let mut next = doc.clone();
    let mut outcomes = Vec::with_capacity(ops.len());

    for (index, op) in ops.iter().enumerate() {
        let outcome = apply_one(&mut next, op, ctx).map_err(|message| ApplyError {
            index,
            op: op.name().to_string(),
            message,
        })?;
        outcomes.push(Outcome {
            index,
            op: op.name(),
            ids: outcome.0,
            message: outcome.1,
        });
    }

    next.sort_by_parenting();
    Ok(Applied {
        doc: next,
        outcomes,
    })
}

type Step = Result<(Vec<String>, String), String>;

fn apply_one(doc: &mut Doc, op: &Op, ctx: &mut ApplyCtx) -> Step {
    // Split the borrow so all three can be used in the same arm.
    let ApplyCtx {
        ids,
        icons,
        aliases,
    } = ctx;
    let ids: &mut IdGen = ids;
    let icons: &IconIndex = icons;
    let aliases: &mut Aliases = aliases;
    match op {
        Op::CreateService(args) => {
            let parent = optional_boundary(doc, aliases, args.parent.as_deref())?;
            let (icon, matched) = resolve_icon(icons, &args.icon);
            let at = resolve_placement(doc, parent.as_deref(), args.position, SERVICE_SIZE);
            let status = args
                .status
                .as_deref()
                .map(|value| one_of(value, &SERVICE_STATUSES, "status"))
                .transpose()?;

            let mut data = doc::DataMap::new();
            doc::set_data_str(&mut data, "label", args.label.clone());
            doc::set_data_str(&mut data, "iconId", icon.id.clone());
            doc::set_data_str(&mut data, "iconPath", icon.path.clone());
            doc::set_data_str(&mut data, "iconCategory", icon.category.clone());
            if icon.mono == Some(true) {
                data.insert("iconMono".into(), true.into());
            }
            if let Some(description) = &args.description {
                doc::set_data_str(&mut data, "description", description.clone());
            }
            if let Some(link) = &args.link {
                doc::set_data_str(&mut data, "link", link.clone());
            }
            if let Some(owner) = &args.owner {
                doc::set_data_str(&mut data, "owner", owner.clone());
            }
            if let Some(status) = status {
                doc::set_data_str(&mut data, "status", status);
            }

            let id = ids.next("node");
            push_node(
                doc,
                new_node(&id, NodeKind::Service, at, data, parent.clone(), None),
            );
            remember(&mut aliases.nodes, args.alias.as_deref(), &id);

            let note = match matched {
                IconMatch::Asked => String::new(),
                IconMatch::Searched => format!(" using icon {}", icon.id),
                IconMatch::None => format!(
                    " with a plain box — nothing matched \"{}\", so search_icons and update_node if you want a better one",
                    args.icon
                ),
            };
            Ok((vec![id], format!("added service \"{}\"{note}", args.label)))
        }

        Op::CreateBoundary(args) => {
            let parent = optional_boundary(doc, aliases, args.parent.as_deref())?;
            let color = args
                .color
                .as_deref()
                .map(|value| one_of(value, &BOUNDARY_COLORS, "color"))
                .transpose()?;
            let size = args.size.unwrap_or(BOUNDARY_SIZE);
            let at = resolve_placement(doc, parent.as_deref(), args.position, size);

            let mut data = doc::DataMap::new();
            doc::set_data_str(&mut data, "label", args.label.clone());
            if let Some(color) = color {
                doc::set_data_str(&mut data, "color", color);
            }

            let id = ids.next("boundary");
            push_node(
                doc,
                new_node(
                    &id,
                    NodeKind::Boundary,
                    at,
                    data,
                    parent.clone(),
                    Some(size),
                ),
            );
            remember(&mut aliases.nodes, args.alias.as_deref(), &id);
            Ok((vec![id], format!("added boundary \"{}\"", args.label)))
        }

        Op::CreateNote(args) => {
            let parent = optional_boundary(doc, aliases, args.parent.as_deref())?;
            let variant = args
                .variant
                .as_deref()
                .map(|value| one_of(value, &["heading", "body"], "variant"))
                .transpose()?;
            let at = resolve_placement(doc, parent.as_deref(), args.position, NOTE_SIZE);

            let mut data = doc::DataMap::new();
            doc::set_data_str(&mut data, "text", args.text.clone());
            doc::set_data_str(&mut data, "variant", variant.unwrap_or("body"));

            let id = ids.next("note");
            push_node(
                doc,
                new_node(&id, NodeKind::Note, at, data, parent.clone(), None),
            );
            remember(&mut aliases.nodes, args.alias.as_deref(), &id);
            Ok((vec![id], "added note".to_string()))
        }

        Op::UpdateNode(args) => {
            let id = resolve_node(doc, aliases, &args.node)?;
            let color = args
                .color
                .as_deref()
                .map(|value| one_of(value, &BOUNDARY_COLORS, "color"))
                .transpose()?;
            let status = args
                .status
                .as_deref()
                .filter(|value| !value.is_empty())
                .map(|value| one_of(value, &SERVICE_STATUSES, "status"))
                .transpose()?;
            let icon = args.icon.as_deref().map(|value| resolve_icon(icons, value));

            let node = doc.node_mut(&id).expect("resolved above");
            if let Some(label) = &args.label {
                doc::set_data_str(&mut node.data, "label", label.clone());
            }
            if let Some(description) = &args.description {
                doc::set_data_str(&mut node.data, "description", description.clone());
            }
            // An empty string clears optional metadata rather than storing "".
            if let Some(link) = &args.link {
                set_or_clear(&mut node.data, "link", link);
            }
            if let Some(owner) = &args.owner {
                set_or_clear(&mut node.data, "owner", owner);
            }
            if args.status.is_some() {
                match status {
                    Some(status) => doc::set_data_str(&mut node.data, "status", status),
                    None => {
                        node.data.remove("status");
                    }
                }
            }
            if let Some(text) = &args.text {
                doc::set_data_str(&mut node.data, "text", text.clone());
            }
            if let Some(color) = color {
                doc::set_data_str(&mut node.data, "color", color);
            }
            if let Some((icon, _)) = icon {
                doc::set_data_str(&mut node.data, "iconId", icon.id);
                doc::set_data_str(&mut node.data, "iconPath", icon.path);
                doc::set_data_str(&mut node.data, "iconCategory", icon.category);
                match icon.mono {
                    Some(true) => {
                        node.data.insert("iconMono".into(), true.into());
                    }
                    _ => {
                        node.data.remove("iconMono");
                    }
                }
            }
            Ok((vec![id], "updated node".to_string()))
        }

        Op::MoveNode(args) => {
            let id = resolve_node(doc, aliases, &args.node)?;
            let parent = doc.node(&id).and_then(|node| node.parent_id.clone());
            let origin = doc.origin_of(parent.as_deref());
            let node = doc.node_mut(&id).expect("resolved above");
            node.position = Point {
                x: args.position.x - origin.x,
                y: args.position.y - origin.y,
            };
            Ok((vec![id], "moved node".to_string()))
        }

        Op::ResizeNode(args) => {
            if args.size.width <= 0.0 || args.size.height <= 0.0 {
                return Err("size must be positive".into());
            }
            let id = resolve_node(doc, aliases, &args.node)?;
            let node = doc.node_mut(&id).expect("resolved above");
            node.width = Some(args.size.width);
            node.height = Some(args.size.height);
            Ok((vec![id], "resized node".to_string()))
        }

        Op::SetParent(args) => {
            let id = resolve_node(doc, aliases, &args.node)?;
            let parent = optional_boundary(doc, aliases, args.parent.as_deref())?;

            if let Some(parent_id) = &parent {
                if parent_id == &id {
                    return Err("a node cannot be its own parent".into());
                }
                if doc.descendants_of(&id).contains(parent_id) {
                    return Err(format!(
                        "\"{parent_id}\" is inside this node, so it cannot also contain it"
                    ));
                }
            }

            let node = doc.node(&id).expect("resolved above");
            let absolute = doc.absolute_position(node);
            let origin = doc.origin_of(parent.as_deref());
            let node = doc.node_mut(&id).expect("resolved above");
            node.position = Point {
                x: absolute.x - origin.x,
                y: absolute.y - origin.y,
            };
            node.extent = parent.as_ref().map(|_| "parent".to_string());
            node.parent_id = parent;
            Ok((vec![id], "reparented node".to_string()))
        }

        Op::Connect(args) => {
            let source = resolve_node(doc, aliases, &args.source)?;
            let target = resolve_node(doc, aliases, &args.target)?;
            if source == target {
                return Err("source and target must be different nodes".into());
            }
            let method = args
                .method
                .as_deref()
                .map(|value| one_of_upper(value, &HTTP_METHODS, "method"))
                .transpose()?;
            let direction = args
                .direction
                .as_deref()
                .map(|value| one_of(value, &EDGE_DIRECTIONS, "direction"))
                .transpose()?;

            let mut data = doc::DataMap::new();
            put(&mut data, "label", args.label.as_deref());
            put(&mut data, "endpoint", args.endpoint.as_deref());
            put(&mut data, "notes", args.notes.as_deref());
            put(&mut data, "request", args.request.as_deref());
            put(&mut data, "response", args.response.as_deref());
            if let Some(method) = &method {
                doc::set_data_str(&mut data, "method", method);
            }
            if let Some(direction) = direction {
                doc::set_data_str(&mut data, "direction", direction);
            }

            // Two identical lines just render on top of each other, and a model
            // repeating itself is the usual cause.
            let duplicate = doc.edges.iter().any(|edge| {
                edge.source == source
                    && edge.target == target
                    && doc::data_str(&edge.data, "label") == args.label.as_deref()
                    && doc::data_str(&edge.data, "method") == method.as_deref()
                    && doc::data_str(&edge.data, "endpoint") == args.endpoint.as_deref()
            });
            if duplicate {
                return Err(format!(
                    "{} is already connected to {} that way",
                    label_of(doc, &source),
                    label_of(doc, &target)
                ));
            }

            let id = ids.next("edge");
            doc.edges.push(Edge {
                id: id.clone(),
                kind: SYSTEM_EDGE.to_string(),
                source: source.clone(),
                target: target.clone(),
                source_handle: None,
                target_handle: None,
                data,
            });
            remember(&mut aliases.edges, args.alias.as_deref(), &id);

            let from = label_of(doc, &source);
            let to = label_of(doc, &target);
            Ok((vec![id], format!("connected {from} to {to}")))
        }

        Op::UpdateEdge(args) => {
            let id = resolve_edge(doc, aliases, &args.edge)?;
            let method = args
                .method
                .as_deref()
                .map(|value| one_of_upper(value, &HTTP_METHODS, "method"))
                .transpose()?;
            let direction = args
                .direction
                .as_deref()
                .map(|value| one_of(value, &EDGE_DIRECTIONS, "direction"))
                .transpose()?;

            let edge = doc.edge_mut(&id).expect("resolved above");
            put(&mut edge.data, "label", args.label.as_deref());
            put(&mut edge.data, "endpoint", args.endpoint.as_deref());
            put(&mut edge.data, "notes", args.notes.as_deref());
            put(&mut edge.data, "request", args.request.as_deref());
            put(&mut edge.data, "response", args.response.as_deref());
            if let Some(method) = method {
                doc::set_data_str(&mut edge.data, "method", method);
            }
            if let Some(direction) = direction {
                doc::set_data_str(&mut edge.data, "direction", direction);
            }
            Ok((vec![id], "updated connection".to_string()))
        }

        Op::Delete(args) => {
            let mut doomed: HashSet<String> = HashSet::new();
            for selector in &args.nodes {
                let id = resolve_node(doc, aliases, selector)?;
                if args.cascade {
                    doomed.extend(doc.descendants_of(&id));
                }
                doomed.insert(id);
            }

            let mut edge_ids: HashSet<String> = HashSet::new();
            for selector in &args.edges {
                edge_ids.insert(resolve_edge(doc, aliases, selector)?);
            }

            if !args.cascade {
                promote_orphans(doc, &doomed);
            }

            let removed_nodes = doomed.len();
            doc.nodes.retain(|node| !doomed.contains(&node.id));
            let before = doc.edges.len();
            doc.edges.retain(|edge| {
                !edge_ids.contains(&edge.id)
                    && !doomed.contains(&edge.source)
                    && !doomed.contains(&edge.target)
            });
            let removed_edges = before - doc.edges.len();

            let ids: Vec<String> = doomed.into_iter().chain(edge_ids).collect();
            Ok((
                ids,
                format!("removed {removed_nodes} node(s) and {removed_edges} connection(s)"),
            ))
        }

        Op::AutoLayout(args) => {
            let within = optional_boundary(doc, aliases, args.within.as_deref())?;
            *doc = crate::layout::layout(doc, within.as_deref());
            Ok((
                Vec::new(),
                match within {
                    Some(id) => format!("tidied the contents of {}", label_of(doc, &id)),
                    None => "tidied the layout".to_string(),
                },
            ))
        }
    }
}

fn new_node(
    id: &str,
    kind: NodeKind,
    position: Point,
    data: doc::DataMap,
    parent: Option<String>,
    size: Option<Size>,
) -> Node {
    Node {
        id: id.to_string(),
        kind,
        position,
        data,
        width: size.map(|s| s.width),
        height: size.map(|s| s.height),
        extent: parent.as_ref().map(|_| "parent".to_string()),
        parent_id: parent,
    }
}

fn push_node(doc: &mut Doc, node: Node) {
    doc.nodes.push(node);
}

/// Ops speak absolute canvas coordinates; stored positions are parent-relative.
fn resolve_placement(
    doc: &Doc,
    parent: Option<&str>,
    requested: Option<Point>,
    size: Size,
) -> Point {
    let absolute = requested.unwrap_or_else(|| place::place(doc, parent, size));
    let origin = doc.origin_of(parent);
    Point {
        x: absolute.x - origin.x,
        y: absolute.y - origin.y,
    }
}

fn remember(map: &mut HashMap<String, String>, alias: Option<&str>, id: &str) {
    if let Some(alias) = alias {
        map.insert(alias.to_string(), id.to_string());
    }
}

fn put(data: &mut doc::DataMap, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        doc::set_data_str(data, key, value);
    }
}

fn label_of(doc: &Doc, id: &str) -> String {
    doc.node(id)
        .and_then(|node| node.display_label())
        .map(|label| format!("\"{label}\""))
        .unwrap_or_else(|| id.to_string())
}

fn optional_boundary(
    doc: &Doc,
    aliases: &Aliases,
    selector: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(selector) = selector else {
        return Ok(None);
    };
    let id = resolve_node(doc, aliases, selector)?;
    match doc.node(&id).map(|node| &node.kind) {
        Some(NodeKind::Boundary) => Ok(Some(id)),
        _ => Err(format!(
            "\"{selector}\" is not a boundary, so nothing can be placed inside it"
        )),
    }
}

fn resolve_node(doc: &Doc, aliases: &Aliases, selector: &str) -> Result<String, String> {
    if let Some(id) = aliases.nodes.get(selector) {
        return Ok(id.clone());
    }
    if doc.node(selector).is_some() {
        return Ok(selector.to_string());
    }
    let wanted = selector.trim().to_lowercase();
    let matches: Vec<&Node> = doc
        .nodes
        .iter()
        .filter(|node| {
            node.display_label()
                .map(|label| label.trim().to_lowercase())
                == Some(wanted.clone())
        })
        .collect();
    match matches.as_slice() {
        [node] => Ok(node.id.clone()),
        [] => Err(format!("no node called \"{selector}\"{}", available(doc))),
        many => Err(format!(
            "\"{selector}\" matches {} nodes; use one of these ids: {}",
            many.len(),
            many.iter()
                .map(|node| node.id.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

/// Listing what does exist turns a dead end into a one-step correction.
fn available(doc: &Doc) -> String {
    let labels: Vec<String> = doc
        .nodes
        .iter()
        .filter_map(|node| node.display_label())
        .filter(|label| !label.is_empty())
        .take(15)
        .map(|label| format!("\"{label}\""))
        .collect();

    if labels.is_empty() {
        " — the diagram is empty".to_string()
    } else {
        format!(" — the diagram has: {}", labels.join(", "))
    }
}

fn resolve_edge(doc: &Doc, aliases: &Aliases, selector: &str) -> Result<String, String> {
    if let Some(id) = aliases.edges.get(selector) {
        return Ok(id.clone());
    }
    if doc.edge(selector).is_some() {
        return Ok(selector.to_string());
    }
    Err(format!(
        "no connection called \"{selector}\" — connections are: {}",
        if doc.edges.is_empty() {
            "none yet".to_string()
        } else {
            doc.edges
                .iter()
                .map(|edge| edge.id.as_str())
                .take(15)
                .collect::<Vec<_>>()
                .join(", ")
        }
    ))
}

/// How an icon request was satisfied, so the caller can say so.
enum IconMatch {
    Asked,
    Searched,
    None,
}

/// Never fails: a diagram with a plain box beats a refused edit, and the note
/// tells the caller to search and correct it.
fn resolve_icon(index: &IconIndex, query: &str) -> (IconEntry, IconMatch) {
    if let Some(entry) = index.get(query) {
        return (entry.clone(), IconMatch::Asked);
    }
    if index.is_empty() {
        // Explicit ids still have a derivable path. A search term does not.
        return if query.contains(':') {
            (synthetic(query), IconMatch::Asked)
        } else {
            (synthetic(icons::FALLBACK_ICON), IconMatch::None)
        };
    }
    match index.search(query, 1).first() {
        Some(hit) => (hit.entry.clone(), IconMatch::Searched),
        None => (
            index
                .get(icons::FALLBACK_ICON)
                .cloned()
                .unwrap_or_else(|| synthetic(icons::FALLBACK_ICON)),
            IconMatch::None,
        ),
    }
}

fn synthetic(id: &str) -> IconEntry {
    IconEntry {
        id: id.to_string(),
        name: id.to_string(),
        path: icons::path_from_id(id),
        category: icons::category_from_id(id),
        subcategory: None,
        mono: None,
    }
}

fn one_of<'a>(value: &'a str, allowed: &[&str], field: &str) -> Result<&'a str, String> {
    if allowed.contains(&value) {
        Ok(value)
    } else {
        Err(format!(
            "{field} \"{value}\" is not valid — use one of: {}",
            allowed.join(", ")
        ))
    }
}

/// Optional metadata: a blank value removes the key instead of storing "".
fn set_or_clear(data: &mut doc::DataMap, key: &str, value: &str) {
    if value.is_empty() {
        data.remove(key);
    } else {
        doc::set_data_str(data, key, value);
    }
}

fn one_of_upper(value: &str, allowed: &[&str], field: &str) -> Result<String, String> {
    let upper = value.to_uppercase();
    if allowed.contains(&upper.as_str()) {
        Ok(upper)
    } else {
        Err(format!(
            "{field} \"{value}\" is not valid — use one of: {}",
            allowed.join(", ")
        ))
    }
}

/// Children of a deleted boundary keep their place on the canvas by absorbing
/// the boundary's own offset and attaching to its parent.
fn promote_orphans(doc: &mut Doc, doomed: &HashSet<String>) {
    let moves: Vec<(String, Point, Option<String>)> = doc
        .nodes
        .iter()
        .filter_map(|node| {
            let mut ancestor_id = node.parent_id.clone()?;
            if !doomed.contains(&ancestor_id) {
                return None;
            }
            // Nested boundaries can be deleted together, so climb until an
            // ancestor survives, absorbing each offset on the way up.
            let mut position = node.position;
            for _ in 0..doc.nodes.len() {
                let Some(ancestor) = doc.node(&ancestor_id) else {
                    break;
                };
                position.x += ancestor.position.x;
                position.y += ancestor.position.y;
                match ancestor.parent_id.clone() {
                    Some(next) if doomed.contains(&next) => ancestor_id = next,
                    next => return Some((node.id.clone(), position, next)),
                }
            }
            Some((node.id.clone(), position, None))
        })
        .collect();

    for (id, position, grandparent) in moves {
        if let Some(node) = doc.node_mut(&id) {
            node.position = position;
            node.extent = grandparent.as_ref().map(|_| "parent".to_string());
            node.parent_id = grandparent;
        }
    }
}
