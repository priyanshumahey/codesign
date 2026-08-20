//! Space files (`.codesign`) plus the recents index that backs the launcher.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub const SPACE_EXTENSION: &str = "codesign";
const RECENTS_FILE: &str = "recents.json";
const MAX_RECENTS: usize = 60;
const SPACE_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Folder,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
    pub last_opened: i64,
    #[serde(default)]
    pub pinned: bool,
}

/// A recents row decorated with live filesystem facts the UI needs.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentItem {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
    pub last_opened: i64,
    pub pinned: bool,
    pub exists: bool,
    pub modified: Option<i64>,
    pub size: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceSummary {
    pub path: String,
    pub name: String,
    pub modified: Option<i64>,
    pub size: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceDocument {
    #[serde(default)]
    pub nodes: Vec<serde_json::Value>,
    #[serde(default)]
    pub edges: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceFile {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub document: SpaceDocument,
    /// Absolute path on disk. Sent to the UI but never written to the file —
    /// the file's location is the truth.
    #[serde(skip_deserializing)]
    pub path: String,
}

/// On-disk projection of [`SpaceFile`] without the machine-specific `path`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpaceOnDisk<'a> {
    version: u32,
    id: &'a str,
    name: &'a str,
    created_at: i64,
    updated_at: i64,
    document: &'a SpaceDocument,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn system_time_ms(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
}

/// Strip characters that are illegal or confusing in a file name.
fn sanitize_file_stem(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim().to_string();
    if trimmed.is_empty() {
        "Untitled space".to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn display_name(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

/// Folder names keep their dots — `file_stem` would truncate "api.v2" to "api".
fn folder_display_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn with_space_extension(path: &Path) -> PathBuf {
    match path.extension() {
        Some(ext) if ext.eq_ignore_ascii_case(SPACE_EXTENSION) => path.to_path_buf(),
        _ => {
            let mut name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled space".to_string());
            name.push('.');
            name.push_str(SPACE_EXTENSION);
            path.with_file_name(name)
        }
    }
}

fn recents_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create config directory: {e}"))?;
    Ok(dir.join(RECENTS_FILE))
}

fn read_recents(app: &AppHandle) -> Vec<RecentEntry> {
    let Ok(path) = recents_path(app) else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_recents(app: &AppHandle, entries: &[RecentEntry]) -> Result<(), String> {
    let path = recents_path(app)?;
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("could not save recents: {e}"))
}

/// Move `path` to the front of the recents list, inserting it when new.
fn touch_recent(app: &AppHandle, path: &Path, kind: EntryKind, name: Option<String>) {
    let key = path.to_string_lossy().to_string();
    let mut entries = read_recents(app);
    let pinned = entries
        .iter()
        .find(|e| e.path == key)
        .map(|e| e.pinned)
        .unwrap_or(false);
    entries.retain(|e| e.path != key);
    let fallback = match kind {
        EntryKind::Folder => folder_display_name(path),
        EntryKind::File => display_name(path),
    };
    entries.insert(
        0,
        RecentEntry {
            name: name.unwrap_or(fallback),
            path: key,
            kind,
            last_opened: now_ms(),
            pinned,
        },
    );
    entries.truncate(MAX_RECENTS);
    let _ = write_recents(app, &entries);
}

fn read_space_file(path: &Path) -> Result<SpaceFile, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("could not read space: {e}"))?;
    let mut space: SpaceFile =
        serde_json::from_str(&raw).map_err(|e| format!("not a valid space file: {e}"))?;
    space.path = path.to_string_lossy().to_string();
    Ok(space)
}

fn write_space_file(path: &Path, space: &SpaceFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("could not create folder: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&SpaceOnDisk {
        version: space.version,
        id: &space.id,
        name: &space.name,
        created_at: space.created_at,
        updated_at: space.updated_at,
        document: &space.document,
    })
    .map_err(|e| e.to_string())?;
    let temporary = path.with_extension(format!("{SPACE_EXTENSION}.{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&temporary, json).map_err(|e| format!("could not write space: {e}"))?;
    fs::rename(&temporary, path).map_err(|e| {
        let _ = fs::remove_file(&temporary);
        format!("could not save space: {e}")
    })
}

#[tauri::command]
pub fn list_recents(app: AppHandle) -> Vec<RecentItem> {
    read_recents(&app)
        .into_iter()
        .map(|entry| {
            let path = PathBuf::from(&entry.path);
            let meta = fs::metadata(&path).ok();
            RecentItem {
                exists: meta.is_some(),
                modified: meta
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(system_time_ms),
                size: meta.as_ref().filter(|m| m.is_file()).map(|m| m.len()),
                path: entry.path,
                name: entry.name,
                kind: entry.kind,
                last_opened: entry.last_opened,
                pinned: entry.pinned,
            }
        })
        .collect()
}

#[tauri::command]
pub fn create_space(
    app: AppHandle,
    path: String,
    name: Option<String>,
) -> Result<SpaceFile, String> {
    // The save dialog already confirmed any overwrite, so honour the chosen path.
    let target = with_space_extension(Path::new(&path));
    let display = name
        .map(|n| sanitize_file_stem(&n))
        .unwrap_or_else(|| display_name(&target));
    let now = now_ms();

    let space = SpaceFile {
        version: SPACE_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        name: display.clone(),
        created_at: now,
        updated_at: now,
        document: SpaceDocument::default(),
        path: target.to_string_lossy().to_string(),
    };

    write_space_file(&target, &space)?;
    touch_recent(&app, &target, EntryKind::File, Some(display));
    Ok(space)
}

#[tauri::command]
pub fn open_space(app: AppHandle, path: String) -> Result<SpaceFile, String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err("That space no longer exists at this location.".into());
    }
    let space = read_space_file(&target)?;
    touch_recent(&app, &target, EntryKind::File, Some(space.name.clone()));
    Ok(space)
}

/// Writes the canvas document back to an existing space, leaving identity
/// fields (id, name, createdAt) as they are on disk.
#[tauri::command]
pub fn save_space(path: String, document: SpaceDocument) -> Result<i64, String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err("That space no longer exists at this location.".into());
    }
    let mut space = read_space_file(&target)?;
    space.document = document;
    space.updated_at = codesign_core::store::next_updated_at(space.updated_at);
    write_space_file(&target, &space)?;
    Ok(space.updated_at)
}

/// Returns the space only when it changed on disk since `known_updated_at` —
/// how the app notices edits made by the MCP server while it is open.
#[tauri::command]
pub fn poll_space(path: String, known_updated_at: i64) -> Result<Option<SpaceFile>, String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Ok(None);
    }
    let space = read_space_file(&target)?;
    Ok((space.updated_at != known_updated_at).then_some(space))
}

#[tauri::command]
pub fn rename_space(app: AppHandle, path: String, name: String) -> Result<SpaceFile, String> {
    let source = PathBuf::from(&path);
    if !source.exists() {
        return Err("That space no longer exists at this location.".into());
    }

    let display = sanitize_file_stem(&name);
    let mut space = read_space_file(&source)?;
    space.name = display.clone();
    space.updated_at = codesign_core::store::next_updated_at(space.updated_at);

    let desired = source.with_file_name(format!("{display}.{SPACE_EXTENSION}"));
    if desired != source && desired.exists() {
        return Err(format!(
            "A space named \"{display}\" already exists in this folder."
        ));
    }

    write_space_file(&source, &space)?;
    if desired != source {
        fs::rename(&source, &desired).map_err(|e| format!("could not rename file: {e}"))?;
    }
    space.path = desired.to_string_lossy().to_string();

    let key = source.to_string_lossy().to_string();
    let mut entries = read_recents(&app);
    if let Some(entry) = entries.iter_mut().find(|e| e.path == key) {
        entry.path = space.path.clone();
        entry.name = display;
    }
    write_recents(&app, &entries)?;

    Ok(space)
}

/// Sends the space to the OS trash so a mistaken click stays recoverable.
#[tauri::command]
pub fn delete_space(app: AppHandle, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if target.exists() {
        trash::delete(&target).map_err(|e| format!("could not move to trash: {e}"))?;
    }
    forget_recent(app, path)
}

#[tauri::command]
pub fn forget_recent(app: AppHandle, path: String) -> Result<(), String> {
    let mut entries = read_recents(&app);
    entries.retain(|e| e.path != path);
    write_recents(&app, &entries)
}

#[tauri::command]
pub fn set_pinned(app: AppHandle, path: String, pinned: bool) -> Result<(), String> {
    let mut entries = read_recents(&app);
    if let Some(entry) = entries.iter_mut().find(|e| e.path == path) {
        entry.pinned = pinned;
    }
    write_recents(&app, &entries)
}

#[tauri::command]
pub fn add_folder(app: AppHandle, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.is_dir() {
        return Err("That folder no longer exists at this location.".into());
    }
    touch_recent(&app, &target, EntryKind::Folder, None);
    Ok(())
}

#[tauri::command]
pub fn list_folder_spaces(path: String) -> Result<Vec<SpaceSummary>, String> {
    let dir = PathBuf::from(&path);
    let entries = fs::read_dir(&dir).map_err(|e| format!("could not read folder: {e}"))?;

    let mut spaces: Vec<SpaceSummary> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let is_space = path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case(SPACE_EXTENSION));
            if !is_space {
                return None;
            }
            let meta = entry.metadata().ok();
            Some(SpaceSummary {
                name: read_space_file(&path)
                    .map(|s| s.name)
                    .unwrap_or_else(|_| display_name(&path)),
                path: path.to_string_lossy().to_string(),
                modified: meta
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(system_time_ms),
                size: meta.as_ref().map(|m| m.len()),
            })
        })
        .collect();

    spaces.sort_by_key(|space| std::cmp::Reverse(space.modified));
    Ok(spaces)
}

/// Fields of a node worth searching, in the order they are reported.
const SEARCHABLE_FIELDS: [&str; 5] = ["label", "text", "description", "owner", "link"];

/// How many matching nodes are described per space before the rest are counted.
const MAX_MATCHES_PER_SPACE: usize = 6;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeMatch {
    pub node_id: String,
    pub kind: String,
    /// Best display text for the node, whichever field matched.
    pub label: String,
    /// Which field the query hit, so the UI can say why a result is here.
    pub field: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceMatch {
    pub path: String,
    pub name: String,
    pub matches: Vec<NodeMatch>,
    /// Total matching nodes, which may exceed `matches.len()`.
    pub total: usize,
}

fn node_field(node: &serde_json::Value, field: &str) -> Option<String> {
    node.get("data")?
        .get(field)?
        .as_str()
        .map(|value| value.to_string())
}

/// Searches the contents of the given spaces for `query`, so the launcher can
/// answer "which diagrams mention Redis?" rather than only matching filenames.
#[tauri::command]
pub fn search_spaces(paths: Vec<String>, query: String) -> Vec<SpaceMatch> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }

    let mut results = Vec::new();
    for path in paths {
        let target = PathBuf::from(&path);
        let Ok(space) = read_space_file(&target) else {
            continue;
        };

        let mut matches = Vec::new();
        let mut total = 0usize;
        for node in &space.document.nodes {
            let hit = SEARCHABLE_FIELDS.iter().find_map(|field| {
                let value = node_field(node, field)?;
                value
                    .to_lowercase()
                    .contains(&needle)
                    .then(|| (*field, value))
            });
            let Some((field, value)) = hit else { continue };

            total += 1;
            if matches.len() >= MAX_MATCHES_PER_SPACE {
                continue;
            }
            let label = node_field(node, "label")
                .or_else(|| node_field(node, "text"))
                .filter(|text| !text.trim().is_empty())
                .unwrap_or(value);
            matches.push(NodeMatch {
                node_id: node
                    .get("id")
                    .and_then(|id| id.as_str())
                    .unwrap_or_default()
                    .to_string(),
                kind: node
                    .get("type")
                    .and_then(|kind| kind.as_str())
                    .unwrap_or("service")
                    .to_string(),
                label,
                field: field.to_string(),
            });
        }

        if total > 0 {
            results.push(SpaceMatch {
                path,
                name: space.name,
                matches,
                total,
            });
        }
    }

    results.sort_by(|a, b| b.total.cmp(&a.total).then_with(|| a.name.cmp(&b.name)));
    results
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn default_space_dir(app: AppHandle) -> Result<String, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| format!("no home directory: {e}"))?;
    let dir = base.join("Codesign");
    fs::create_dir_all(&dir).map_err(|e| format!("could not create folder: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_space(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("codesign-test-{label}-{}", now_ms()));
        fs::create_dir_all(&dir).unwrap();
        dir.join(format!("Test.{SPACE_EXTENSION}"))
    }

    fn seed(path: &Path) -> SpaceFile {
        let space = SpaceFile {
            version: SPACE_VERSION,
            id: "space-id".into(),
            name: "Test".into(),
            created_at: 1_000,
            updated_at: 1_000,
            document: SpaceDocument::default(),
            path: path.to_string_lossy().to_string(),
        };
        write_space_file(path, &space).unwrap();
        space
    }

    #[test]
    fn does_not_persist_the_absolute_path() {
        let path = temp_space("path");
        seed(&path);
        let raw = fs::read_to_string(&path).unwrap();
        assert!(
            !raw.contains("\"path\""),
            "space file leaked its location: {raw}"
        );
    }

    #[test]
    fn save_space_replaces_the_document_and_keeps_identity() {
        let path = temp_space("save");
        seed(&path);

        let document = SpaceDocument {
            nodes: vec![serde_json::json!({ "id": "n1", "type": "service" })],
            edges: vec![serde_json::json!({ "id": "e1" })],
        };
        let updated_at = save_space(path.to_string_lossy().to_string(), document).unwrap();

        let reloaded = read_space_file(&path).unwrap();
        assert_eq!(reloaded.document.nodes.len(), 1);
        assert_eq!(reloaded.document.edges.len(), 1);
        assert_eq!(reloaded.id, "space-id");
        assert_eq!(reloaded.created_at, 1_000);
        assert_eq!(reloaded.updated_at, updated_at);
        assert!(updated_at > 1_000);
        // The path is rebuilt from the file's location, not from its contents.
        assert_eq!(reloaded.path, path.to_string_lossy());
    }

    #[test]
    fn save_space_refuses_a_missing_file() {
        let path = temp_space("missing");
        assert!(save_space(path.to_string_lossy().to_string(), SpaceDocument::default()).is_err());
    }
}
