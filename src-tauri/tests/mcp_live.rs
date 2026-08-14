//! The MCP server and the running app share `.codesign` files, so what one
//! writes the other has to be able to read and notice.

use std::path::{Path, PathBuf};

use codesign_core::icons::IconIndex;
use codesign_core::mcp::{FileBackend, Server};
use codesign_core::store;
use codesign_lib::spaces;
use serde_json::{json, Value};

fn scratch_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir()
        .join("codesign-tests")
        .join(format!("{name}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).expect("scratch dir");
    dir
}

fn server(dir: &Path) -> Server<FileBackend> {
    Server::new(
        FileBackend::new(dir.to_path_buf()),
        IconIndex::empty(),
        false,
    )
}

fn call<B: codesign_core::mcp::Backend>(
    server: &mut Server<B>,
    name: &str,
    arguments: Value,
) -> Value {
    let response = server
        .handle(&json!({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": { "name": name, "arguments": arguments }
        }))
        .expect("a request gets a response");
    let result = response["result"].clone();
    assert_eq!(result["isError"], false, "{}", result["content"][0]["text"]);
    result
}

/// Everything the desktop app needs in order to open a file the MCP server
/// created from scratch.
#[test]
fn the_app_can_open_what_mcp_writes() {
    let dir = scratch_dir("mcp-writes");
    let mut server = server(&dir);

    call(&mut server, "create_space", json!({ "name": "Shared" }));
    call(
        &mut server,
        "edit_space",
        json!({
            "space": "Shared",
            "ops": [
                { "op": "create_boundary", "label": "Backend", "alias": "b", "color": "sky" },
                { "op": "create_service", "icon": "aws:dynamodb", "label": "Orders DB", "alias": "db", "parent": "b" },
                { "op": "create_service", "icon": "generic:network:api-gateway", "label": "Gateway", "alias": "gw" },
                { "op": "connect", "source": "gw", "target": "db", "method": "POST", "endpoint": "/orders" },
                { "op": "auto_layout" }
            ]
        }),
    );

    let path = dir.join("Shared.codesign");
    let space = spaces::poll_space(path.to_string_lossy().to_string(), 0)
        .expect("the app's reader should accept the file")
        .expect("the file exists");

    assert_eq!(space.name, "Shared");
    assert_eq!(space.document.nodes.len(), 3);
    assert_eq!(space.document.edges.len(), 1);

    // The canvas needs these fields on every node or it cannot render them.
    for node in &space.document.nodes {
        assert!(node["id"].is_string(), "missing id: {node}");
        assert!(node["type"].is_string(), "missing type: {node}");
        assert!(
            node["position"]["x"].is_number(),
            "missing position: {node}"
        );
    }
    let edge = &space.document.edges[0];
    assert_eq!(edge["type"], "system");
    assert_eq!(edge["data"]["method"], "POST");
}

/// The app polls for outside changes; an MCP edit has to look newer than the
/// app's last save.
#[test]
fn the_app_notices_an_mcp_edit_and_then_settles() {
    let dir = scratch_dir("mcp-poll");
    let mut server = server(&dir);
    call(&mut server, "create_space", json!({ "name": "Watched" }));

    let path = dir.join("Watched.codesign").to_string_lossy().to_string();
    let opened = spaces::poll_space(path.clone(), 0)
        .unwrap()
        .expect("just created");
    let seen_at = opened.updated_at;

    // Nothing has changed, so the app should stay put.
    assert!(
        spaces::poll_space(path.clone(), seen_at).unwrap().is_none(),
        "an unchanged file should not trigger a reload"
    );

    call(
        &mut server,
        "edit_space",
        json!({
            "space": "Watched",
            "ops": [{ "op": "create_service", "icon": "aws:dynamodb", "label": "Added by MCP" }]
        }),
    );

    let changed = spaces::poll_space(path.clone(), seen_at)
        .unwrap()
        .expect("the app should see the external edit");
    assert_eq!(changed.document.nodes.len(), 1);
    assert_eq!(changed.document.nodes[0]["data"]["label"], "Added by MCP");
    assert!(changed.updated_at > seen_at);

    // Once adopted, it should go quiet again.
    assert!(spaces::poll_space(path, changed.updated_at)
        .unwrap()
        .is_none());
}

/// A file the desktop app wrote must remain editable by the MCP server without
/// dropping data owned by the UI.
#[test]
fn mcp_can_edit_what_the_app_wrote() {
    let dir = scratch_dir("app-writes");
    let path = dir.join("FromApp.codesign");

    std::fs::write(
        &path,
        serde_json::to_string_pretty(&json!({
            "version": 1,
            "id": "11111111-2222-3333-4444-555555555555",
            "name": "FromApp",
            "createdAt": 1_700_000_000_000i64,
            "updatedAt": 1_700_000_000_000i64,
            "document": {
                "nodes": [{
                    "id": "boundary-1", "type": "boundary",
                    "position": { "x": 10.0, "y": 20.0 },
                    "data": { "label": "Backend", "somethingTheUiAdded": 7 }
                }],
                "edges": []
            }
        }))
        .unwrap(),
    )
    .unwrap();

    let mut server = server(&dir);
    call(
        &mut server,
        "edit_space",
        json!({
            "space": "FromApp",
            "ops": [{ "op": "create_service", "icon": "aws:dynamodb", "label": "DB", "parent": "Backend" }]
        }),
    );

    let record = store::read(&path).expect("still readable");
    assert_eq!(record.document.nodes.len(), 2);

    let boundary = record
        .document
        .node("boundary-1")
        .expect("boundary survived");
    assert_eq!(boundary.kind.as_str(), "boundary");
    assert_eq!(
        boundary.data.get("somethingTheUiAdded"),
        Some(&json!(7)),
        "unknown UI fields must survive a round trip"
    );

    let child = record
        .document
        .nodes
        .iter()
        .find(|node| node.id != "boundary-1")
        .unwrap();
    assert_eq!(child.parent_id.as_deref(), Some("boundary-1"));
}

/// The desktop app hands out a config pinned to one space. That server must
/// offer no way to reach any other diagram.
#[test]
fn a_pinned_server_exposes_only_its_own_space() {
    let dir = scratch_dir("mcp-pinned");
    let mut folder = server(&dir);
    call(&mut folder, "create_space", json!({ "name": "Mine" }));
    call(&mut folder, "create_space", json!({ "name": "Theirs" }));

    let backend = codesign_core::mcp::SpaceBackend::open(dir.join("Mine.codesign"))
        .expect("opens the pinned space");
    let mut pinned = Server::new(backend, IconIndex::empty(), false);

    let listed = pinned
        .handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }))
        .expect("responds");
    let tools = listed["result"]["tools"].as_array().unwrap();
    let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();

    assert!(
        !names.contains(&"create_space"),
        "pinned servers must not create spaces"
    );
    assert!(
        !names.contains(&"list_spaces"),
        "pinned servers must not browse"
    );
    assert!(names.contains(&"edit_space") && names.contains(&"get_space"));

    // No `space` argument means no way to name a different file.
    for tool in tools {
        let required = tool["inputSchema"]["required"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        assert!(
            !required.iter().any(|value| value == "space"),
            "{} still asks for a space",
            tool["name"]
        );
    }

    // Editing works without naming anything.
    let result = call(
        &mut pinned,
        "edit_space",
        json!({ "ops": [{ "op": "create_service", "icon": "aws:dynamodb", "label": "Added" }] }),
    );
    assert!(result["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Added"));

    // ...and only the pinned file changed.
    assert_eq!(
        store::read(&dir.join("Mine.codesign"))
            .unwrap()
            .document
            .nodes
            .len(),
        1
    );
    assert_eq!(
        store::read(&dir.join("Theirs.codesign"))
            .unwrap()
            .document
            .nodes
            .len(),
        0
    );
}
