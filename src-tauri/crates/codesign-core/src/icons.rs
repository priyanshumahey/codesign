//! Searchable index over `icons-manifest.json`.
//!
//! The manifest holds ~1.6k icons, far too many to put in a prompt, so the
//! agent gets a search tool instead and every icon id it produces is validated
//! against this index before it reaches the document.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IconEntry {
    /// Stable id like `generic:network:api-gateway`.
    pub id: String,
    pub name: String,
    /// Public path, e.g. `/icons/generic/network/api-gateway.svg`.
    pub path: String,
    pub category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subcategory: Option<String>,
    /// Single-colour art the UI tints with the theme colour.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mono: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    #[serde(default)]
    by_category: HashMap<String, Vec<IconEntry>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IconHit {
    pub entry: IconEntry,
    pub score: i32,
}

#[derive(Debug, Default)]
pub struct IconIndex {
    entries: Vec<IconEntry>,
    by_id: HashMap<String, usize>,
}

impl IconIndex {
    pub fn empty() -> Self {
        Self::default()
    }

    pub fn from_manifest_json(raw: &str) -> Result<Self, serde_json::Error> {
        let manifest: Manifest = serde_json::from_str(raw)?;
        let mut entries: Vec<IconEntry> = manifest.by_category.into_values().flatten().collect();
        // HashMap iteration order is random; sort so search results are stable.
        entries.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(Self::from_entries(entries))
    }

    pub fn from_entries(entries: Vec<IconEntry>) -> Self {
        let by_id = entries
            .iter()
            .enumerate()
            .map(|(index, entry)| (entry.id.clone(), index))
            .collect();
        Self { entries, by_id }
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn get(&self, id: &str) -> Option<&IconEntry> {
        self.by_id.get(id).map(|index| &self.entries[*index])
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<IconHit> {
        let needle = normalize(query);
        if needle.is_empty() {
            return Vec::new();
        }
        let tokens: Vec<&str> = needle.split(' ').filter(|t| !t.is_empty()).collect();
        let library_named = tokens.iter().any(|token| LIBRARY_WORDS.contains(token));

        let mut hits: Vec<IconHit> = self
            .entries
            .iter()
            .filter_map(|entry| {
                score(entry, &needle, &tokens, library_named).map(|score| IconHit {
                    entry: entry.clone(),
                    score,
                })
            })
            .collect();

        // Ties broken by id so repeated searches never reshuffle.
        hits.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then_with(|| a.entry.id.cmp(&b.entry.id))
        });
        hits.truncate(limit);
        hits
    }
}

const OPEN_LIBS: &str = "open-libs";
const LIBRARY_WORDS: [&str; 5] = ["feather", "fontawesome", "heroicons", "material", "libs"];

/// Line-art UI sets read poorly on an architecture canvas, so they sit below
/// everything purpose-built unless the set itself was asked for by name.
fn category_bonus(entry: &IconEntry, library_named: bool) -> i32 {
    match entry.category.as_str() {
        OPEN_LIBS if !library_named => -400,
        OPEN_LIBS => 0,
        "generic" => 60,
        "aws" | "gcp" | "azure" | "kubernetes" => 40,
        "tech-logos" | "brand-logos" | "brand-logos-extra" => 30,
        _ => 0,
    }
}

fn normalize(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut last_was_space = true;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.extend(ch.to_lowercase());
            last_was_space = false;
        } else if !last_was_space {
            out.push(' ');
            last_was_space = true;
        }
    }
    out.trim_end().to_string()
}

/// `None` means "no match at all" so non-matching icons are dropped rather
/// than ranked. A query only some of whose words match still counts — nothing
/// is called both "web" and "server", but "web server" clearly means Server.
fn score(entry: &IconEntry, needle: &str, tokens: &[&str], library_named: bool) -> Option<i32> {
    let id = normalize(&entry.id);
    let name = normalize(&entry.name);
    let leaf = entry
        .id
        .rsplit(':')
        .next()
        .map(normalize)
        .unwrap_or_default();

    let base = if entry.id.eq_ignore_ascii_case(needle) || id == needle {
        1000
    } else if leaf == needle {
        900
    } else if name == needle {
        880
    } else {
        let mut total = 0.0;
        let mut matched = 0.0;
        let mut possible = 0.0;
        for (position, token) in tokens.iter().enumerate() {
            // "web server" is a kind of server, not a kind of web: the last
            // word carries the meaning, so it counts for more.
            let weight = if tokens.len() > 1 && position + 1 == tokens.len() {
                1.5
            } else {
                1.0
            };
            possible += weight;
            if let Some(score) = token_score(token, &name, &id, &leaf) {
                total += score as f64 * weight;
                matched += weight;
            }
        }
        if matched == 0.0 {
            return None;
        }
        // Partial matches are allowed but rank below a full one.
        (total / possible) as i32
    };

    // Prefer the shorter of two equally good matches ("redis" over "redis-cluster").
    let brevity = (60 - name.len().min(60)) as i32 / 4;
    Some(base + brevity + category_bonus(entry, library_named))
}

fn token_score(token: &str, name: &str, id: &str, leaf: &str) -> Option<i32> {
    if leaf == token {
        return Some(700);
    }
    // A whole word beats a prefix of a longer one: "browser" means Web Browser,
    // not Browserify.
    if has_word(leaf, token) || has_word(name, token) {
        return Some(660);
    }
    if leaf.starts_with(token) {
        return Some(640);
    }
    if word_prefix(name, token) || word_prefix(leaf, token) {
        return Some(600);
    }
    if name.contains(token) || leaf.contains(token) {
        return Some(450);
    }
    if id.contains(token) {
        return Some(300);
    }
    None
}

fn has_word(haystack: &str, token: &str) -> bool {
    haystack.split(' ').any(|word| word == token)
}

fn word_prefix(haystack: &str, token: &str) -> bool {
    haystack.split(' ').any(|word| word.starts_with(token))
}

/// Stands in when nothing matches, so an unknown icon never blocks an edit.
pub const FALLBACK_ICON: &str = "generic:primitives:box";

/// Icon ids mirror their public path, so a path can be recovered when no
/// manifest is loaded (headless runs without the asset bundle).
pub fn path_from_id(id: &str) -> String {
    format!("/icons/{}.svg", id.replace(':', "/"))
}

/// The category segment of an icon id.
pub fn category_from_id(id: &str) -> String {
    id.split(':').next().unwrap_or_default().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index() -> IconIndex {
        IconIndex::from_entries(vec![
            entry("generic:network:api-gateway", "API Gateway"),
            entry("aws:dynamodb", "DynamoDB"),
            entry("tech-logos:redis", "Redis"),
            entry("brand-logos:databases-data:redis-cluster", "Redis Cluster"),
            entry("generic:compute:server", "Server"),
            entry("generic:user:user-single", "User Single"),
            entry("generic:user:web-browser", "Web Browser"),
            entry("open-libs:feather:user", "User"),
            entry("open-libs:feather:database", "Database"),
            entry("generic:data:database", "Database"),
        ])
    }

    fn entry(id: &str, name: &str) -> IconEntry {
        IconEntry {
            id: id.to_string(),
            name: name.to_string(),
            path: path_from_id(id),
            category: category_from_id(id),
            subcategory: None,
            mono: None,
        }
    }

    #[test]
    fn exact_id_wins() {
        let hits = index().search("aws:dynamodb", 5);
        assert_eq!(hits[0].entry.id, "aws:dynamodb");
        assert!(
            hits.len() == 1 || hits[0].score > hits[1].score,
            "an exact id should outrank everything else"
        );
    }

    #[test]
    fn leaf_match_beats_longer_relative() {
        let hits = index().search("redis", 5);
        assert_eq!(hits[0].entry.id, "tech-logos:redis");
    }

    #[test]
    fn multi_word_query_matches_display_name() {
        let hits = index().search("api gateway", 5);
        assert_eq!(hits[0].entry.id, "generic:network:api-gateway");
    }

    #[test]
    fn nonsense_finds_nothing() {
        assert!(index().search("zzzzqqqq", 5).is_empty());
    }

    #[test]
    fn path_is_derived_from_id() {
        assert_eq!(
            path_from_id("generic:network:api-gateway"),
            "/icons/generic/network/api-gateway.svg"
        );
    }

    /// Nothing is called both "web" and "server", and requiring every word to
    /// match used to return nothing at all for this.
    #[test]
    fn a_partly_matching_phrase_still_finds_something() {
        let hits = index().search("web server", 5);
        assert_eq!(hits[0].entry.id, "generic:compute:server");
    }

    #[test]
    fn line_art_sets_lose_to_purpose_built_icons() {
        let hits = index().search("user", 5);
        assert_eq!(hits[0].entry.id, "generic:user:user-single");

        let hits = index().search("database", 5);
        assert_eq!(hits[0].entry.id, "generic:data:database");
    }

    #[test]
    fn naming_the_set_brings_it_back() {
        let hits = index().search("feather user", 5);
        assert_eq!(hits[0].entry.id, "open-libs:feather:user");
    }
}
