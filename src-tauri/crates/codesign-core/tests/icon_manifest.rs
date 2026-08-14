//! Sanity check against the real manifest.
//!
//! `public/icons-manifest.json` is generated (`bun run icons`) and git-ignored,
//! so this test skips rather than fails when it is not there.

use codesign_core::icons::IconIndex;

fn manifest() -> Option<IconIndex> {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../public/icons-manifest.json"
    );
    let raw = std::fs::read_to_string(path).ok()?;
    IconIndex::from_manifest_json(&raw).ok()
}

#[test]
fn common_queries_resolve_sensibly() {
    let Some(index) = manifest() else {
        eprintln!("skipped: icons-manifest.json not generated");
        return;
    };
    assert!(
        index.len() > 1000,
        "manifest looks truncated: {}",
        index.len()
    );

    for (query, expected) in [
        ("postgres", "brand-logos:postgresql"),
        ("redis", "brand-logos:redis"),
        ("s3", "aws:aws-s3"),
        ("load balancer", "generic:network:load-balancer"),
        ("api gateway", "generic:network:api-gateway"),
        ("queue", "generic:messaging:queue"),
        ("firewall", "generic:network:firewall"),
        ("lambda", "aws:aws-lambda"),
        ("message broker", "generic:messaging:message-broker"),
    ] {
        let hits = index.search(query, 3);
        assert!(!hits.is_empty(), "no icon found for \"{query}\"");
        assert_eq!(hits[0].entry.id, expected, "for \"{query}\"");
    }

    // Phrases where the head noun should decide, and words with no icon at all.
    for query in [
        "web server",
        "application server",
        "client",
        "user",
        "database",
    ] {
        let hits = index.search(query, 3);
        let names: Vec<&str> = hits.iter().map(|hit| hit.entry.id.as_str()).collect();
        eprintln!("{query:>20} -> {}", names.join(", "));
    }
}

/// Line-art UI icons used to win for plain architecture words, which made
/// generated diagrams look wrong.
#[test]
fn everyday_words_pick_architecture_icons() {
    let Some(index) = manifest() else { return };

    for query in ["user", "database", "server", "web server"] {
        let hits = index.search(query, 1);
        assert!(!hits.is_empty(), "nothing matched \"{query}\"");
        assert_ne!(
            hits[0].entry.category, "open-libs",
            "\"{query}\" picked the line-art set: {}",
            hits[0].entry.id
        );
    }

    // The head noun decides: a web server is a kind of server.
    let best = index.search("web server", 1)[0].entry.id.clone();
    assert!(best.contains("server"), "web server resolved to {best}");
}

#[test]
fn search_is_stable_across_runs() {
    let Some(index) = manifest() else { return };
    let first = index.search("database", 5);
    let second = index.search("database", 5);
    assert_eq!(first, second);
}
