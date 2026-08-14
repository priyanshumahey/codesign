//! Id generation matching the format the UI already writes, so ids coming from
//! Rust are indistinguishable from ids created by dragging a tile.

use std::time::{SystemTime, UNIX_EPOCH};

pub struct IdGen {
    stamp: String,
    session: String,
    counter: u64,
}

impl IdGen {
    pub fn new() -> Self {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let session: String = uuid::Uuid::new_v4()
            .simple()
            .to_string()
            .chars()
            .take(4)
            .collect();
        Self {
            stamp: to_base36(millis),
            session,
            counter: 0,
        }
    }

    /// Fixed inputs so tests can assert on exact ids.
    pub fn fixed(stamp: &str, session: &str) -> Self {
        Self {
            stamp: stamp.to_string(),
            session: session.to_string(),
            counter: 0,
        }
    }

    pub fn next(&mut self, prefix: &str) -> String {
        let id = format!("{}-{}-{}{}", prefix, self.stamp, self.session, self.counter);
        self.counter += 1;
        id
    }
}

impl Default for IdGen {
    fn default() -> Self {
        Self::new()
    }
}

fn to_base36(mut value: u64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_string();
    }
    let mut out = Vec::new();
    while value > 0 {
        out.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base36_matches_javascript() {
        // Number(1723600000000).toString(36)
        assert_eq!(to_base36(1_723_600_000_000), "lzt6xrls");
        assert_eq!(to_base36(0), "0");
        assert_eq!(to_base36(35), "z");
        assert_eq!(to_base36(36), "10");
    }

    #[test]
    fn ids_are_sequential_and_prefixed() {
        let mut ids = IdGen::fixed("t", "abcd");
        assert_eq!(ids.next("node"), "node-t-abcd0");
        assert_eq!(ids.next("node"), "node-t-abcd1");
        assert_eq!(ids.next("edge"), "edge-t-abcd2");
    }
}
