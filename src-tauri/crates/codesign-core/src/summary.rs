//! Compact text rendering of a document for model context.
//!
//! Raw document JSON is mostly coordinates and icon paths — expensive and
//! distracting. This renders the structure a model actually reasons about:
//! what exists, what it is called, what contains it, and what talks to what.

use crate::doc::{data_str, Doc, Node, NodeKind};

pub fn summarize(doc: &Doc) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "{} node(s), {} connection(s)\n",
        doc.nodes.len(),
        doc.edges.len()
    ));

    if doc.nodes.is_empty() {
        out.push_str("(empty canvas)\n");
        return out;
    }

    out.push_str("\nnodes:\n");
    write_children(doc, None, 1, &mut out);

    if !doc.edges.is_empty() {
        out.push_str("\nconnections:\n");
        for edge in &doc.edges {
            let method = data_str(&edge.data, "method")
                .map(|m| format!(" {m}"))
                .unwrap_or_default();
            let endpoint = data_str(&edge.data, "endpoint")
                .map(|e| format!(" {e}"))
                .unwrap_or_default();
            let label = data_str(&edge.data, "label")
                .map(|l| format!(" \"{l}\""))
                .unwrap_or_default();
            let direction = data_str(&edge.data, "direction").unwrap_or("forward");
            let arrow = if direction == "backward" {
                "<-"
            } else if direction == "both" {
                "<->"
            } else {
                "->"
            };
            out.push_str(&format!(
                "  {} {} {} {}{method}{endpoint}{label}\n",
                edge.id, edge.source, arrow, edge.target
            ));
        }
    }

    out
}

fn write_children(doc: &Doc, parent: Option<&str>, depth: usize, out: &mut String) {
    for node in doc.children_of(parent) {
        let indent = "  ".repeat(depth);
        out.push_str(&format!("{indent}{}\n", describe(node)));
        if matches!(node.kind, NodeKind::Boundary) {
            write_children(doc, Some(&node.id), depth + 1, out);
        }
    }
}

fn describe(node: &Node) -> String {
    let label = node.display_label().unwrap_or("");
    let mut line = format!("{} [{}] \"{}\"", node.id, node.kind.as_str(), label);
    if let Some(icon) = data_str(&node.data, "iconId") {
        line.push_str(&format!(" icon={icon}"));
    }
    if let Some(color) = data_str(&node.data, "color") {
        line.push_str(&format!(" color={color}"));
    }
    if let Some(description) = data_str(&node.data, "description") {
        line.push_str(&format!(" — {description}"));
    }
    line
}
