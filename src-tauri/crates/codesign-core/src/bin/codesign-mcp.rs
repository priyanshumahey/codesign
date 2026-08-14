//! `codesign-mcp` — a Model Context Protocol server for Codesign diagrams.
//!
//! Speaks JSON-RPC over stdio, the transport Claude Desktop, Cursor and VS Code
//! use. It edits `.codesign` files directly, so it works whether or not the
//! desktop app is running.
//!
//! Usage:
//!   codesign-mcp --space <file>     one diagram, no way to touch another
//!   codesign-mcp [--dir <folder>]   every diagram in a folder
//!   codesign-mcp ... --read-only
//!
//! Nothing but protocol messages may go to stdout; diagnostics go to stderr.

use std::io::{BufRead, Write};
use std::path::PathBuf;

use codesign_core::icons::IconIndex;
use codesign_core::mcp::{Backend, FileBackend, Server, SpaceBackend};
use codesign_core::store;
use serde_json::{json, Value};

/// The manifest is a build artefact, so look where it plausibly is rather than
/// baking in one path. Without it, icon ids still work; only search degrades.
fn load_icons() -> IconIndex {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(explicit) = std::env::var("CODESIGN_ICONS") {
        candidates.push(PathBuf::from(explicit));
    }
    // The desktop app writes it here whenever it opens a canvas.
    if let Some(dir) = store::app_config_dir() {
        candidates.push(dir.join("icons-manifest.json"));
    }
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().take(6) {
            candidates.push(ancestor.join("icons-manifest.json"));
            candidates.push(ancestor.join("public/icons-manifest.json"));
        }
    }

    for candidate in candidates {
        if let Ok(raw) = std::fs::read_to_string(&candidate) {
            if let Ok(index) = IconIndex::from_manifest_json(&raw) {
                eprintln!(
                    "codesign-mcp: {} icons from {}",
                    index.len(),
                    candidate.display()
                );
                return index;
            }
        }
    }

    eprintln!("codesign-mcp: no icon manifest found; icon search is unavailable");
    IconIndex::empty()
}

fn main() {
    let mut args = std::env::args().skip(1);
    let mut dir: Option<PathBuf> = None;
    let mut space: Option<PathBuf> = None;
    let mut read_only = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--dir" => dir = args.next().map(PathBuf::from),
            "--space" => space = args.next().map(PathBuf::from),
            "--read-only" => read_only = true,
            "--help" | "-h" => {
                println!("codesign-mcp [--space <file> | --dir <folder>] [--read-only]");
                return;
            }
            other => eprintln!("codesign-mcp: ignoring unknown argument {other}"),
        }
    }

    let space = space.or_else(|| std::env::var("CODESIGN_SPACE").ok().map(PathBuf::from));

    if let Some(path) = space {
        match SpaceBackend::open(&path) {
            Ok(backend) => {
                eprintln!("codesign-mcp: {}", backend.describe());
                let mut server = Server::new(backend, load_icons(), read_only);
                serve_stdio(&mut server);
            }
            Err(error) => eprintln!("codesign-mcp: {error}"),
        }
        return;
    }

    let dir = dir
        .or_else(|| std::env::var("CODESIGN_DIR").ok().map(PathBuf::from))
        .or_else(store::default_dir)
        .unwrap_or_else(|| PathBuf::from("."));

    if !dir.exists() {
        if let Err(error) = std::fs::create_dir_all(&dir) {
            eprintln!("codesign-mcp: could not create {}: {error}", dir.display());
        }
    }
    eprintln!(
        "codesign-mcp: serving {}{}",
        dir.display(),
        if read_only { " (read-only)" } else { "" }
    );

    let mut server = Server::new(FileBackend::new(dir), load_icons(), read_only);
    serve_stdio(&mut server);
}

fn serve_stdio<B: Backend>(server: &mut Server<B>) {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<Value>(line) {
            Ok(request) => server.handle(&request),
            Err(error) => Some(json!({
                "jsonrpc": "2.0",
                "id": Value::Null,
                "error": { "code": -32700, "message": format!("invalid JSON: {error}") }
            })),
        };

        if let Some(response) = response {
            let encoded = match serde_json::to_string(&response) {
                Ok(encoded) => encoded,
                Err(error) => {
                    eprintln!("codesign-mcp: could not encode a reply: {error}");
                    continue;
                }
            };
            if writeln!(stdout, "{encoded}").is_err() || stdout.flush().is_err() {
                break;
            }
        }
    }
}
