//! A Model Context Protocol server over JSON-RPC.
//!
//! The method surface MCP actually needs is small, so this implements it
//! directly rather than taking on an SDK. Transport-agnostic: the stdio binary
//! feeds it lines, and anything else can feed it the same `Value`s.

use serde_json::{json, Value};

use crate::doc::Doc;
use crate::icons::IconIndex;
use crate::ids::IdGen;
use crate::store;
use crate::{apply, summary, Aliases, ApplyCtx, Op};

/// Widely supported version; newer clients are echoed their own.
const DEFAULT_PROTOCOL: &str = "2024-11-05";
const SUPPORTED_PROTOCOLS: [&str; 3] = ["2024-11-05", "2025-03-26", "2025-06-18"];

/// Where spaces are read from and written to. Implemented over the filesystem
/// for headless use, and over a socket to the running app for live edits.
pub trait Backend {
    fn list_spaces(&mut self) -> Result<Value, String>;
    fn create_space(&mut self, name: &str) -> Result<String, String>;
    fn read_space(&mut self, selector: &str) -> Result<(String, Doc), String>;
    fn write_space(&mut self, selector: &str, doc: Doc) -> Result<(), String>;
    /// Describes where edits are landing, for the client to show.
    fn describe(&self) -> String;
    /// The single diagram this server serves, when it serves only one. Pinning
    /// drops the `space` argument from every tool, which is the whole reason a
    /// client agent cannot pick the wrong file.
    fn pinned(&self) -> Option<String> {
        None
    }
}

pub struct Server<B: Backend> {
    backend: B,
    icons: IconIndex,
    ids: IdGen,
    read_only: bool,
}

impl<B: Backend> Server<B> {
    pub fn new(backend: B, icons: IconIndex, read_only: bool) -> Self {
        Self {
            backend,
            icons,
            ids: IdGen::new(),
            read_only,
        }
    }

    /// Handles one JSON-RPC message. `None` means it was a notification and
    /// nothing should be written back.
    pub fn handle(&mut self, request: &Value) -> Option<Value> {
        let method = request
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
        let id = request.get("id").cloned();

        let result = match method {
            "initialize" => Ok(self.initialize(&params)),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": self.tools() })),
            "tools/call" => self.call_tool(&params),
            other => Err(RpcError::method_not_found(other)),
        };

        // Notifications still run, but must never be answered.
        id.map(|id| match result {
            Ok(value) => json!({ "jsonrpc": "2.0", "id": id, "result": value }),
            Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error.to_value() }),
        })
    }

    fn initialize(&self, params: &Value) -> Value {
        let requested = params.get("protocolVersion").and_then(Value::as_str);
        let protocol = requested
            .filter(|version| SUPPORTED_PROTOCOLS.contains(version))
            .unwrap_or(DEFAULT_PROTOCOL);

        let how = if self.backend.pinned().is_some() {
            "Call get_space to see what is there, then edit_space with a batch of ops."
        } else {
            "Call list_spaces first to find a diagram, then edit_space with a batch of ops."
        };

        json!({
            "protocolVersion": protocol,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "codesign", "version": env!("CARGO_PKG_VERSION") },
            "instructions": format!(
                "Read and edit Codesign architecture diagrams. {}\n\
                 {how} Give created nodes an `alias` and reference that alias as the source, \
                 target or parent of later ops in the same batch. Leave positions out; the \
                 canvas places things. Finish with an auto_layout op when you added several \
                 nodes.",
                self.backend.describe()
            ),
        })
    }

    fn tools(&self) -> Vec<Value> {
        let pinned = self.backend.pinned();

        let space_arg = json!({
            "type": "string",
            "description": "Space id, name or file path."
        });

        let mut tools = vec![
            json!({
                "name": "get_space",
                "description": match &pinned {
                    Some(name) => format!("Read \"{name}\" as a compact outline of its nodes and connections."),
                    None => "Read one diagram as a compact outline of its nodes and connections.".to_string(),
                },
                "inputSchema": if pinned.is_some() {
                    json!({ "type": "object", "properties": {} })
                } else {
                    json!({
                        "type": "object",
                        "required": ["space"],
                        "properties": { "space": space_arg }
                    })
                }
            }),
            json!({
                "name": "search_icons",
                "description": "Find icon ids by keyword, for use as the `icon` of create_service.",
                "inputSchema": {
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": { "type": "string" },
                        "limit": { "type": "integer" }
                    }
                }
            }),
        ];

        if pinned.is_none() {
            tools.insert(
                0,
                json!({
                    "name": "list_spaces",
                    "description": "List the available Codesign diagrams.",
                    "inputSchema": { "type": "object", "properties": {} }
                }),
            );
        }

        if !self.read_only {
            if pinned.is_none() {
                tools.push(json!({
                    "name": "create_space",
                    "description": "Create a new, empty diagram.",
                    "inputSchema": {
                        "type": "object",
                        "required": ["name"],
                        "properties": { "name": { "type": "string" } }
                    }
                }));
            }

            let ops_arg = json!({
                "type": "array",
                "description": "Edits to apply in order.",
                "items": crate::ops::op_schema()
            });
            tools.push(json!({
                "name": "edit_space",
                "description": match &pinned {
                    Some(name) => format!(
                        "Apply a batch of edits to \"{name}\". All ops succeed or none do, so a \
                         rejected op leaves the diagram untouched."
                    ),
                    None => "Apply a batch of edits to a diagram. All ops succeed or none do, \
                             so a rejected op leaves the diagram untouched."
                        .to_string(),
                },
                "inputSchema": if pinned.is_some() {
                    json!({
                        "type": "object",
                        "required": ["ops"],
                        "properties": { "ops": ops_arg }
                    })
                } else {
                    json!({
                        "type": "object",
                        "required": ["space", "ops"],
                        "properties": { "space": space_arg, "ops": ops_arg }
                    })
                }
            }));
        }

        tools
    }

    fn call_tool(&mut self, params: &Value) -> Result<Value, RpcError> {
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let args = params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));

        if self.read_only && matches!(name, "edit_space" | "create_space") {
            return Ok(tool_error("this server is running read-only"));
        }

        let outcome = match name {
            "list_spaces" => self.backend.list_spaces().map(|spaces| {
                serde_json::to_string_pretty(&spaces).unwrap_or_else(|_| "[]".to_string())
            }),
            "get_space" => self.get_space(&args),
            "search_icons" => self.search_icons(&args),
            "create_space" => {
                let name = str_arg(&args, "name")?;
                self.backend.create_space(name)
            }
            "edit_space" => self.edit_space(&args),
            other => return Err(RpcError::unknown_tool(other)),
        };

        Ok(match outcome {
            Ok(text) => json!({ "content": [{ "type": "text", "text": text }], "isError": false }),
            Err(message) => tool_error(&message),
        })
    }

    fn get_space(&mut self, args: &Value) -> Result<String, String> {
        let selector = self.selector(args)?;
        let (name, doc) = self.backend.read_space(&selector)?;
        Ok(format!("{name}\n\n{}", summary::summarize(&doc)))
    }

    /// Pinned servers take no `space` argument, so supply it ourselves.
    fn selector(&self, args: &Value) -> Result<String, String> {
        if self.backend.pinned().is_some() {
            return Ok(String::new());
        }
        str_arg(args, "space")
            .map(str::to_string)
            .map_err(|error| error.message)
    }

    fn search_icons(&mut self, args: &Value) -> Result<String, String> {
        let query = str_arg(args, "query").map_err(|error| error.message)?;
        let limit = args
            .get("limit")
            .and_then(Value::as_u64)
            .unwrap_or(10)
            .clamp(1, 25) as usize;
        let hits = self.icons.search(query, limit);
        if hits.is_empty() {
            return Ok(format!("no icons match \"{query}\""));
        }
        Ok(hits
            .into_iter()
            .map(|hit| format!("{} — {}", hit.entry.id, hit.entry.name))
            .collect::<Vec<_>>()
            .join("\n"))
    }

    fn edit_space(&mut self, args: &Value) -> Result<String, String> {
        let selector = self.selector(args)?;
        let raw = args.get("ops").cloned().unwrap_or_else(|| json!([]));
        let ops: Vec<Op> =
            serde_json::from_value(raw).map_err(|e| format!("could not read the ops: {e}"))?;
        if ops.is_empty() {
            return Err("no ops given".to_string());
        }

        let (name, doc) = self.backend.read_space(&selector)?;
        let mut aliases = Aliases::default();
        let mut ctx = ApplyCtx::new(&mut self.ids, &self.icons, &mut aliases);
        let applied = apply(&doc, &ops, &mut ctx).map_err(|error| error.to_string())?;

        let report = applied
            .outcomes
            .iter()
            .map(|outcome| format!("- {}", outcome.message))
            .collect::<Vec<_>>()
            .join("\n");

        let summary = summary::summarize(&applied.doc);
        self.backend.write_space(&selector, applied.doc)?;

        Ok(format!("Updated {name}:\n{report}\n\n{summary}"))
    }
}

fn tool_error(message: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": message }], "isError": true })
}

fn str_arg<'a>(args: &'a Value, key: &str) -> Result<&'a str, RpcError> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| RpcError {
            code: -32602,
            message: format!("\"{key}\" is required"),
        })
}

pub struct RpcError {
    pub code: i32,
    pub message: String,
}
impl RpcError {
    fn method_not_found(method: &str) -> Self {
        Self {
            code: -32601,
            message: format!("unknown method \"{method}\""),
        }
    }

    fn unknown_tool(name: &str) -> Self {
        Self {
            code: -32602,
            message: format!("unknown tool \"{name}\""),
        }
    }

    fn to_value(&self) -> Value {
        json!({ "code": self.code, "message": self.message })
    }
}

/// Reads and writes `.codesign` files in a folder — what the headless server
/// uses, and what makes edits show up in the app when it has the file open.
pub struct FileBackend {
    dir: std::path::PathBuf,
}

impl FileBackend {
    pub fn new(dir: impl Into<std::path::PathBuf>) -> Self {
        Self { dir: dir.into() }
    }
}

impl Backend for FileBackend {
    fn list_spaces(&mut self) -> Result<Value, String> {
        let spaces = store::list(&self.dir).unwrap_or_default();
        serde_json::to_value(spaces).map_err(|e| e.to_string())
    }

    fn create_space(&mut self, name: &str) -> Result<String, String> {
        let record = store::create(&self.dir, name)?;
        Ok(format!(
            "Created \"{}\" at {}",
            record.name,
            record.path.display()
        ))
    }

    fn read_space(&mut self, selector: &str) -> Result<(String, Doc), String> {
        let record = store::find(&self.dir, selector)?;
        Ok((record.name, record.document))
    }

    fn write_space(&mut self, selector: &str, doc: Doc) -> Result<(), String> {
        let mut record = store::find(&self.dir, selector)?;
        record.document = doc;
        record.updated_at = store::next_updated_at(record.updated_at);
        store::write(&record)
    }

    fn describe(&self) -> String {
        format!("Diagrams live in {}.", self.dir.display())
    }
}

/// Serves exactly one diagram. This is the mode the desktop app hands out:
/// the agent cannot pick the wrong file because it is never offered a choice.
pub struct SpaceBackend {
    path: std::path::PathBuf,
    name: String,
}

impl SpaceBackend {
    pub fn open(path: impl Into<std::path::PathBuf>) -> Result<Self, String> {
        let path = path.into();
        let record = store::read(&path)?;
        Ok(Self {
            name: record.name,
            path,
        })
    }
}

impl Backend for SpaceBackend {
    fn list_spaces(&mut self) -> Result<Value, String> {
        Ok(json!([{ "name": self.name, "path": self.path.to_string_lossy() }]))
    }

    fn create_space(&mut self, _name: &str) -> Result<String, String> {
        Err("this server is connected to a single diagram".to_string())
    }

    fn read_space(&mut self, _selector: &str) -> Result<(String, Doc), String> {
        let record = store::read(&self.path)?;
        Ok((record.name, record.document))
    }

    fn write_space(&mut self, _selector: &str, doc: Doc) -> Result<(), String> {
        let mut record = store::read(&self.path)?;
        record.document = doc;
        record.updated_at = store::next_updated_at(record.updated_at);
        store::write(&record)
    }

    fn describe(&self) -> String {
        format!("Connected to \"{}\" at {}.", self.name, self.path.display())
    }

    fn pinned(&self) -> Option<String> {
        Some(self.name.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[derive(Default)]
    struct Memory {
        spaces: HashMap<String, Doc>,
    }

    impl Backend for Memory {
        fn list_spaces(&mut self) -> Result<Value, String> {
            Ok(json!(self.spaces.keys().collect::<Vec<_>>()))
        }
        fn create_space(&mut self, name: &str) -> Result<String, String> {
            self.spaces.insert(name.to_string(), Doc::default());
            Ok(format!("created {name}"))
        }
        fn read_space(&mut self, selector: &str) -> Result<(String, Doc), String> {
            self.spaces
                .get(selector)
                .map(|doc| (selector.to_string(), doc.clone()))
                .ok_or_else(|| format!("no space \"{selector}\""))
        }
        fn write_space(&mut self, selector: &str, doc: Doc) -> Result<(), String> {
            self.spaces.insert(selector.to_string(), doc);
            Ok(())
        }
        fn describe(&self) -> String {
            "in memory".to_string()
        }
    }

    fn server() -> Server<Memory> {
        let mut backend = Memory::default();
        backend.spaces.insert("Demo".to_string(), Doc::default());
        Server::new(backend, IconIndex::empty(), false)
    }

    fn call(server: &mut Server<Memory>, name: &str, arguments: Value) -> Value {
        let response = server
            .handle(&json!({
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": { "name": name, "arguments": arguments }
            }))
            .expect("a request gets a response");
        response["result"].clone()
    }

    #[test]
    fn initialize_agrees_on_a_protocol() {
        let mut server = server();
        let response = server
            .handle(&json!({
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": { "protocolVersion": "2025-06-18" }
            }))
            .expect("responds");
        assert_eq!(response["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(response["result"]["serverInfo"]["name"], "codesign");
    }

    #[test]
    fn an_unknown_protocol_falls_back_to_a_supported_one() {
        let mut server = server();
        let response = server
            .handle(&json!({
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": { "protocolVersion": "1999-01-01" }
            }))
            .expect("responds");
        assert_eq!(response["result"]["protocolVersion"], DEFAULT_PROTOCOL);
    }

    #[test]
    fn a_notification_runs_without_a_response() {
        let mut server = server();
        let response = server.handle(&json!({
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "create_space",
                "arguments": { "name": "Created by notification" }
            }
        }));

        assert!(response.is_none());
        assert!(server
            .backend
            .spaces
            .contains_key("Created by notification"));
    }

    #[test]
    fn notifications_get_no_reply() {
        let mut server = server();
        assert!(server
            .handle(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }))
            .is_none());
    }

    #[test]
    fn tools_are_listed_with_schemas() {
        let mut server = server();
        let response = server
            .handle(&json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }))
            .expect("responds");
        let tools = response["result"]["tools"].as_array().expect("array");
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(names.contains(&"edit_space"));
        assert!(names.contains(&"list_spaces"));

        let edit = tools.iter().find(|t| t["name"] == "edit_space").unwrap();
        assert_eq!(edit["inputSchema"]["properties"]["ops"]["type"], "array");
    }

    #[test]
    fn editing_a_space_applies_and_saves() {
        let mut server = server();
        let result = call(
            &mut server,
            "edit_space",
            json!({
                "space": "Demo",
                "ops": [
                    { "op": "create_service", "icon": "aws:dynamodb", "label": "DB", "alias": "db" },
                    { "op": "create_service", "icon": "aws:aws-lambda", "label": "Worker", "alias": "w" },
                    { "op": "connect", "source": "w", "target": "db" }
                ]
            }),
        );

        assert_eq!(result["isError"], false);
        let text = result["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("added service \"DB\""), "{text}");

        let (_, doc) = server.backend.read_space("Demo").unwrap();
        assert_eq!(doc.nodes.len(), 2);
        assert_eq!(doc.edges.len(), 1);
    }

    #[test]
    fn a_rejected_batch_leaves_the_space_alone() {
        let mut server = server();
        let result = call(
            &mut server,
            "edit_space",
            json!({
                "space": "Demo",
                "ops": [
                    { "op": "create_service", "icon": "aws:dynamodb", "label": "DB" },
                    { "op": "connect", "source": "DB", "target": "ghost" }
                ]
            }),
        );

        assert_eq!(result["isError"], true);
        let (_, doc) = server.backend.read_space("Demo").unwrap();
        assert!(doc.nodes.is_empty(), "a failed batch was partly written");
    }

    #[test]
    fn read_only_refuses_to_write() {
        let mut backend = Memory::default();
        backend.spaces.insert("Demo".to_string(), Doc::default());
        let mut server = Server::new(backend, IconIndex::empty(), true);

        let result = call(
            &mut server,
            "edit_space",
            json!({ "space": "Demo", "ops": [] }),
        );
        assert_eq!(result["isError"], true);

        let response = server
            .handle(&json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/list" }))
            .unwrap();
        let names: Vec<String> = response["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap_or_default().to_string())
            .collect();
        assert!(!names.contains(&"edit_space".to_string()));
    }

    #[test]
    fn unknown_methods_produce_a_jsonrpc_error() {
        let mut server = server();
        let response = server
            .handle(&json!({ "jsonrpc": "2.0", "id": 4, "method": "resources/list" }))
            .expect("responds");
        assert_eq!(response["error"]["code"], -32601);
    }
}
