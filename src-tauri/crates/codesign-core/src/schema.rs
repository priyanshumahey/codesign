//! JSON Schema → the OpenAPI 3.0 subset Vertex AI accepts.
//!
//! Gemini validates `functionDeclarations.parameters` against a protobuf
//! `Schema` message, so anything JSON Schema allows but that proto does not
//! have a field for is a hard 400. The two that bite:
//!
//! * `Option<T>` becomes `"type": ["string", "null"]`, but the proto's `type`
//!   is a single enum — it must be `"type": "string"` plus `"nullable": true`.
//! * Keywords with no proto field (`$schema`, `additionalProperties`, ...) are
//!   rejected rather than ignored.
//!
//! Anthropic and OpenAI take standard JSON Schema, so this runs in the Gemini
//! adapter only.

use serde_json::{Map, Value};

/// Fields the Vertex `Schema` message actually has.
const ALLOWED: &[&str] = &[
    "type",
    "format",
    "title",
    "description",
    "nullable",
    "default",
    "items",
    "minItems",
    "maxItems",
    "enum",
    "properties",
    "required",
    "minProperties",
    "maxProperties",
    "minimum",
    "maximum",
    "pattern",
    "example",
    "anyOf",
    "propertyOrdering",
];

pub fn to_openapi_subset(schema: &Value) -> Value {
    match schema {
        Value::Object(object) => Value::Object(convert(object)),
        other => other.clone(),
    }
}

fn convert(object: &Map<String, Value>) -> Map<String, Value> {
    let mut out = Map::new();

    for (key, value) in object {
        if !ALLOWED.contains(&key.as_str()) {
            continue;
        }
        match key.as_str() {
            "type" => {
                let (kind, nullable) = split_type(value);
                if let Some(kind) = kind {
                    out.insert("type".into(), kind);
                }
                if nullable {
                    out.insert("nullable".into(), Value::Bool(true));
                }
            }
            "properties" => {
                if let Value::Object(properties) = value {
                    let converted = properties
                        .iter()
                        .map(|(name, schema)| (name.clone(), to_openapi_subset(schema)))
                        .collect();
                    out.insert("properties".into(), Value::Object(converted));
                }
            }
            "items" => {
                out.insert("items".into(), to_openapi_subset(value));
            }
            "anyOf" => {
                if let Value::Array(variants) = value {
                    let converted = variants.iter().map(to_openapi_subset).collect();
                    out.insert("anyOf".into(), Value::Array(converted));
                }
            }
            _ => {
                out.insert(key.clone(), value.clone());
            }
        }
    }

    out
}

/// `["string", "null"]` -> (`"string"`, nullable).
fn split_type(value: &Value) -> (Option<Value>, bool) {
    match value {
        Value::Array(entries) => {
            let nullable = entries.iter().any(|entry| entry == "null");
            let kind = entries.iter().find(|entry| *entry != "null").cloned();
            (kind, nullable)
        }
        other => (Some(other.clone()), false),
    }
}

/// Every op tool, with parameters Gemini will accept.
pub fn gemini_function_declarations() -> Vec<Value> {
    crate::ops::tool_schemas()
        .into_iter()
        .map(|tool| {
            serde_json::json!({
                "name": tool.name,
                "description": tool.description,
                "parameters": to_openapi_subset(&tool.parameters),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn optional_fields_become_nullable() {
        let converted = to_openapi_subset(&json!({
            "type": "object",
            "properties": { "label": { "type": ["string", "null"] } }
        }));
        assert_eq!(converted["properties"]["label"]["type"], "string");
        assert_eq!(converted["properties"]["label"]["nullable"], true);
    }

    #[test]
    fn unsupported_keywords_are_dropped() {
        let converted = to_openapi_subset(&json!({
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "additionalProperties": false,
            "type": "object"
        }));
        assert!(converted.get("$schema").is_none());
        assert!(converted.get("additionalProperties").is_none());
        assert_eq!(converted["type"], "object");
    }

    #[test]
    fn nested_arrays_and_objects_are_converted() {
        let converted = to_openapi_subset(&json!({
            "type": "object",
            "properties": {
                "nodes": { "type": "array", "items": { "type": ["string", "null"] } },
                "size": {
                    "type": ["object", "null"],
                    "properties": { "width": { "type": "number", "format": "double" } }
                }
            }
        }));
        assert_eq!(converted["properties"]["nodes"]["items"]["nullable"], true);
        assert_eq!(converted["properties"]["size"]["type"], "object");
        assert_eq!(
            converted["properties"]["size"]["properties"]["width"]["format"],
            "double"
        );
    }

    #[test]
    fn declarations_carry_no_type_arrays() {
        let text = serde_json::to_string(&gemini_function_declarations()).unwrap();
        assert!(
            !text.contains(r#""type":["#),
            "a type array survived: {text}"
        );
        assert!(!text.contains("$schema"));
    }
}
