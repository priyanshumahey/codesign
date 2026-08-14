//! Reading and writing `.codesign` files without a Tauri app around.
//!
//! The desktop app has its own richer path (recents, trash, dialogs); this is
//! the minimum the headless MCP server needs to work while the app is closed.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::doc::Doc;

pub const SPACE_EXTENSION: &str = "codesign";
const SPACE_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceRecord {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub document: Doc,
    /// Where it came from. Never written to the file — the location is the truth.
    #[serde(skip)]
    pub path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OnDisk<'a> {
    version: u32,
    id: &'a str,
    name: &'a str,
    created_at: i64,
    updated_at: i64,
    document: &'a Doc,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn next_updated_at(previous: i64) -> i64 {
    now_ms().max(previous.saturating_add(1))
}

/// Where the app puts new spaces by default.
pub fn default_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()?;
    let home = PathBuf::from(home);
    let documents = home.join("Documents");
    Some(if documents.is_dir() {
        documents.join("Codesign")
    } else {
        home.join("Codesign")
    })
}

/// Where the desktop app keeps its own files. The headless server reads the
/// icon manifest from here, so a client config does not have to point at it.
pub fn app_config_dir() -> Option<PathBuf> {
    const IDENTIFIER: &str = "com.codesign.app";

    if cfg!(target_os = "windows") {
        return std::env::var("APPDATA")
            .ok()
            .map(|dir| PathBuf::from(dir).join(IDENTIFIER));
    }

    let home = PathBuf::from(std::env::var("HOME").ok()?);
    Some(if cfg!(target_os = "macos") {
        home.join("Library")
            .join("Application Support")
            .join(IDENTIFIER)
    } else {
        home.join(".config").join(IDENTIFIER)
    })
}

pub fn read(path: &Path) -> Result<SpaceRecord, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("could not read {}: {e}", path.display()))?;
    let mut record: SpaceRecord = serde_json::from_str(&raw)
        .map_err(|e| format!("{} is not a valid space: {e}", path.display()))?;
    record.path = path.to_path_buf();
    Ok(record)
}

/// Writes via a temporary file and a rename, so a crash mid-write cannot leave
/// a half-written diagram behind.
pub fn write(record: &SpaceRecord) -> Result<(), String> {
    let path = &record.path;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("could not create folder: {e}"))?;
    }

    let json = serde_json::to_string_pretty(&OnDisk {
        version: record.version,
        id: &record.id,
        name: &record.name,
        created_at: record.created_at,
        updated_at: record.updated_at,
        document: &record.document,
    })
    .map_err(|e| e.to_string())?;

    let temporary = path.with_extension(format!("{SPACE_EXTENSION}.{}.tmp", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, json).map_err(|e| format!("could not write space: {e}"))?;
    std::fs::rename(&temporary, path).map_err(|e| {
        let _ = std::fs::remove_file(&temporary);
        format!("could not save space: {e}")
    })
}

pub fn create(dir: &Path, name: &str) -> Result<SpaceRecord, String> {
    let now = now_ms();
    let record = SpaceRecord {
        version: SPACE_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        created_at: now,
        updated_at: now,
        document: Doc::default(),
        path: dir.join(format!("{}.{SPACE_EXTENSION}", sanitize(name))),
    };
    if record.path.exists() {
        return Err(format!("a space named \"{name}\" already exists there"));
    }
    write(&record)?;
    Ok(record)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceSummary {
    pub id: String,
    pub name: String,
    pub path: String,
    pub updated_at: i64,
    pub nodes: usize,
    pub edges: usize,
}

pub fn list(dir: &Path) -> Result<Vec<SpaceSummary>, String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("could not read {}: {e}", dir.display()))?;

    let mut spaces: Vec<SpaceSummary> = entries
        .flatten()
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case(SPACE_EXTENSION))
        })
        .filter_map(|entry| read(&entry.path()).ok())
        .map(|record| SpaceSummary {
            id: record.id,
            name: record.name,
            path: record.path.to_string_lossy().to_string(),
            updated_at: record.updated_at,
            nodes: record.document.nodes.len(),
            edges: record.document.edges.len(),
        })
        .collect();

    spaces.sort_by_key(|space| std::cmp::Reverse(space.updated_at));
    Ok(spaces)
}

/// Finds a space by id, or by name when the id is not a match.
pub fn find(dir: &Path, needle: &str) -> Result<SpaceRecord, String> {
    let mut by_name: Option<PathBuf> = None;
    for summary in list(dir)? {
        if summary.id == needle || summary.path == needle {
            return read(Path::new(&summary.path));
        }
        if summary.name.eq_ignore_ascii_case(needle) && by_name.is_none() {
            by_name = Some(PathBuf::from(summary.path));
        }
    }

    // Also accept a direct path to a file outside the default folder.
    let direct = Path::new(needle);
    if direct.is_file() {
        return read(direct);
    }

    match by_name {
        Some(path) => read(&path),
        None => Err(format!("no space matching \"{needle}\"")),
    }
}

fn sanitize(name: &str) -> String {
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
