//! The agent loop: talk to a model, run the tools it asks for, feed the results
//! back, stop when it stops calling tools.
//!
//! Tool calls are applied one at a time so a single bad argument produces one
//! correctable error instead of discarding the whole turn. The alias map is
//! shared across the turn, so a handle minted by an early call still resolves
//! in a later one.

use std::sync::Arc;

use codesign_core::ops::op_from_tool_call;
use codesign_core::{apply, summary, Aliases, ApplyCtx, Doc, IconIndex, IdGen};
use serde_json::{json, Value};
use tokio::sync::mpsc::unbounded_channel;

use super::provider::{ChatRequest, Message, Part, Provider, Role, StreamEvent, ToolDef};
use super::AgentEvent;

/// Enough for a decent multi-step build, low enough to bound a runaway loop.
const MAX_STEPS: usize = 16;

pub type Emit = Arc<dyn Fn(AgentEvent) + Send + Sync>;

pub async fn run_turn(
    provider: Arc<dyn Provider>,
    model: String,
    icons: Arc<IconIndex>,
    mut doc: Doc,
    history: &mut Vec<Message>,
    selection: Vec<String>,
    emit: Emit,
) -> Result<Doc, String> {
    let tools = tool_defs();
    let mut ids = IdGen::new();
    let mut aliases = Aliases::default();

    let started_empty = doc.nodes.is_empty();
    let mut created = false;
    let mut tidied = false;

    for _ in 0..MAX_STEPS {
        let request = ChatRequest {
            model: model.clone(),
            system: system_prompt(&doc, &selection),
            messages: history.clone(),
            tools: tools.clone(),
        };

        let (sender, mut receiver) = unbounded_channel();
        let forward = {
            let emit = emit.clone();
            tokio::spawn(async move {
                while let Some(event) = receiver.recv().await {
                    match event {
                        StreamEvent::Text(delta) => emit(AgentEvent::Text { delta }),
                        StreamEvent::Usage { input, output } => {
                            emit(AgentEvent::Usage { input, output })
                        }
                    }
                }
            })
        };

        let reply = provider.stream(request, sender).await;
        let _ = forward.await;
        let reply = reply?;

        let calls: Vec<(String, String, Value)> = reply
            .tool_calls()
            .into_iter()
            .map(|(id, name, args)| (id.to_string(), name.to_string(), args.clone()))
            .collect();
        history.push(reply);

        if calls.is_empty() {
            // Building from a blank canvas should never end up looking untidy,
            // even if the model forgot to ask.
            if started_empty && created && !tidied {
                doc = codesign_core::layout::layout(&doc, None);
                emit(AgentEvent::Document {
                    document: doc.to_value().map_err(|e| e.to_string())?,
                });
            }
            return Ok(doc);
        }

        let mut results = Vec::with_capacity(calls.len());
        for (id, name, args) in calls {
            emit(AgentEvent::ToolCall {
                name: name.clone(),
                args: args.clone(),
            });

            let outcome = run_tool(&name, &args, &mut doc, &icons, &mut ids, &mut aliases);
            let result = match outcome {
                Ok(value) => {
                    created |= name.starts_with("create_");
                    tidied |= name == "auto_layout";
                    emit(AgentEvent::ToolResult {
                        name: name.clone(),
                        message: describe(&value),
                        ok: true,
                    });
                    if name != SEARCH_ICONS {
                        emit(AgentEvent::Document {
                            document: doc.to_value().map_err(|e| e.to_string())?,
                        });
                    }
                    value
                }
                Err(message) => {
                    emit(AgentEvent::ToolResult {
                        name: name.clone(),
                        message: message.clone(),
                        ok: false,
                    });
                    json!({ "error": message })
                }
            };

            results.push(Part::ToolResult { id, name, result });
        }

        history.push(Message {
            role: Role::User,
            parts: results,
        });
    }

    Err("the assistant took too many steps without finishing".to_string())
}

const SEARCH_ICONS: &str = "search_icons";

fn run_tool(
    name: &str,
    args: &Value,
    doc: &mut Doc,
    icons: &IconIndex,
    ids: &mut IdGen,
    aliases: &mut Aliases,
) -> Result<Value, String> {
    if name == SEARCH_ICONS {
        let query = args
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if query.is_empty() {
            return Err("query is required".to_string());
        }
        let limit = args
            .get("limit")
            .and_then(Value::as_u64)
            .unwrap_or(8)
            .clamp(1, 25) as usize;
        let matches: Vec<Value> = icons
            .search(query, limit)
            .into_iter()
            .map(|hit| json!({ "id": hit.entry.id, "name": hit.entry.name }))
            .collect();
        if matches.is_empty() {
            return Ok(json!({
                "matches": [],
                "hint": format!(
                    "nothing matched \"{query}\" — try a broader word, or just pass the term \
                     as `icon` and a sensible default will be used"
                )
            }));
        }
        return Ok(json!({ "matches": matches }));
    }

    let op = op_from_tool_call(name, args.clone())
        .map_err(|e| format!("could not read the arguments: {e}"))?;

    let mut ctx = ApplyCtx::new(ids, icons, aliases);
    let applied = apply(doc, &[op], &mut ctx).map_err(|error| error.message)?;
    *doc = applied.doc;

    let outcome = applied.outcomes.first();
    Ok(json!({
        "ok": true,
        "id": outcome.and_then(|o| o.ids.first()).cloned(),
        "message": outcome.map(|o| o.message.clone()).unwrap_or_default(),
    }))
}

fn describe(result: &Value) -> String {
    if let Some(message) = result.get("message").and_then(Value::as_str) {
        return message.to_string();
    }
    if let Some(matches) = result.get("matches").and_then(Value::as_array) {
        if matches.is_empty() {
            return result
                .get("hint")
                .and_then(Value::as_str)
                .unwrap_or("no icons matched")
                .to_string();
        }
        return format!("found {} icon(s)", matches.len());
    }
    "done".to_string()
}

fn tool_defs() -> Vec<ToolDef> {
    let mut tools: Vec<ToolDef> = codesign_core::tool_schemas()
        .into_iter()
        .map(|tool| ToolDef {
            name: tool.name.to_string(),
            description: tool.description,
            parameters: tool.parameters,
        })
        .collect();

    tools.push(ToolDef {
        name: SEARCH_ICONS.to_string(),
        description: "Find icon ids by keyword. Use this before create_service when \
                      you are not certain of an icon id."
            .to_string(),
        parameters: json!({
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": { "type": "string", "description": "A product or concept, e.g. \"postgres\" or \"message queue\"." },
                "limit": { "type": "integer", "description": "How many results to return. Defaults to 8." }
            }
        }),
    });

    tools
}

const GUIDE: &str = r#"You are the design copilot inside Codesign, a desktop app for drawing software architecture diagrams.

You edit the diagram by calling tools. Guidelines:
- Never invent coordinates. Leave `position` out and the canvas will place things sensibly.
- Give every node you create an `alias`, then use that alias as the `source`, `target` or `parent` of later calls in the same turn.
- Prefer passing a plain search term as `icon` ("postgres", "message queue"). Call search_icons first when you want to be certain, or when a term returned the wrong picture.
- Group related nodes with create_boundary (a VPC, a cluster, a team) instead of leaving a flat sprawl.
- Put the protocol on connections: `method` and `endpoint` are what make a diagram useful.
- Build the whole thing in one go: create every node and connection you need before you reply, rather than stopping to check in.
- If an op fails, fix just that op and carry on. Never delete and rebuild work that already succeeded.
- Call auto_layout once at the end whenever you added several nodes, so the result is tidy.
- Make the edits, then reply with one or two short sentences. Do not narrate every call, and do not paste the diagram back as text.
- If a request is ambiguous, make a reasonable assumption and say what you assumed.

Current diagram:
"#;

fn system_prompt(doc: &Doc, selection: &[String]) -> String {
    let mut prompt = String::from(GUIDE);

    prompt.push_str(&summary::summarize(doc));

    if !selection.is_empty() {
        let labels: Vec<String> = selection
            .iter()
            .map(
                |id| match doc.node(id).and_then(|node| node.display_label()) {
                    Some(label) => format!("{id} (\"{label}\")"),
                    None => id.clone(),
                },
            )
            .collect();
        prompt.push_str(&format!(
            "\nThe user has selected: {}. Assume \"this\" and \"it\" refer to that.\n",
            labels.join(", ")
        ));
    }

    prompt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_icons_is_offered_alongside_the_ops() {
        let tools = tool_defs();
        assert!(tools.iter().any(|tool| tool.name == SEARCH_ICONS));
        assert!(tools.iter().any(|tool| tool.name == "create_service"));
        assert_eq!(tools.len(), 12);
    }

    #[test]
    fn a_tool_call_edits_the_document() {
        let mut doc = Doc::default();
        let icons = IconIndex::empty();
        let mut ids = IdGen::fixed("t", "abcd");
        let mut aliases = Aliases::default();

        let result = run_tool(
            "create_service",
            &json!({ "icon": "aws:dynamodb", "label": "Orders DB" }),
            &mut doc,
            &icons,
            &mut ids,
            &mut aliases,
        )
        .expect("tool runs");

        assert_eq!(result["ok"], true);
        assert_eq!(doc.nodes.len(), 1);
    }

    #[test]
    fn a_bad_argument_comes_back_as_a_message_not_a_panic() {
        let mut doc = Doc::default();
        let icons = IconIndex::empty();
        let mut ids = IdGen::fixed("t", "abcd");
        let mut aliases = Aliases::default();

        let error = run_tool(
            "connect",
            &json!({ "source": "nope", "target": "also-nope" }),
            &mut doc,
            &icons,
            &mut ids,
            &mut aliases,
        )
        .expect_err("should fail");
        assert!(error.contains("no node called"), "{error}");
    }

    #[test]
    fn the_prompt_carries_the_diagram_and_the_selection() {
        let mut doc = Doc::default();
        let icons = IconIndex::empty();
        let mut ids = IdGen::fixed("t", "abcd");
        let mut aliases = Aliases::default();
        run_tool(
            "create_service",
            &json!({ "icon": "aws:dynamodb", "label": "Orders DB" }),
            &mut doc,
            &icons,
            &mut ids,
            &mut aliases,
        )
        .unwrap();

        let prompt = system_prompt(&doc, &["node-t-abcd0".to_string()]);
        assert!(prompt.contains("Orders DB"), "{prompt}");
        assert!(prompt.contains("has selected"), "{prompt}");
    }
}
