//! End-to-end agent test against the live Gemini API.
//!
//! Ignored by default because it costs money and needs credentials. Run with:
//! `cargo test -p codesign --test agent_live -- --ignored --nocapture`

use std::sync::{Arc, Mutex};

use codesign_core::{Doc, IconIndex};
use codesign_lib::ai::agent;
use codesign_lib::ai::gemini::{AdcCredentials, GeminiProvider, Transport};
use codesign_lib::ai::provider::Message;
use codesign_lib::ai::AgentEvent;

fn icons() -> IconIndex {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../public/icons-manifest.json");
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| IconIndex::from_manifest_json(&raw).ok())
        .unwrap_or_else(IconIndex::empty)
}

#[tokio::test]
#[ignore = "calls the live Gemini API"]
async fn the_agent_builds_a_diagram_from_one_sentence() {
    let project = std::env::var("GOOGLE_CLOUD_PROJECT").ok().or_else(|| {
        AdcCredentials::load()
            .ok()
            .and_then(|creds| creds.quota_project_id)
    });
    let Some(project) = project else {
        eprintln!("skipped: no Google Cloud project available");
        return;
    };

    let provider = Arc::new(GeminiProvider::new(Transport::Vertex {
        project,
        location: "global".to_string(),
    }));

    let events = Arc::new(Mutex::new(Vec::<String>::new()));
    let failures = Arc::new(Mutex::new(Vec::<String>::new()));
    let emit: agent::Emit = {
        let events = events.clone();
        let failures = failures.clone();
        Arc::new(move |event| {
            if let AgentEvent::ToolResult {
                name,
                message,
                ok: false,
            } = &event
            {
                failures.lock().unwrap().push(format!("{name}: {message}"));
            }
            let line = match &event {
                AgentEvent::Text { delta } => format!("text {delta}"),
                AgentEvent::ToolCall { name, .. } => format!("call {name}"),
                AgentEvent::ToolResult { name, message, ok } => {
                    format!("result {name} ok={ok} {message}")
                }
                AgentEvent::Document { .. } => "document".to_string(),
                AgentEvent::Usage { input, output } => format!("usage {input}->{output}"),
                AgentEvent::Error { message } => format!("error {message}"),
                AgentEvent::Done => "done".to_string(),
            };
            events.lock().unwrap().push(line);
        })
    };

    let prompt = std::env::var("CODESIGN_PROMPT");
    let custom = prompt.is_ok();
    let prompt = prompt.unwrap_or_else(|_| {
        "Design a simple order service: an API gateway, an orders API, a Postgres \
         database and a Redis cache. Connect them sensibly and put the backend \
         pieces inside a boundary."
            .to_string()
    });
    let mut history = vec![Message::user(prompt)];

    let doc = agent::run_turn(
        provider,
        std::env::var("CODESIGN_MODEL")
            .unwrap_or_else(|_| codesign_lib::ai::DEFAULT_MODEL.to_string()),
        Arc::new(icons()),
        Doc::default(),
        &mut history,
        Vec::new(),
        emit,
    )
    .await
    .expect("the turn should complete");

    for line in events.lock().unwrap().iter() {
        eprintln!("{line}");
    }
    eprintln!("\n{}", codesign_core::summary::summarize(&doc));

    // Nothing may overlap, or the diagram is unreadable however good the content.
    let mut boxes: Vec<(String, f64, f64, f64, f64)> = Vec::new();
    for node in &doc.nodes {
        let at = doc.absolute_position(node);
        let size = node.size();
        if node.kind == codesign_core::NodeKind::Boundary {
            continue;
        }
        boxes.push((node.id.clone(), at.x, at.y, size.width, size.height));
    }
    for (index, a) in boxes.iter().enumerate() {
        for b in boxes.iter().skip(index + 1) {
            let apart =
                a.1 + a.3 <= b.1 || b.1 + b.3 <= a.1 || a.2 + a.4 <= b.2 || b.2 + b.4 <= a.2;
            assert!(apart, "{} overlaps {}", a.0, b.0);
        }
    }

    // Children must sit within the bounds of the boundary that holds them.
    for node in &doc.nodes {
        let Some(parent) = node.parent_id.as_deref().and_then(|id| doc.node(id)) else {
            continue;
        };
        let child = doc.absolute_position(node);
        let origin = doc.absolute_position(parent);
        let (size, room) = (node.size(), parent.size());
        assert!(
            child.x >= origin.x
                && child.y >= origin.y
                && child.x + size.width <= origin.x + room.width
                && child.y + size.height <= origin.y + room.height,
            "{} spills out of {}",
            node.id,
            parent.id
        );
    }

    // A tool call failing means the agent had to guess again — the thing that
    // made a real session take three tries to draw three boxes.
    let failed = failures.lock().unwrap().clone();
    assert!(
        failed.is_empty(),
        "tool calls failed:\n  {}",
        failed.join("\n  ")
    );

    if !custom {
        assert!(
            doc.nodes.len() >= 4,
            "expected at least 4 nodes, got {}",
            doc.nodes.len()
        );
        assert!(
            doc.edges.len() >= 3,
            "expected at least 3 edges, got {}",
            doc.edges.len()
        );
        assert!(
            doc.nodes
                .iter()
                .any(|node| node.kind == codesign_core::NodeKind::Boundary),
            "expected a boundary"
        );
    } else {
        assert!(!doc.nodes.is_empty(), "nothing was drawn");
    }

    // Every service must carry icon fields the canvas can actually render.
    for node in doc
        .nodes
        .iter()
        .filter(|n| n.kind == codesign_core::NodeKind::Service)
    {
        let path = codesign_core::doc::data_str(&node.data, "iconPath").unwrap_or_default();
        assert!(
            path.starts_with("/icons/"),
            "bad icon path on {}: {path}",
            node.id
        );
    }

    // Children must sit inside the boundary they were assigned to.
    for node in &doc.nodes {
        if let Some(parent) = node.parent_id.as_deref() {
            assert!(
                doc.node(parent).is_some(),
                "{} points at a missing parent",
                node.id
            );
        }
    }
}
