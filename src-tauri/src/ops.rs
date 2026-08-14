//! Bridge from the webview to the op layer.
//!
//! The canvas sends its current document plus a batch of ops and gets the new
//! document back. Keeping the edit itself in `codesign-core` is what lets the
//! MCP server and the headless binary behave identically to the UI.

use std::sync::{Arc, Mutex};

use codesign_core::icons::IconEntry;
use codesign_core::{apply, summary, Aliases, ApplyCtx, Doc, IconIndex, IdGen, Op};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

pub const MANIFEST_FILE: &str = "icons-manifest.json";

#[derive(Default)]
pub struct OpsState {
    /// Behind an `Arc` so the agent can take a snapshot and release the lock
    /// before it starts awaiting.
    icons: Mutex<Arc<IconIndex>>,
    /// Shared so ids stay unique across every call in a session.
    ids: Mutex<IdGen>,
}

impl OpsState {
    pub fn icons(&self) -> Result<Arc<IconIndex>, String> {
        Ok(self
            .icons
            .lock()
            .map_err(|_| poisoned("the icon index"))?
            .clone())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpOutcome {
    pub op: String,
    pub ids: Vec<String>,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResponse {
    pub document: Value,
    pub outcomes: Vec<OpOutcome>,
    /// Compact rendering of the result, for showing or for model context.
    pub summary: String,
}

fn poisoned(what: &str) -> String {
    format!("{what} is unavailable")
}

#[tauri::command]
pub fn apply_ops(
    state: State<OpsState>,
    document: Value,
    ops: Vec<Op>,
) -> Result<ApplyResponse, String> {
    let doc = Doc::from_value(document).map_err(|e| format!("could not read document: {e}"))?;

    let icons = state.icons.lock().map_err(|_| poisoned("the icon index"))?;
    let mut ids = state.ids.lock().map_err(|_| poisoned("the id generator"))?;
    let mut aliases = Aliases::default();
    let mut ctx = ApplyCtx::new(&mut ids, &icons, &mut aliases);

    let applied = apply(&doc, &ops, &mut ctx).map_err(|error| error.to_string())?;

    Ok(ApplyResponse {
        document: applied.doc.to_value().map_err(|e| e.to_string())?,
        summary: summary::summarize(&applied.doc),
        outcomes: applied
            .outcomes
            .into_iter()
            .map(|outcome| OpOutcome {
                op: outcome.op.to_string(),
                ids: outcome.ids,
                message: outcome.message,
            })
            .collect(),
    })
}

/// The manifest lives in the frontend bundle, which Rust cannot read, so the
/// webview hands it over once on startup. It is also written to disk so the
/// MCP server, which has no webview, can search icons too.
#[tauri::command]
pub fn load_icon_manifest(
    app: AppHandle,
    state: State<OpsState>,
    json: String,
) -> Result<usize, String> {
    let index =
        IconIndex::from_manifest_json(&json).map_err(|e| format!("bad icon manifest: {e}"))?;
    let count = index.len();
    *state.icons.lock().map_err(|_| poisoned("the icon index"))? = Arc::new(index);

    if let Ok(dir) = app.path().app_config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(MANIFEST_FILE), &json);
    }
    Ok(count)
}

#[tauri::command]
pub fn search_icons(
    state: State<OpsState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<IconEntry>, String> {
    let icons = state.icons.lock().map_err(|_| poisoned("the icon index"))?;
    Ok(icons
        .search(&query, limit.unwrap_or(8))
        .into_iter()
        .map(|hit| hit.entry)
        .collect())
}

/// Renders a document the way the agent sees it. Useful for debugging prompts.
#[tauri::command]
pub fn summarize_document(document: Value) -> Result<String, String> {
    let doc = Doc::from_value(document).map_err(|e| format!("could not read document: {e}"))?;
    Ok(summary::summarize(&doc))
}
