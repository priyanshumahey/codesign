//! Behavioural tests for the op layer — the contract every front door relies on.

use codesign_core::doc::{data_str, Doc, NodeKind, Point, Size};
use codesign_core::icons::{path_from_id, IconEntry, IconIndex};
use codesign_core::ops::{op_from_tool_call, Op};
use codesign_core::{apply, Aliases, ApplyCtx, IdGen};
use serde_json::json;

fn icons() -> IconIndex {
    IconIndex::from_entries(vec![
        icon("aws:dynamodb", "DynamoDB"),
        icon("generic:network:api-gateway", "API Gateway"),
        icon("tech-logos:postgresql", "PostgreSQL"),
    ])
}

fn icon(id: &str, name: &str) -> IconEntry {
    IconEntry {
        id: id.to_string(),
        name: name.to_string(),
        path: path_from_id(id),
        category: id.split(':').next().unwrap().to_string(),
        subcategory: None,
        mono: None,
    }
}

fn run(doc: &Doc, ops: &[Op]) -> Doc {
    let index = icons();
    let mut ids = IdGen::fixed("t", "abcd");
    let mut aliases = Aliases::default();
    let mut ctx = ApplyCtx::new(&mut ids, &index, &mut aliases);
    apply(doc, ops, &mut ctx).expect("ops should apply").doc
}

fn try_run(doc: &Doc, ops: &[Op]) -> Result<Doc, String> {
    let index = icons();
    let mut ids = IdGen::fixed("t", "abcd");
    let mut aliases = Aliases::default();
    let mut ctx = ApplyCtx::new(&mut ids, &index, &mut aliases);
    apply(doc, ops, &mut ctx)
        .map(|applied| applied.doc)
        .map_err(|error| error.message)
}

fn ops(values: serde_json::Value) -> Vec<Op> {
    serde_json::from_value(values).expect("ops should deserialize")
}

#[test]
fn creates_a_service_with_resolved_icon_fields() {
    let doc = run(
        &Doc::default(),
        &ops(json!([{ "op": "create_service", "icon": "aws:dynamodb", "label": "Orders DB" }])),
    );

    assert_eq!(doc.nodes.len(), 1);
    let node = &doc.nodes[0];
    assert_eq!(node.kind, NodeKind::Service);
    assert_eq!(node.id, "node-t-abcd0");
    assert_eq!(data_str(&node.data, "label"), Some("Orders DB"));
    assert_eq!(data_str(&node.data, "iconId"), Some("aws:dynamodb"));
    assert_eq!(
        data_str(&node.data, "iconPath"),
        Some("/icons/aws/dynamodb.svg")
    );
    assert_eq!(data_str(&node.data, "iconCategory"), Some("aws"));
}

#[test]
fn a_plain_search_term_resolves_to_an_icon() {
    let doc = run(
        &Doc::default(),
        &ops(json!([{ "op": "create_service", "icon": "postgres", "label": "DB" }])),
    );
    assert_eq!(
        data_str(&doc.nodes[0].data, "iconId"),
        Some("tech-logos:postgresql")
    );
}

/// Reported from a real session: an unmatched icon aborted the whole op, so the
/// node never got created and the agent thrashed trying to connect to it.
#[test]
fn an_unmatched_icon_still_creates_the_node() {
    let doc = run(
        &Doc::default(),
        &ops(
            json!([{ "op": "create_service", "icon": "something nobody drew", "label": "Client" }]),
        ),
    );

    assert_eq!(doc.nodes.len(), 1);
    assert_eq!(data_str(&doc.nodes[0].data, "label"), Some("Client"));
    let icon = data_str(&doc.nodes[0].data, "iconId").unwrap_or_default();
    assert!(!icon.is_empty(), "the node should still have an icon");
}

#[test]
fn a_search_term_without_a_manifest_uses_the_fallback_icon() {
    let mut ids = IdGen::fixed("t", "abcd");
    let mut aliases = Aliases::default();
    let index = IconIndex::empty();
    let mut ctx = ApplyCtx::new(&mut ids, &index, &mut aliases);
    let operations = ops(json!([{ "op": "create_service", "icon": "postgres", "label": "DB" }]));

    let doc = apply(&Doc::default(), &operations, &mut ctx)
        .expect("op should apply")
        .doc;

    assert_eq!(
        data_str(&doc.nodes[0].data, "iconId"),
        Some(codesign_core::icons::FALLBACK_ICON)
    );
}

#[test]
fn aliases_let_one_batch_build_a_connected_graph() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "generic:network:api-gateway", "label": "Gateway", "alias": "gw" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Orders DB", "alias": "db" },
            { "op": "connect", "source": "gw", "target": "db", "method": "post", "endpoint": "/orders" },
        ])),
    );

    assert_eq!(doc.edges.len(), 1);
    let edge = &doc.edges[0];
    assert_eq!(edge.source, "node-t-abcd0");
    assert_eq!(edge.target, "node-t-abcd1");
    assert_eq!(edge.kind, "system");
    // Lowercase methods from a model are normalised rather than rejected.
    assert_eq!(data_str(&edge.data, "method"), Some("POST"));
}

#[test]
fn nodes_can_be_addressed_by_label() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Orders DB" },
            { "op": "update_node", "node": "Orders DB", "description": "Primary store" },
        ])),
    );
    assert_eq!(
        data_str(&doc.nodes[0].data, "description"),
        Some("Primary store")
    );
}

#[test]
fn an_ambiguous_label_reports_the_candidates() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Cache" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Cache" },
        ])),
    );

    let error = try_run(
        &doc,
        &ops(json!([{ "op": "update_node", "node": "Cache", "label": "x" }])),
    )
    .expect_err("ambiguous label should fail");
    assert!(error.contains("matches 2 nodes"), "{error}");
}

#[test]
fn children_are_stored_relative_to_their_boundary() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_boundary", "label": "VPC", "alias": "vpc", "position": { "x": 100.0, "y": 200.0 } },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "DB", "parent": "vpc", "position": { "x": 150.0, "y": 260.0 } },
        ])),
    );

    let child = doc.node("node-t-abcd1").expect("child exists");
    assert_eq!(child.parent_id.as_deref(), Some("boundary-t-abcd0"));
    assert_eq!(child.extent.as_deref(), Some("parent"));
    assert_eq!(child.position, Point { x: 50.0, y: 60.0 });
    assert_eq!(doc.absolute_position(child), Point { x: 150.0, y: 260.0 });
}

#[test]
fn boundaries_are_listed_before_their_children() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "aws:dynamodb", "label": "DB" },
            { "op": "create_boundary", "label": "VPC", "alias": "vpc" },
            { "op": "set_parent", "node": "DB", "parent": "vpc" },
        ])),
    );
    assert_eq!(doc.nodes[0].kind, NodeKind::Boundary);
}

#[test]
fn nested_boundaries_are_listed_after_their_parents() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_boundary", "label": "Inner", "alias": "inner" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "DB", "parent": "inner" },
            { "op": "create_boundary", "label": "Outer", "alias": "outer" },
            { "op": "set_parent", "node": "inner", "parent": "outer" },
        ])),
    );

    let ids: Vec<&str> = doc.nodes.iter().map(|node| node.id.as_str()).collect();
    assert_eq!(
        ids,
        ["boundary-t-abcd2", "boundary-t-abcd0", "node-t-abcd1"]
    );
}

#[test]
fn reparenting_keeps_the_node_where_it_looks() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_boundary", "label": "VPC", "alias": "vpc", "position": { "x": 400.0, "y": 400.0 } },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "DB", "position": { "x": 500.0, "y": 480.0 } },
            { "op": "set_parent", "node": "DB", "parent": "vpc" },
        ])),
    );

    let child = doc.node("node-t-abcd1").expect("child exists");
    assert_eq!(child.position, Point { x: 100.0, y: 80.0 });
    assert_eq!(doc.absolute_position(child), Point { x: 500.0, y: 480.0 });
}

#[test]
fn placement_avoids_overlapping_siblings() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "aws:dynamodb", "label": "A" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "B" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "C" },
        ])),
    );

    let mut seen: Vec<Point> = Vec::new();
    for node in &doc.nodes {
        let at = doc.absolute_position(node);
        assert!(!seen.contains(&at), "nodes stacked at {at:?}");
        seen.push(at);
    }
}

#[test]
fn deleting_a_node_takes_its_connections() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "aws:dynamodb", "label": "A", "alias": "a" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "B", "alias": "b" },
            { "op": "connect", "source": "a", "target": "b" },
        ])),
    );
    assert_eq!(doc.edges.len(), 1);

    let doc = run(&doc, &ops(json!([{ "op": "delete", "nodes": ["A"] }])));
    assert_eq!(doc.nodes.len(), 1);
    assert!(doc.edges.is_empty(), "dangling edge survived");
}

#[test]
fn connections_to_different_endpoints_are_distinct() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "generic:network:api-gateway", "label": "Client", "alias": "client" },
            { "op": "create_service", "icon": "generic:network:api-gateway", "label": "API", "alias": "api" },
            { "op": "connect", "source": "client", "target": "api", "method": "POST", "endpoint": "/orders" },
            { "op": "connect", "source": "client", "target": "api", "method": "POST", "endpoint": "/payments" },
        ])),
    );

    assert_eq!(doc.edges.len(), 2);
}

#[test]
fn deleting_a_boundary_promotes_its_children_by_default() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_boundary", "label": "VPC", "alias": "vpc", "position": { "x": 100.0, "y": 100.0 } },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "DB", "parent": "vpc", "position": { "x": 160.0, "y": 180.0 } },
        ])),
    );

    let doc = run(&doc, &ops(json!([{ "op": "delete", "nodes": ["VPC"] }])));
    assert_eq!(doc.nodes.len(), 1);
    let survivor = &doc.nodes[0];
    assert_eq!(survivor.parent_id, None);
    assert_eq!(survivor.extent, None);
    // Still exactly where it was on screen.
    assert_eq!(
        doc.absolute_position(survivor),
        Point { x: 160.0, y: 180.0 }
    );
}

#[test]
fn cascade_removes_the_contents_too() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_boundary", "label": "VPC", "alias": "vpc" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "DB", "parent": "vpc" },
        ])),
    );

    let doc = run(
        &doc,
        &ops(json!([{ "op": "delete", "nodes": ["VPC"], "cascade": true }])),
    );
    assert!(doc.nodes.is_empty());
}

#[test]
fn a_failing_op_leaves_the_document_untouched() {
    let before = run(
        &Doc::default(),
        &ops(json!([{ "op": "create_service", "icon": "aws:dynamodb", "label": "A" }])),
    );

    let error = try_run(
        &before,
        &ops(json!([
            { "op": "create_service", "icon": "aws:dynamodb", "label": "B" },
            { "op": "connect", "source": "B", "target": "Nope" },
        ])),
    )
    .expect_err("unknown target should fail");

    assert!(error.contains("no node called \"Nope\""), "{error}");
    assert!(
        error.contains("the diagram has"),
        "should list what exists: {error}"
    );
    assert_eq!(before.nodes.len(), 1, "partial batch was applied");
}

/// Reported from a real session: a bad selector said only that it was bad, so
/// the model guessed again, failed again, then deleted and rebuilt everything.
#[test]
fn a_missing_node_error_names_the_nodes_that_exist() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Client" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Database" },
        ])),
    );

    let error = try_run(
        &doc,
        &ops(json!([{ "op": "connect", "source": "web", "target": "Database" }])),
    )
    .expect_err("unknown source should fail");
    assert!(error.contains("\"Client\""), "{error}");
    assert!(error.contains("\"Database\""), "{error}");
}

#[test]
fn invalid_enums_explain_themselves() {
    let error = try_run(
        &Doc::default(),
        &ops(json!([{ "op": "create_boundary", "label": "X", "color": "chartreuse" }])),
    )
    .expect_err("bad colour should fail");
    assert!(error.contains("slate"), "{error}");
}

#[test]
fn a_boundary_cannot_be_moved_inside_itself() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_boundary", "label": "Outer", "alias": "outer" },
            { "op": "create_boundary", "label": "Inner", "alias": "inner", "parent": "outer" },
        ])),
    );

    let error = try_run(
        &doc,
        &ops(json!([{ "op": "set_parent", "node": "Outer", "parent": "Inner" }])),
    )
    .expect_err("cycle should fail");
    assert!(error.contains("cannot also contain it"), "{error}");
}

#[test]
fn only_boundaries_can_hold_children() {
    let doc = run(
        &Doc::default(),
        &ops(json!([{ "op": "create_service", "icon": "aws:dynamodb", "label": "DB" }])),
    );

    let error = try_run(
        &doc,
        &ops(json!([{ "op": "create_note", "text": "hi", "parent": "DB" }])),
    )
    .expect_err("service parent should fail");
    assert!(error.contains("not a boundary"), "{error}");
}

#[test]
fn documents_round_trip_through_the_on_disk_shape() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_boundary", "label": "VPC", "alias": "vpc" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "DB", "parent": "vpc" },
            { "op": "create_note", "text": "hello" },
        ])),
    );

    let value = doc.to_value().expect("serializes");
    let node = &value["nodes"][0];
    assert_eq!(node["type"], "boundary");
    assert!(node["position"]["x"].is_number());

    let back = Doc::from_value(value).expect("deserializes");
    assert_eq!(back.nodes.len(), doc.nodes.len());
    assert_eq!(back.nodes[1].parent_id, doc.nodes[1].parent_id);
}

#[test]
fn unknown_keys_in_node_data_survive_an_edit() {
    let raw = json!({
        "nodes": [{
            "id": "node-1",
            "type": "service",
            "position": { "x": 0.0, "y": 0.0 },
            "data": { "label": "DB", "somethingTheUiAdded": 42 }
        }],
        "edges": []
    });
    let doc = Doc::from_value(raw).expect("parses");

    let doc = run(
        &doc,
        &ops(json!([{ "op": "update_node", "node": "node-1", "label": "Orders DB" }])),
    );
    assert_eq!(data_str(&doc.nodes[0].data, "label"), Some("Orders DB"));
    assert_eq!(
        doc.nodes[0].data.get("somethingTheUiAdded"),
        Some(&json!(42))
    );
}

#[test]
fn resize_rejects_nonsense() {
    let doc = run(
        &Doc::default(),
        &ops(json!([{ "op": "create_boundary", "label": "VPC" }])),
    );
    let error = try_run(
        &doc,
        &ops(json!([{ "op": "resize_node", "node": "VPC", "size": { "width": 0.0, "height": 10.0 } }])),
    )
    .expect_err("zero width should fail");
    assert!(error.contains("positive"), "{error}");
}

#[test]
fn tool_calls_become_ops() {
    let op = op_from_tool_call(
        "create_service",
        json!({ "icon": "aws:dynamodb", "label": "DB" }),
    )
    .expect("builds an op");
    assert_eq!(op.name(), "create_service");

    let doc = run(&Doc::default(), &[op]);
    assert_eq!(doc.nodes.len(), 1);
}

/// Verbatim function calls from gemini-2.5-flash for the prompt "Add a DynamoDB
/// node called Orders DB, an API gateway called Gateway, and connect the gateway
/// to the database with a POST to /orders." Real model output, so the loose ends
/// are real too: it passes search terms rather than icon ids, and leans on
/// aliases to wire up nodes it has not seen ids for yet.
#[test]
fn a_real_gemini_turn_applies_cleanly() {
    let calls = [
        (
            "create_service",
            json!({ "icon": "dynamodb", "label": "Orders DB", "alias": "orders_db" }),
        ),
        (
            "create_service",
            json!({ "icon": "api gateway", "alias": "gateway", "label": "Gateway" }),
        ),
        (
            "connect",
            json!({ "target": "orders_db", "label": "/orders", "source": "gateway", "method": "POST" }),
        ),
    ];

    let ops: Vec<Op> = calls
        .into_iter()
        .map(|(name, args)| op_from_tool_call(name, args).expect("op parses"))
        .collect();

    let doc = run(&Doc::default(), &ops);

    assert_eq!(doc.nodes.len(), 2);
    assert_eq!(doc.edges.len(), 1);
    assert_eq!(data_str(&doc.nodes[0].data, "iconId"), Some("aws:dynamodb"));
    assert_eq!(
        data_str(&doc.nodes[1].data, "iconId"),
        Some("generic:network:api-gateway")
    );

    let edge = &doc.edges[0];
    assert_eq!(edge.source, doc.nodes[1].id, "gateway should be the source");
    assert_eq!(
        edge.target, doc.nodes[0].id,
        "database should be the target"
    );
    assert_eq!(data_str(&edge.data, "method"), Some("POST"));
}

#[test]
fn every_tool_schema_is_a_plain_object_without_refs() {
    let schemas = codesign_core::tool_schemas();
    assert_eq!(schemas.len(), 11);

    for schema in schemas {
        let text = serde_json::to_string(&schema.parameters).expect("serializes");
        assert!(
            !text.contains("$ref"),
            "{} leaks a $ref: {text}",
            schema.name
        );
        assert!(!text.contains("$schema"), "{} leaks $schema", schema.name);
        assert_eq!(
            schema.parameters["type"], "object",
            "{} is not an object",
            schema.name
        );
        assert!(
            !schema.description.is_empty(),
            "{} has no description",
            schema.name
        );
    }
}

/// An agent applies one tool call at a time, so a handle minted by the first
/// call has to still resolve several calls later.
#[test]
fn aliases_persist_across_separate_apply_calls() {
    let index = icons();
    let mut ids = IdGen::fixed("t", "abcd");
    let mut aliases = Aliases::default();

    let mut doc = Doc::default();
    for batch in [
        json!([{ "op": "create_service", "icon": "aws:dynamodb", "label": "Orders DB", "alias": "db" }]),
        json!([{ "op": "create_service", "icon": "generic:network:api-gateway", "label": "Gateway", "alias": "gw" }]),
        json!([{ "op": "connect", "source": "gw", "target": "db" }]),
    ] {
        let mut ctx = ApplyCtx::new(&mut ids, &index, &mut aliases);
        doc = apply(&doc, &ops(batch), &mut ctx).expect("applies").doc;
    }

    assert_eq!(doc.edges.len(), 1);
    assert_eq!(doc.edges[0].source, "node-t-abcd1");
    assert_eq!(doc.edges[0].target, "node-t-abcd0");
}

#[test]
fn summary_shows_structure_not_coordinates() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_boundary", "label": "Data plane", "alias": "dp", "color": "emerald" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Orders DB", "parent": "dp", "alias": "db" },
            { "op": "create_service", "icon": "generic:network:api-gateway", "label": "Gateway", "alias": "gw" },
            { "op": "connect", "source": "gw", "target": "db", "method": "POST", "endpoint": "/orders" },
        ])),
    );

    let text = codesign_core::summary::summarize(&doc);
    assert!(text.contains("\"Data plane\""), "{text}");
    assert!(text.contains("\"Orders DB\""), "{text}");
    assert!(text.contains("POST /orders"), "{text}");
    assert!(!text.contains("iconPath"), "{text}");
}

#[test]
fn boundary_default_size_is_recorded() {
    let doc = run(
        &Doc::default(),
        &ops(json!([{ "op": "create_boundary", "label": "VPC" }])),
    );
    assert_eq!(
        doc.nodes[0].size(),
        Size {
            width: 340.0,
            height: 240.0
        }
    );
}

/// Reported from a real session: the model issued the same connect twice and
/// two identical lines ended up stacked on the canvas.
#[test]
fn an_identical_connection_is_refused() {
    let doc = run(
        &Doc::default(),
        &ops(json!([
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Docs", "alias": "d" },
            { "op": "create_service", "icon": "aws:dynamodb", "label": "Cache", "alias": "c" },
            { "op": "connect", "source": "d", "target": "c", "method": "QUERY", "label": "read" },
        ])),
    );

    let error = try_run(
        &doc,
        &ops(json!([{ "op": "connect", "source": "Docs", "target": "Cache", "method": "QUERY", "label": "read" }])),
    )
    .expect_err("the duplicate should be refused");
    assert!(error.contains("already connected"), "{error}");

    // A genuinely different relationship between the same pair is still fine.
    let doc = run(
        &doc,
        &ops(
            json!([{ "op": "connect", "source": "Docs", "target": "Cache", "method": "MUTATION", "label": "write" }]),
        ),
    );
    assert_eq!(doc.edges.len(), 2);
}
