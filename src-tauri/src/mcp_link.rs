//! The snippet you paste into an agent so it can edit one specific space.

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::ops::MANIFEST_FILE;

const BINARY: &str = "codesign-mcp";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfig {
    /// Ready to paste into a client's MCP settings.
    pub json: String,
    pub server_name: String,
    pub binary: String,
    /// False when the binary is missing, which is the one thing that stops
    /// this working.
    pub ready: bool,
    pub hint: Option<String>,
}

/// The server binary ships beside the app executable, and sits beside the dev
/// binary in `target/debug` too, so one lookup covers both.
fn binary_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let beside_exe = std::env::current_exe().ok().and_then(|exe| {
        let candidate = exe.with_file_name(BINARY);
        candidate.exists().then_some(candidate)
    });
    beside_exe.or_else(|| {
        app.path()
            .resolve(BINARY, tauri::path::BaseDirectory::Resource)
            .ok()
            .filter(|path| path.exists())
    })
}

fn slug(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let trimmed: String = cleaned
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if trimmed.is_empty() {
        "space".to_string()
    } else {
        trimmed.chars().take(40).collect()
    }
}

#[tauri::command]
pub fn mcp_config(app: AppHandle, path: String, name: String) -> Result<McpConfig, String> {
    let resolved = binary_path(&app);
    let binary = resolved
        .clone()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            std::env::current_exe()
                .map(|exe| exe.with_file_name(BINARY).to_string_lossy().to_string())
                .unwrap_or_else(|_| BINARY.to_string())
        });

    let server_name = format!("codesign-{}", slug(&name));

    let mut server = json!({
        "command": binary,
        "args": ["--space", path],
    });

    // The server finds the manifest in the app config dir on its own; only
    // spell it out if it somehow lives somewhere else.
    let manifest = app
        .path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(MANIFEST_FILE));
    let discoverable = codesign_core::store::app_config_dir().map(|dir| dir.join(MANIFEST_FILE));
    if let Some(manifest) = manifest.filter(|path| path.exists()) {
        if Some(&manifest) != discoverable.as_ref() {
            server["env"] = json!({ "CODESIGN_ICONS": manifest.to_string_lossy() });
        }
    }

    let json = serde_json::to_string_pretty(&json!({
        "mcpServers": { server_name.clone(): server }
    }))
    .map_err(|e| e.to_string())?;

    Ok(McpConfig {
        json,
        server_name,
        binary,
        ready: resolved.is_some(),
        hint: resolved.is_none().then(|| {
            format!("Build it first: cargo build --release -p codesign-core --bin {BINARY}")
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::slug;

    #[test]
    fn names_become_usable_server_keys() {
        assert_eq!(slug("Codesign AI architecture"), "codesign-ai-architecture");
        assert_eq!(slug("Orders / payments!"), "orders-payments");
        assert_eq!(slug("   "), "space");
    }
}
