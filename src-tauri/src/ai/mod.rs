//! Copilot wiring: configuration, conversation state and the commands the
//! webview calls.

pub mod agent;
pub mod conversations;
pub mod gemini;
pub mod provider;

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use codesign_core::Doc;
use conversations::{ConversationSummary, Turn};
use gemini::{AdcCredentials, GeminiProvider, Transport};
use provider::{Message, Provider};

use crate::ops::OpsState;

const CONFIG_FILE: &str = "ai.json";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    /// `vertex` (Google Cloud, gcloud credentials) or `aistudio` (API key).
    pub provider: String,
    pub model: String,
    /// Google Cloud project. Detected from gcloud credentials when unset.
    #[serde(default)]
    pub project: Option<String>,
    pub location: String,
}

/// Verified fastest-good option at the time of writing; the picker lists
/// whatever the project actually offers.
pub const DEFAULT_MODEL: &str = "gemini-3.7-flash";

/// Models that were only ever a default. Anyone still on one never chose it,
/// so move them forward rather than leaving them on a superseded generation.
const SUPERSEDED_DEFAULTS: [&str; 2] = ["gemini-2.5-flash", "gemini-2.5-pro"];

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: "vertex".to_string(),
            model: DEFAULT_MODEL.to_string(),
            project: None,
            // `global` carries more models than any single region.
            location: "global".to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub ready: bool,
    pub provider: String,
    pub model: String,
    pub location: String,
    pub project: Option<String>,
    /// Why it is not ready, when it is not.
    pub detail: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentEvent {
    Text {
        delta: String,
    },
    ToolCall {
        name: String,
        args: Value,
    },
    ToolResult {
        name: String,
        message: String,
        ok: bool,
    },
    Document {
        document: Value,
    },
    Usage {
        input: u32,
        output: u32,
    },
    Error {
        message: String,
    },
    Done,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSendRequest {
    pub space_id: String,
    pub conversation_id: String,
    pub document: Value,
    pub message: String,
    #[serde(default)]
    pub selection: Vec<String>,
}

#[derive(Default)]
pub struct AiState {
    config: Mutex<Option<AiConfig>>,
}

fn poisoned(what: &str) -> String {
    format!("{what} is unavailable")
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create config directory: {e}"))?;
    Ok(dir.join(CONFIG_FILE))
}

fn load_config(app: &AppHandle, state: &AiState) -> Result<AiConfig, String> {
    if let Some(config) = state
        .config
        .lock()
        .map_err(|_| poisoned("settings"))?
        .clone()
    {
        return Ok(config);
    }
    let mut config = config_path(app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<AiConfig>(&raw).ok())
        .unwrap_or_default();
    if SUPERSEDED_DEFAULTS.contains(&config.model.as_str()) {
        config.model = DEFAULT_MODEL.to_string();
    }
    *state.config.lock().map_err(|_| poisoned("settings"))? = Some(config.clone());
    Ok(config)
}

/// Falls back to the project gcloud already knows about, so a working
/// `gcloud auth application-default login` needs no further setup.
fn resolve_project(config: &AiConfig) -> Result<String, String> {
    if let Some(project) = config.project.as_ref().filter(|value| !value.is_empty()) {
        return Ok(project.clone());
    }
    if let Ok(project) = std::env::var("GOOGLE_CLOUD_PROJECT") {
        if !project.is_empty() {
            return Ok(project);
        }
    }
    AdcCredentials::load()?
        .quota_project_id
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "no Google Cloud project set — run `gcloud auth application-default \
             set-quota-project <project>` or set one in settings"
                .to_string()
        })
}

fn build_provider(config: &AiConfig) -> Result<Arc<dyn Provider>, String> {
    match config.provider.as_str() {
        "aistudio" => {
            let key = std::env::var("GEMINI_API_KEY")
                .or_else(|_| std::env::var("GOOGLE_API_KEY"))
                .map_err(|_| "set GEMINI_API_KEY to use AI Studio".to_string())?;
            Ok(Arc::new(GeminiProvider::new(Transport::AiStudio {
                api_key: key,
            })))
        }
        "vertex" => Ok(Arc::new(GeminiProvider::new(Transport::Vertex {
            project: resolve_project(config)?,
            location: config.location.clone(),
        }))),
        other => Err(format!("unknown provider \"{other}\"")),
    }
}

#[tauri::command]
pub fn ai_status(app: AppHandle, state: State<AiState>) -> Result<AiStatus, String> {
    let config = load_config(&app, &state)?;
    let project = resolve_project(&config);

    let detail = match (&config.provider[..], &project) {
        ("vertex", Err(message)) => Some(message.clone()),
        ("aistudio", _)
            if std::env::var("GEMINI_API_KEY").is_err()
                && std::env::var("GOOGLE_API_KEY").is_err() =>
        {
            Some("set GEMINI_API_KEY to use AI Studio".to_string())
        }
        _ => None,
    };

    Ok(AiStatus {
        ready: detail.is_none(),
        provider: config.provider,
        model: config.model,
        location: config.location,
        project: project.ok(),
        detail,
    })
}

#[tauri::command]
pub fn ai_set_config(
    app: AppHandle,
    state: State<AiState>,
    config: AiConfig,
) -> Result<AiStatus, String> {
    let path = config_path(&app)?;
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("could not save settings: {e}"))?;
    *state.config.lock().map_err(|_| poisoned("settings"))? = Some(config);
    ai_status(app, state)
}

#[tauri::command]
pub fn ai_conversations(app: AppHandle, space_id: String) -> Vec<ConversationSummary> {
    conversations::summaries(&app, &space_id)
}

#[tauri::command]
pub fn ai_conversation(app: AppHandle, space_id: String, id: String) -> Vec<Turn> {
    conversations::find(&app, &space_id, &id)
        .map(|conversation| conversations::transcript(&conversation.messages))
        .unwrap_or_default()
}

#[tauri::command]
pub fn ai_delete_conversation(app: AppHandle, space_id: String, id: String) -> Result<(), String> {
    conversations::remove(&app, &space_id, &id)
}

/// What this project can actually serve, so the picker never goes stale.
#[tauri::command]
pub async fn ai_models(app: AppHandle, state: State<'_, AiState>) -> Result<Vec<String>, String> {
    let config = load_config(&app, &state)?;
    let provider = build_provider(&config)?;
    let mut models = provider.models().await?;
    if !models.contains(&config.model) {
        models.insert(0, config.model);
    }
    Ok(models)
}

#[tauri::command]
pub async fn ai_send(
    app: AppHandle,
    ai: State<'_, AiState>,
    ops: State<'_, OpsState>,
    request: AiSendRequest,
    on_event: Channel<AgentEvent>,
) -> Result<(), String> {
    let config = load_config(&app, &ai)?;
    let provider = build_provider(&config)?;
    let icons = ops.icons()?;
    let doc =
        Doc::from_value(request.document).map_err(|e| format!("could not read document: {e}"))?;

    let mut history = conversations::find(&app, &request.space_id, &request.conversation_id)
        .map(|conversation| conversation.messages)
        .unwrap_or_default();
    history.push(Message::user(request.message));

    let emit: agent::Emit = {
        let channel = on_event.clone();
        Arc::new(move |event| {
            let _ = channel.send(event);
        })
    };

    let result = agent::run_turn(
        provider,
        config.model.clone(),
        icons,
        doc,
        &mut history,
        request.selection,
        emit.clone(),
    )
    .await;

    // Save even when the turn failed, so the question is not lost.
    conversations::store(&app, &request.space_id, &request.conversation_id, history)?;

    match result {
        Ok(doc) => {
            emit(AgentEvent::Document {
                document: doc.to_value().map_err(|e| e.to_string())?,
            });
            emit(AgentEvent::Done);
            Ok(())
        }
        Err(message) => {
            emit(AgentEvent::Error {
                message: message.clone(),
            });
            emit(AgentEvent::Done);
            Err(message)
        }
    }
}
