//! Where a newly created node goes when the caller did not say.
//!
//! Models are poor at spatial reasoning, so `position` is optional on every
//! create op and this module fills it in: a stable grid scan that never
//! overlaps an existing sibling.

use crate::doc::{Doc, Point, Size};

const GAP: f64 = 48.0;
const PADDING: f64 = 32.0;
const COLUMNS: usize = 6;
const MAX_ROWS: usize = 200;

/// Absolute canvas position for a new node of `size` under `parent`.
pub fn place(doc: &Doc, parent: Option<&str>, size: Size) -> Point {
    let siblings: Vec<(Point, Size)> = doc
        .children_of(parent)
        .iter()
        .map(|node| (doc.absolute_position(node), node.size()))
        .collect();

    let origin = match parent.and_then(|id| doc.node(id)) {
        Some(boundary) => {
            let at = doc.absolute_position(boundary);
            Point {
                x: at.x + PADDING,
                y: at.y + PADDING,
            }
        }
        None if siblings.is_empty() => Point::default(),
        None => {
            let min_x = siblings
                .iter()
                .map(|(p, _)| p.x)
                .fold(f64::INFINITY, f64::min);
            let min_y = siblings
                .iter()
                .map(|(p, _)| p.y)
                .fold(f64::INFINITY, f64::min);
            Point { x: min_x, y: min_y }
        }
    };

    if siblings.is_empty() {
        return origin;
    }

    let step_x = size.width + GAP;
    let step_y = size.height + GAP;

    for row in 0..MAX_ROWS {
        for column in 0..COLUMNS {
            let candidate = Point {
                x: origin.x + column as f64 * step_x,
                y: origin.y + row as f64 * step_y,
            };
            if siblings
                .iter()
                .all(|(at, sibling)| !overlaps(candidate, size, *at, *sibling))
            {
                return candidate;
            }
        }
    }

    // Every slot taken: drop below everything rather than stack invisibly.
    let max_y = siblings
        .iter()
        .map(|(at, sibling)| at.y + sibling.height)
        .fold(f64::NEG_INFINITY, f64::max);
    Point {
        x: origin.x,
        y: max_y + GAP,
    }
}

fn overlaps(a_at: Point, a: Size, b_at: Point, b: Size) -> bool {
    a_at.x < b_at.x + b.width + GAP
        && a_at.x + a.width + GAP > b_at.x
        && a_at.y < b_at.y + b.height + GAP
        && a_at.y + a.height + GAP > b_at.y
}
