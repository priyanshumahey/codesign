//! The operation vocabulary.
//!
//! One `Op` is one edit. The same enum is the LLM's tool surface, the MCP tool
//! surface, and the wire format the webview sends — so there is exactly one
//! definition of what can be done to a space.
//!
//! Fields are snake_case here (unlike the camelCase document format) because
//! this is a tool-calling interface, not the file format.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::doc::{Point, Size};

/// How ops address existing nodes and edges.
///
/// Resolution order: an `alias` created earlier in the same batch, then an
/// exact id, then a unique exact label match.
pub type Selector = String;

// The types below exist only to put an `enum` into the generated schema. The
// fields stay `String` so a model that shouts "post" is still understood, but
// advertising the vocabulary stops it guessing in the first place.
macro_rules! schema_enum {
    ($name:ident, $case:literal, [$($variant:ident),+ $(,)?]) => {
        #[derive(JsonSchema)]
        #[schemars(rename_all = $case)]
        #[allow(dead_code)]
        pub enum $name { $($variant),+ }
    };
}

schema_enum!(
    HttpMethodChoice,
    "UPPERCASE",
    [Get, Post, Put, Patch, Delete, Ws, Grpc, Event, Query, Mutation]
);
schema_enum!(
    EdgeDirectionChoice,
    "lowercase",
    [Forward, Backward, Both, None]
);
schema_enum!(
    BoundaryColorChoice,
    "lowercase",
    [Slate, Sky, Violet, Emerald, Amber, Rose]
);
schema_enum!(NoteVariantChoice, "lowercase", [Heading, Body]);
schema_enum!(
    ServiceStatusChoice,
    "lowercase",
    [Live, Planned, Degraded, Deprecated]
);

/// Add a service node — a box with an icon representing a component.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CreateService {
    /// Icon id from `search_icons` (e.g. `aws:dynamodb`). A plain search term
    /// such as "postgres" also works and resolves to the best match.
    pub icon: String,
    /// Name shown under the icon.
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Link to the repo, runbook or dashboard that backs this component.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    /// Team or person accountable for this component.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    /// One of: live, planned, degraded, deprecated.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<ServiceStatusChoice>")]
    pub status: Option<String>,
    /// Boundary to place this inside. Omit for top level.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<Selector>,
    /// Absolute canvas position. Omit to let the layout choose a free spot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Point>,
    /// Short handle for referring to this node in later ops of the same batch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
}

/// Add a boundary — a labelled container that groups nodes (a VPC, a service
/// mesh, a team).
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CreateBoundary {
    pub label: String,
    /// One of: slate, sky, violet, emerald, amber, rose.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<BoundaryColorChoice>")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<Selector>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Point>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
}

/// Add a free-floating text note.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CreateNote {
    pub text: String,
    /// `heading` or `body`. Defaults to `body`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<NoteVariantChoice>")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<Selector>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Point>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
}

/// Change the content of an existing node. Omitted fields are left alone.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct UpdateNode {
    pub node: Selector,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Note text. Only meaningful for note nodes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Boundary colour. Only meaningful for boundary nodes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<BoundaryColorChoice>")]
    pub color: Option<String>,
    /// New icon id or search term. Only meaningful for service nodes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Link to the repo, runbook or dashboard. Only for service nodes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    /// Team or person accountable. Only for service nodes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    /// One of: live, planned, degraded, deprecated. Only for service nodes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<ServiceStatusChoice>")]
    pub status: Option<String>,
}

/// Move a node to an absolute canvas position.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct MoveNode {
    pub node: Selector,
    pub position: Point,
}

/// Resize a node. Mostly useful for boundaries.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct ResizeNode {
    pub node: Selector,
    pub size: Size,
}

/// Move a node into a boundary, or out to the top level. The node keeps its
/// on-screen position.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct SetParent {
    pub node: Selector,
    /// Target boundary, or null for the top level.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<Selector>,
}

/// Draw a connection between two nodes.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Connect {
    pub source: Selector,
    pub target: Selector,
    /// Short text on the line, e.g. "reads orders".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// One of: GET, POST, PUT, PATCH, DELETE, WS, GRPC, EVENT, QUERY, MUTATION.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<HttpMethodChoice>")]
    pub method: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    /// Arrowheads: forward, backward, both, none. Defaults to forward.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<EdgeDirectionChoice>")]
    pub direction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
}

/// Change an existing connection. Omitted fields are left alone.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct UpdateEdge {
    pub edge: Selector,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<HttpMethodChoice>")]
    pub method: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Option<EdgeDirectionChoice>")]
    pub direction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
}

/// Remove nodes and/or connections. Connections touching a removed node go
/// with it.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
pub struct Delete {
    #[serde(default)]
    pub nodes: Vec<Selector>,
    #[serde(default)]
    pub edges: Vec<Selector>,
    /// When true, removing a boundary also removes everything inside it.
    /// When false (the default) the contents are kept and promoted out.
    #[serde(default)]
    pub cascade: bool,
}

/// Tidy the whole diagram into left-to-right layers, sizing every boundary to
/// fit what is inside it. Worth calling once after building something new.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
pub struct AutoLayout {
    /// Limit the tidy-up to the contents of one boundary. Omit for everything.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub within: Option<Selector>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Op {
    CreateService(CreateService),
    CreateBoundary(CreateBoundary),
    CreateNote(CreateNote),
    UpdateNode(UpdateNode),
    MoveNode(MoveNode),
    ResizeNode(ResizeNode),
    SetParent(SetParent),
    Connect(Connect),
    UpdateEdge(UpdateEdge),
    Delete(Delete),
    AutoLayout(AutoLayout),
}

impl Op {
    pub fn name(&self) -> &'static str {
        match self {
            Op::CreateService(_) => "create_service",
            Op::CreateBoundary(_) => "create_boundary",
            Op::CreateNote(_) => "create_note",
            Op::UpdateNode(_) => "update_node",
            Op::MoveNode(_) => "move_node",
            Op::ResizeNode(_) => "resize_node",
            Op::SetParent(_) => "set_parent",
            Op::Connect(_) => "connect",
            Op::UpdateEdge(_) => "update_edge",
            Op::Delete(_) => "delete",
            Op::AutoLayout(_) => "auto_layout",
        }
    }
}

/// A single tool as advertised to an LLM or an MCP client.
#[derive(Clone, Debug, Serialize)]
pub struct ToolSchema {
    pub name: &'static str,
    pub description: String,
    /// JSON Schema for the arguments object.
    pub parameters: Value,
}

/// Sub-schemas are inlined and `$schema` dropped, because `$ref` is not part
/// of the OpenAPI subset Gemini accepts for function declarations.
fn schema_of<T: JsonSchema>() -> (String, Value) {
    let settings = schemars::gen::SchemaSettings::default().with(|settings| {
        settings.inline_subschemas = true;
        settings.meta_schema = None;
    });
    let root = settings.into_generator().into_root_schema_for::<T>();
    let description = root
        .schema
        .metadata
        .as_ref()
        .and_then(|meta| meta.description.clone())
        .unwrap_or_default();
    let parameters = serde_json::to_value(&root).unwrap_or(Value::Null);
    (description, parameters)
}

macro_rules! tool_schemas_for {
    ($($name:literal => $ty:ty),* $(,)?) => {
        vec![$({
            let (description, parameters) = schema_of::<$ty>();
            ToolSchema { name: $name, description, parameters }
        }),*]
    };
}

/// Every mutating op, one tool each.
pub fn tool_schemas() -> Vec<ToolSchema> {
    tool_schemas_for![
        "create_service" => CreateService,
        "create_boundary" => CreateBoundary,
        "create_note" => CreateNote,
        "update_node" => UpdateNode,
        "move_node" => MoveNode,
        "resize_node" => ResizeNode,
        "set_parent" => SetParent,
        "connect" => Connect,
        "update_edge" => UpdateEdge,
        "delete" => Delete,
        "auto_layout" => AutoLayout,
    ]
}

/// One schema covering every op, for callers that take a batch. Clients that
/// accept full JSON Schema (MCP) can use this; Gemini cannot, which is why
/// `tool_schemas` exists separately.
pub fn op_schema() -> Value {
    let settings = schemars::gen::SchemaSettings::default().with(|settings| {
        settings.inline_subschemas = true;
        settings.meta_schema = None;
    });
    let root = settings.into_generator().into_root_schema_for::<Op>();
    serde_json::to_value(&root).unwrap_or(Value::Null)
}

/// Build an `Op` from a tool name plus its raw arguments.
pub fn op_from_tool_call(name: &str, arguments: Value) -> Result<Op, serde_json::Error> {
    let mut object = match arguments {
        Value::Object(map) => map,
        other => {
            let mut map = serde_json::Map::new();
            if !other.is_null() {
                map.insert("value".into(), other);
            }
            map
        }
    };
    object.insert("op".into(), Value::String(name.to_string()));
    serde_json::from_value(Value::Object(object))
}
