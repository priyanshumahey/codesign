//! Saved copilot conversations, one file per space.
//!
//! The model's own history is the source of truth; the UI transcript is derived
//! from it, so reopening a chat shows exactly what the model still remembers.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::provider::{Message, Part, Role};

const FOLDER: &str = "conversations";
/// Plenty of history without letting one space grow without bound.
const MAX_PER_SPACE: usize = 40;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub messages: Vec<Message>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub turns: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolTrace {
    pub name: String,
    pub message: String,
    pub ok: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub role: &'static str,
    pub text: String,
    pub tools: Vec<ToolTrace>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Space ids are uuids, but never trust one straight into a path.
fn safe(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(64)
        .collect()
}

fn path(app: &AppHandle, space_id: &str) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config directory: {e}"))?
        .join(FOLDER);
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {FOLDER}: {e}"))?;
    Ok(dir.join(format!("{}.json", safe(space_id))))
}

pub fn load(app: &AppHandle, space_id: &str) -> Vec<Conversation> {
    path(app, space_id)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<Vec<Conversation>>(&raw).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, space_id: &str, mut all: Vec<Conversation>) -> Result<(), String> {
    all.sort_by_key(|conversation| std::cmp::Reverse(conversation.updated_at));
    all.truncate(MAX_PER_SPACE);
    let json = serde_json::to_string_pretty(&all).map_err(|e| e.to_string())?;
    let path = path(app, space_id)?;
    let temporary = path.with_extension(format!("json.{}.tmp", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, json)
        .map_err(|e| format!("could not write the conversation: {e}"))?;
    std::fs::rename(&temporary, &path).map_err(|e| {
        let _ = std::fs::remove_file(&temporary);
        format!("could not save the conversation: {e}")
    })
}

pub fn summaries(app: &AppHandle, space_id: &str) -> Vec<ConversationSummary> {
    load(app, space_id)
        .into_iter()
        .map(|conversation| ConversationSummary {
            turns: transcript(&conversation.messages).len(),
            id: conversation.id,
            title: conversation.title,
            created_at: conversation.created_at,
            updated_at: conversation.updated_at,
        })
        .collect()
}

pub fn find(app: &AppHandle, space_id: &str, id: &str) -> Option<Conversation> {
    load(app, space_id)
        .into_iter()
        .find(|conversation| conversation.id == id)
}

pub fn remove(app: &AppHandle, space_id: &str, id: &str) -> Result<(), String> {
    let mut all = load(app, space_id);
    all.retain(|conversation| conversation.id != id);
    save(app, space_id, all)
}

/// Writes `messages` back under `id`, creating the conversation if it is new.
pub fn store(
    app: &AppHandle,
    space_id: &str,
    id: &str,
    messages: Vec<Message>,
) -> Result<(), String> {
    let mut all = load(app, space_id);
    let now = now_ms();
    let title = title_of(&messages);

    match all.iter_mut().find(|conversation| conversation.id == id) {
        Some(existing) => {
            existing.messages = messages;
            existing.updated_at = now;
            if existing.title.is_empty() {
                existing.title = title;
            }
        }
        None => all.push(Conversation {
            id: id.to_string(),
            title,
            created_at: now,
            updated_at: now,
            messages,
        }),
    }

    save(app, space_id, all)
}

/// The first thing the user asked for, which reads better in a list than a date.
fn title_of(messages: &[Message]) -> String {
    let first = messages.iter().find(|message| {
        message.role == Role::User
            && message
                .parts
                .iter()
                .any(|part| matches!(part, Part::Text { .. }))
    });

    let Some(text) = first.and_then(|message| {
        message.parts.iter().find_map(|part| match part {
            Part::Text { text } => Some(text.as_str()),
            _ => None,
        })
    }) else {
        return "New chat".to_string();
    };

    let trimmed = text.trim().replace('\n', " ");
    if trimmed.chars().count() <= 48 {
        trimmed
    } else {
        format!(
            "{}…",
            trimmed.chars().take(47).collect::<String>().trim_end()
        )
    }
}

/// Rebuilds what the chat looked like. Everything the model did between two
/// user messages collapses into one assistant turn, matching the live view.
pub fn transcript(messages: &[Message]) -> Vec<Turn> {
    let mut turns: Vec<Turn> = Vec::new();

    for message in messages {
        let text: String = message
            .parts
            .iter()
            .filter_map(|part| match part {
                Part::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("");

        let results: Vec<ToolTrace> = message
            .parts
            .iter()
            .filter_map(|part| match part {
                Part::ToolResult { name, result, .. } => Some(trace(name, result)),
                _ => None,
            })
            .collect();

        match message.role {
            Role::User if !results.is_empty() => {
                if let Some(last) = turns.last_mut().filter(|turn| turn.role == "assistant") {
                    last.tools.extend(results);
                }
            }
            Role::User => {
                if !text.is_empty() {
                    turns.push(Turn {
                        role: "user",
                        text,
                        tools: Vec::new(),
                    });
                }
            }
            Role::Model => match turns.last_mut().filter(|turn| turn.role == "assistant") {
                Some(last) => last.text.push_str(&text),
                None => turns.push(Turn {
                    role: "assistant",
                    text,
                    tools: Vec::new(),
                }),
            },
        }
    }

    turns
}

fn trace(name: &str, result: &Value) -> ToolTrace {
    if let Some(error) = result.get("error").and_then(Value::as_str) {
        return ToolTrace {
            name: name.to_string(),
            message: error.to_string(),
            ok: false,
        };
    }
    let message = result
        .get("message")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| match result.get("matches").and_then(Value::as_array) {
            Some(matches) => format!("found {} icon(s)", matches.len()),
            None => "done".to_string(),
        });
    ToolTrace {
        name: name.to_string(),
        message,
        ok: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn model(parts: Vec<Part>) -> Message {
        Message {
            role: Role::Model,
            parts,
        }
    }

    #[test]
    fn a_multi_step_turn_collapses_into_one_reply() {
        let messages = vec![
            Message::user("add a database"),
            model(vec![Part::ToolCall {
                id: "c1".into(),
                name: "create_service".into(),
                args: json!({}),
                signature: None,
            }]),
            Message {
                role: Role::User,
                parts: vec![Part::ToolResult {
                    id: "c1".into(),
                    name: "create_service".into(),
                    result: json!({ "ok": true, "message": "added service \"DB\"" }),
                }],
            },
            model(vec![Part::Text {
                text: "Done.".into(),
            }]),
        ];

        let turns = transcript(&messages);
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].role, "user");
        assert_eq!(turns[1].role, "assistant");
        assert_eq!(turns[1].text, "Done.");
        assert_eq!(turns[1].tools.len(), 1);
        assert!(turns[1].tools[0].ok);
        assert_eq!(turns[1].tools[0].message, "added service \"DB\"");
    }

    #[test]
    fn failed_tools_are_marked() {
        let messages = vec![
            Message::user("connect them"),
            model(vec![Part::ToolCall {
                id: "c1".into(),
                name: "connect".into(),
                args: json!({}),
                signature: None,
            }]),
            Message {
                role: Role::User,
                parts: vec![Part::ToolResult {
                    id: "c1".into(),
                    name: "connect".into(),
                    result: json!({ "error": "no node called \"ghost\"" }),
                }],
            },
        ];

        let turns = transcript(&messages);
        assert!(!turns[1].tools[0].ok);
        assert!(turns[1].tools[0].message.contains("ghost"));
    }

    #[test]
    fn the_title_comes_from_the_first_question() {
        assert_eq!(
            title_of(&[Message::user("Sketch a three-tier web app")]),
            "Sketch a three-tier web app"
        );
        assert_eq!(title_of(&[]), "New chat");

        let long = "a".repeat(80);
        let title = title_of(&[Message::user(long)]);
        assert!(title.chars().count() <= 48, "{title}");
        assert!(title.ends_with('…'));
    }
}
