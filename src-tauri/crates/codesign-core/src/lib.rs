//! Host-agnostic core for codesign spaces.
//!
//! Everything that can change a diagram lives here as a pure function over a
//! [`Doc`]. The Tauri app, the MCP server and the headless binary are all thin
//! callers, which is what keeps the live canvas and offline editing from
//! drifting apart.

pub mod apply;
pub mod doc;
pub mod icons;
pub mod ids;
pub mod layout;
pub mod mcp;
pub mod ops;
pub mod place;
pub mod schema;
pub mod store;
pub mod summary;

pub use apply::{apply, Aliases, Applied, ApplyCtx, ApplyError, Outcome};
pub use doc::{Doc, Edge, Node, NodeKind, Point, Size};
pub use icons::{IconEntry, IconHit, IconIndex};
pub use ids::IdGen;
pub use ops::{tool_schemas, Op, ToolSchema};
