//! Provider-neutral chat types.
//!
//! The agent loop is written against these alone. Anything shaped like a
//! specific vendor's wire format stays inside that vendor's adapter, which is
//! what makes swapping Gemini for Anthropic a new file rather than a rewrite.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Model,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Part {
    Text {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        args: Value,
        /// Gemini 2.5 hands back an opaque reasoning token that must be echoed
        /// on the next turn or the model loses its own train of thought.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        signature: Option<String>,
    },
    ToolResult {
        id: String,
        name: String,
        result: Value,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub parts: Vec<Part>,
}

impl Message {
    pub fn user(text: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            parts: vec![Part::Text { text: text.into() }],
        }
    }

    pub fn tool_calls(&self) -> Vec<(&str, &str, &Value)> {
        self.parts
            .iter()
            .filter_map(|part| match part {
                Part::ToolCall { id, name, args, .. } => Some((id.as_str(), name.as_str(), args)),
                _ => None,
            })
            .collect()
    }
}

#[derive(Clone, Debug)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    /// JSON Schema for the arguments object.
    pub parameters: Value,
}

#[derive(Clone, Debug)]
pub struct ChatRequest {
    pub model: String,
    pub system: String,
    pub messages: Vec<Message>,
    pub tools: Vec<ToolDef>,
}

#[derive(Clone, Debug)]
pub enum StreamEvent {
    Text(String),
    Usage { input: u32, output: u32 },
}

#[async_trait]
pub trait Provider: Send + Sync {
    /// Streams one assistant turn, emitting deltas as they arrive and
    /// returning the assembled message to append to history.
    async fn stream(
        &self,
        request: ChatRequest,
        events: UnboundedSender<StreamEvent>,
    ) -> Result<Message, String>;

    /// Chat-capable models, newest first.
    async fn models(&self) -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }
}
