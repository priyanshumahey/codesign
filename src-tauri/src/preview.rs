//! Thumbnail data for the launcher.
//!
//! Enough of a document to draw it for real — icons, labels, boundary colours —
//! with the coordinate work (parent offsets, bounding box) done here so the
//! launcher never has to know how nesting works. Everything the tile cannot
//! show at that size is dropped.

use codesign_core::doc::{data_str, NodeKind};
use codesign_core::{store, Doc};
use serde::Serialize;

/// Enough to read the shape of a diagram; more is just slower to draw.
const MAX_NODES: usize = 240;
const MAX_EDGES: usize = 240;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewNode {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mono: Option<bool>,
}

/// Endpoints only: where a line actually attaches is a canvas concern.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewEdge {
    pub source: String,
    pub target: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacePreview {
    pub path: String,
    /// Bounding box of the content, with the origin moved to zero.
    pub width: f64,
    pub height: f64,
    pub nodes: Vec<PreviewNode>,
    pub edges: Vec<PreviewEdge>,
}

fn preview(path: &str) -> Option<SpacePreview> {
    let record = store::read(std::path::Path::new(path)).ok()?;
    Some(from_doc(path, &record.document))
}

fn from_doc(path: &str, doc: &Doc) -> SpacePreview {
    let mut nodes: Vec<PreviewNode> = Vec::new();

    for node in doc.nodes.iter().take(MAX_NODES) {
        let at = doc.absolute_position(node);
        let size = node.size();
        let label = match node.kind {
            NodeKind::Note => data_str(&node.data, "text"),
            _ => data_str(&node.data, "label"),
        };
        nodes.push(PreviewNode {
            id: node.id.clone(),
            x: at.x,
            y: at.y,
            width: size.width,
            height: size.height,
            kind: node.kind.as_str().to_string(),
            color: match node.kind {
                NodeKind::Boundary => data_str(&node.data, "color").map(str::to_string),
                _ => None,
            },
            label: label.filter(|text| !text.is_empty()).map(str::to_string),
            icon: data_str(&node.data, "iconPath").map(str::to_string),
            mono: node.data.get("iconMono").and_then(|value| value.as_bool()),
        });
    }

    let known: std::collections::HashSet<&str> =
        nodes.iter().map(|node| node.id.as_str()).collect();
    let edges: Vec<PreviewEdge> = doc
        .edges
        .iter()
        .take(MAX_EDGES)
        .filter(|edge| known.contains(edge.source.as_str()) && known.contains(edge.target.as_str()))
        .map(|edge| PreviewEdge {
            source: edge.source.clone(),
            target: edge.target.clone(),
        })
        .collect();

    if nodes.is_empty() {
        return SpacePreview {
            path: path.to_string(),
            width: 0.0,
            height: 0.0,
            nodes,
            edges: Vec::new(),
        };
    }

    let min_x = nodes.iter().map(|n| n.x).fold(f64::MAX, f64::min);
    let min_y = nodes.iter().map(|n| n.y).fold(f64::MAX, f64::min);
    let max_x = nodes.iter().map(|n| n.x + n.width).fold(f64::MIN, f64::max);
    let max_y = nodes
        .iter()
        .map(|n| n.y + n.height)
        .fold(f64::MIN, f64::max);

    // Shift to a zero origin so the tile only has to scale.
    for node in &mut nodes {
        node.x -= min_x;
        node.y -= min_y;
    }

    SpacePreview {
        path: path.to_string(),
        width: (max_x - min_x).max(1.0),
        height: (max_y - min_y).max(1.0),
        nodes,
        edges,
    }
}

/// Batched: the launcher shows a whole grid at once, and one round trip per
/// tile is noticeably slower than one for all of them.
#[tauri::command]
pub fn space_previews(paths: Vec<String>) -> Vec<SpacePreview> {
    paths.iter().filter_map(|path| preview(path)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn nesting_is_flattened_and_moved_to_the_origin() {
        let doc: Doc = serde_json::from_value(json!({
            "nodes": [
                { "id": "b", "type": "boundary", "position": { "x": 400.0, "y": 200.0 },
                  "width": 340.0, "height": 240.0, "data": { "color": "sky", "label": "VPC" } },
                { "id": "n", "type": "service", "position": { "x": 32.0, "y": 56.0 },
                  "parentId": "b", "data": { "label": "DB", "iconPath": "/icons/aws/dynamodb.svg" } }
            ],
            "edges": []
        }))
        .unwrap();

        let preview = from_doc("x", &doc);
        assert_eq!(preview.nodes.len(), 2);
        assert_eq!(preview.nodes[0].x, 0.0, "the boundary anchors the origin");
        assert_eq!(preview.nodes[0].color.as_deref(), Some("sky"));
        assert_eq!(preview.nodes[0].label.as_deref(), Some("VPC"));
        // The child sat at 432,256 absolute, so 32,56 once shifted.
        assert_eq!(preview.nodes[1].x, 32.0);
        assert_eq!(preview.nodes[1].y, 56.0);
        assert_eq!(
            preview.nodes[1].icon.as_deref(),
            Some("/icons/aws/dynamodb.svg")
        );
        assert_eq!(preview.width, 340.0);
    }

    #[test]
    fn a_note_carries_its_text_as_the_label() {
        let doc: Doc = serde_json::from_value(json!({
            "nodes": [{ "id": "n", "type": "note", "position": { "x": 0.0, "y": 0.0 },
                        "data": { "text": "server orders mutations" } }],
            "edges": []
        }))
        .unwrap();
        assert_eq!(
            from_doc("x", &doc).nodes[0].label.as_deref(),
            Some("server orders mutations")
        );
    }

    #[test]
    fn edges_keep_their_endpoints_and_drop_dangling_ones() {
        let doc: Doc = serde_json::from_value(json!({
            "nodes": [
                { "id": "a", "type": "service", "position": { "x": 0.0, "y": 0.0 }, "data": {} },
                { "id": "b", "type": "service", "position": { "x": 300.0, "y": 0.0 }, "data": {} }
            ],
            "edges": [{ "id": "e", "type": "system", "source": "a", "target": "b", "data": {} }]
        }))
        .unwrap();

        let preview = from_doc("x", &doc);
        assert_eq!(preview.edges.len(), 1);
        assert_eq!(preview.edges[0].source, "a");
        assert_eq!(preview.edges[0].target, "b");
    }

    #[test]
    fn an_empty_space_previews_as_nothing() {
        let preview = from_doc("x", &Doc::default());
        assert!(preview.nodes.is_empty());
        assert_eq!(preview.width, 0.0);
    }
}
