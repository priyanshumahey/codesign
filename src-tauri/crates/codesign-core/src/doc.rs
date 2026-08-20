//! The space document: a React Flow graph, modelled so it round-trips through
//! the on-disk `.codesign` JSON without losing fields the UI added.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};

/// Node `data` stays an open map — the UI is free to add keys, and dropping
/// unknown ones here would silently delete user work on the next save.
pub type DataMap = Map<String, Value>;

pub const SERVICE: &str = "service";
pub const BOUNDARY: &str = "boundary";
pub const NOTE: &str = "note";
pub const SYSTEM_EDGE: &str = "system";

pub const SERVICE_SIZE: Size = Size {
    width: 112.0,
    height: 96.0,
};
pub const BOUNDARY_SIZE: Size = Size {
    width: 340.0,
    height: 240.0,
};
pub const NOTE_SIZE: Size = Size {
    width: 200.0,
    height: 44.0,
};

pub const BOUNDARY_COLORS: [&str; 6] = ["slate", "sky", "violet", "emerald", "amber", "rose"];
pub const EDGE_DIRECTIONS: [&str; 4] = ["forward", "backward", "both", "none"];
pub const SERVICE_STATUSES: [&str; 4] = ["live", "planned", "degraded", "deprecated"];
pub const HTTP_METHODS: [&str; 10] = [
    "GET", "POST", "PUT", "PATCH", "DELETE", "WS", "GRPC", "EVENT", "QUERY", "MUTATION",
];

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "String", into = "String")]
pub enum NodeKind {
    Service,
    Boundary,
    Note,
    /// Anything this build does not know about, preserved verbatim.
    Other(String),
}

impl NodeKind {
    pub fn as_str(&self) -> &str {
        match self {
            NodeKind::Service => SERVICE,
            NodeKind::Boundary => BOUNDARY,
            NodeKind::Note => NOTE,
            NodeKind::Other(value) => value,
        }
    }

    pub fn default_size(&self) -> Size {
        match self {
            NodeKind::Boundary => BOUNDARY_SIZE,
            NodeKind::Note => NOTE_SIZE,
            _ => SERVICE_SIZE,
        }
    }
}

impl From<String> for NodeKind {
    fn from(value: String) -> Self {
        match value.as_str() {
            SERVICE => NodeKind::Service,
            BOUNDARY => NodeKind::Boundary,
            NOTE => NodeKind::Note,
            _ => NodeKind::Other(value),
        }
    }
}

impl From<NodeKind> for String {
    fn from(value: NodeKind) -> Self {
        value.as_str().to_string()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: NodeKind,
    pub position: Point,
    #[serde(default)]
    pub data: DataMap,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extent: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    #[serde(rename = "type", default = "system_edge_type")]
    pub kind: String,
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub source_handle: Option<String>,
    #[serde(default)]
    pub target_handle: Option<String>,
    #[serde(default)]
    pub data: DataMap,
}

fn system_edge_type() -> String {
    SYSTEM_EDGE.to_string()
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct Doc {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

/// Lenient on purpose: a file written by a newer build, or edited by hand,
/// should open with whatever still makes sense rather than failing outright.
/// This mirrors what the canvas loader does in the UI.
impl<'de> Deserialize<'de> for Doc {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Raw {
            #[serde(default)]
            nodes: Vec<Value>,
            #[serde(default)]
            edges: Vec<Value>,
        }

        let raw = Raw::deserialize(deserializer)?;
        let mut nodes: Vec<Node> = raw
            .nodes
            .into_iter()
            .filter_map(|value| serde_json::from_value::<Node>(value).ok())
            .collect();

        let ids: HashSet<String> = nodes.iter().map(|node| node.id.clone()).collect();
        for node in &mut nodes {
            if node
                .parent_id
                .as_ref()
                .is_some_and(|parent| !ids.contains(parent))
            {
                node.parent_id = None;
                node.extent = None;
            }
        }

        let edges: Vec<Edge> = raw
            .edges
            .into_iter()
            .filter_map(|value| serde_json::from_value::<Edge>(value).ok())
            .filter(|edge| ids.contains(&edge.source) && ids.contains(&edge.target))
            .collect();

        Ok(Doc { nodes, edges })
    }
}

impl Node {
    /// The user-visible name, which lives under a different key per node kind.
    pub fn display_label(&self) -> Option<&str> {
        let key = if matches!(self.kind, NodeKind::Note) {
            "text"
        } else {
            "label"
        };
        self.data.get(key).and_then(Value::as_str)
    }

    pub fn size(&self) -> Size {
        match (self.width, self.height) {
            (Some(width), Some(height)) => Size { width, height },
            _ => self.kind.default_size(),
        }
    }
}

impl Doc {
    pub fn node(&self, id: &str) -> Option<&Node> {
        self.nodes.iter().find(|node| node.id == id)
    }

    pub fn node_mut(&mut self, id: &str) -> Option<&mut Node> {
        self.nodes.iter_mut().find(|node| node.id == id)
    }

    pub fn edge(&self, id: &str) -> Option<&Edge> {
        self.edges.iter().find(|edge| edge.id == id)
    }

    pub fn edge_mut(&mut self, id: &str) -> Option<&mut Edge> {
        self.edges.iter_mut().find(|edge| edge.id == id)
    }

    /// Child positions are parent-relative, so walk up to canvas coordinates.
    /// Cycle-safe: a corrupt parent chain stops rather than hanging.
    pub fn absolute_position(&self, node: &Node) -> Point {
        let mut point = node.position;
        let mut seen = vec![node.id.as_str()];
        let mut parent = node.parent_id.as_deref().and_then(|id| self.node(id));
        while let Some(current) = parent {
            if seen.contains(&current.id.as_str()) {
                break;
            }
            seen.push(current.id.as_str());
            point.x += current.position.x;
            point.y += current.position.y;
            parent = current.parent_id.as_deref().and_then(|id| self.node(id));
        }
        point
    }

    /// Absolute position of a node's coordinate origin — what child positions
    /// are measured from.
    pub fn origin_of(&self, parent: Option<&str>) -> Point {
        parent
            .and_then(|id| self.node(id))
            .map(|node| self.absolute_position(node))
            .unwrap_or_default()
    }

    pub fn children_of(&self, parent: Option<&str>) -> Vec<&Node> {
        self.nodes
            .iter()
            .filter(|node| node.parent_id.as_deref() == parent)
            .collect()
    }

    /// Every descendant of `id`, deepest last. Cycle-safe.
    pub fn descendants_of(&self, id: &str) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let mut frontier = vec![id.to_string()];
        while let Some(current) = frontier.pop() {
            for node in &self.nodes {
                if node.parent_id.as_deref() == Some(current.as_str())
                    && !out.contains(&node.id)
                    && node.id != id
                {
                    out.push(node.id.clone());
                    frontier.push(node.id.clone());
                }
            }
        }
        out
    }

    /// React Flow reads parents from array order — a child listed before its
    /// boundary renders at absolute coordinates and jumps out of the box.
    pub fn sort_by_parenting(&mut self) {
        let parents: HashMap<String, Option<String>> = self
            .nodes
            .iter()
            .map(|node| (node.id.clone(), node.parent_id.clone()))
            .collect();
        let mut keys = HashMap::with_capacity(self.nodes.len());

        for (position, node) in self.nodes.iter().enumerate() {
            let mut depth = 0;
            let mut current = node.parent_id.as_ref();
            let mut seen = HashSet::new();
            while let Some(parent) = current {
                if !seen.insert(parent) {
                    break;
                }
                depth += 1;
                current = parents.get(parent).and_then(Option::as_ref);
            }
            let kind = usize::from(!matches!(node.kind, NodeKind::Boundary));
            keys.insert(node.id.clone(), (depth, kind, position));
        }

        self.nodes
            .sort_by_key(|node| keys.get(&node.id).copied().unwrap_or_default());
    }

    pub fn from_value(value: Value) -> Result<Self, serde_json::Error> {
        serde_json::from_value(value)
    }

    pub fn to_value(&self) -> Result<Value, serde_json::Error> {
        serde_json::to_value(self)
    }
}

pub fn data_str<'a>(data: &'a DataMap, key: &str) -> Option<&'a str> {
    data.get(key).and_then(Value::as_str)
}

pub fn set_data_str(data: &mut DataMap, key: &str, value: impl Into<String>) {
    data.insert(key.to_string(), Value::String(value.into()));
}
