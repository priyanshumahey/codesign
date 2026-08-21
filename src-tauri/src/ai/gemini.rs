//! Gemini adapter, over Vertex AI (OAuth) or AI Studio (API key).
//!
//! The two products speak the same request shape, so they differ only in URL
//! and credential. Vertex is the default because it bills to Google Cloud and
//! authenticates with the gcloud credentials already on the machine.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tokio::sync::mpsc::UnboundedSender;

use super::provider::{ChatRequest, Message, Part, Provider, Role, StreamEvent};

const OAUTH_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// Refresh a little early so a request never starts with a stale token.
const TOKEN_SKEW: Duration = Duration::from_secs(120);

#[derive(Clone, Debug)]
pub enum Transport {
    Vertex { project: String, location: String },
    AiStudio { api_key: String },
}

pub struct GeminiProvider {
    http: reqwest::Client,
    transport: Transport,
    token: Mutex<Option<(String, Instant)>>,
}

impl GeminiProvider {
    pub fn new(transport: Transport) -> Self {
        Self {
            http: reqwest::Client::new(),
            transport,
            token: Mutex::new(None),
        }
    }

    fn endpoint(&self, model: &str) -> String {
        match &self.transport {
            // The `global` location has broader model availability than any
            // single region.
            Transport::Vertex { project, location } => format!(
                "https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}\
                 /publishers/google/models/{model}:streamGenerateContent?alt=sse"
            ),
            Transport::AiStudio { api_key } => format!(
                "https://generativelanguage.googleapis.com/v1beta/models/\
                 {model}:streamGenerateContent?alt=sse&key={api_key}"
            ),
        }
    }

    async fn authorize(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<reqwest::RequestBuilder, String> {
        match &self.transport {
            Transport::AiStudio { .. } => Ok(request),
            Transport::Vertex { .. } => {
                let token = self.access_token().await?;
                Ok(request.bearer_auth(token))
            }
        }
    }

    async fn access_token(&self) -> Result<String, String> {
        if let Some((token, expires)) = self.token.lock().ok().and_then(|slot| slot.clone()) {
            if Instant::now() + TOKEN_SKEW < expires {
                return Ok(token);
            }
        }

        let credentials = AdcCredentials::load()?;
        let response = self
            .http
            .post(OAUTH_TOKEN_URL)
            .form(&[
                ("client_id", credentials.client_id.as_str()),
                ("client_secret", credentials.client_secret.as_str()),
                ("refresh_token", credentials.refresh_token.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|e| format!("could not reach Google for a token: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("sign-in failed ({status}): {}", first_line(&body)));
        }

        let refreshed: TokenResponse = response
            .json()
            .await
            .map_err(|e| format!("unexpected token response: {e}"))?;

        let expires = Instant::now() + Duration::from_secs(refreshed.expires_in.max(60));
        if let Ok(mut slot) = self.token.lock() {
            *slot = Some((refreshed.access_token.clone(), expires));
        }
        Ok(refreshed.access_token)
    }
}

#[async_trait]
impl Provider for GeminiProvider {
    async fn stream(
        &self,
        request: ChatRequest,
        events: UnboundedSender<StreamEvent>,
    ) -> Result<Message, String> {
        let body = build_body(&request);
        let call = self.http.post(self.endpoint(&request.model)).json(&body);
        let response = self
            .authorize(call)
            .await?
            .send()
            .await
            .map_err(|e| format!("could not reach Gemini: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "Gemini rejected the request ({status}): {}",
                first_line(&body)
            ));
        }

        let mut assembled = Assembled::default();
        let mut buffer = String::new();
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("connection dropped: {e}"))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Keep any partial tail; Vertex terminates frames with CRLF.
            while let Some((end, skip)) = next_frame(&buffer) {
                let frame = buffer[..end].to_string();
                buffer.drain(..end + skip);
                if let Some(payload) = sse_payload(&frame) {
                    let parsed: Value = match serde_json::from_str(&payload) {
                        Ok(value) => value,
                        Err(_) => continue,
                    };
                    assembled.absorb(&parsed, &events);
                }
            }
        }

        Ok(assembled.into_message())
    }

    async fn models(&self) -> Result<Vec<String>, String> {
        let call = match &self.transport {
            // Listing is not project-scoped in the URL, so the quota project has
            // to travel in a header or the call is refused.
            Transport::Vertex { project, .. } => self
                .http
                .get("https://aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=200")
                .header("x-goog-user-project", project),
            Transport::AiStudio { api_key } => self.http.get(format!(
                "https://generativelanguage.googleapis.com/v1beta/models?key={api_key}&pageSize=200"
            )),
        };

        let response = self
            .authorize(call)
            .await?
            .send()
            .await
            .map_err(|e| format!("could not list models: {e}"))?;
        if !response.status().is_success() {
            let status = response.status();
            return Err(format!("could not list models ({status})"));
        }

        let body: Value = response.json().await.map_err(|e| e.to_string())?;
        let listed = body
            .get("publisherModels")
            .or_else(|| body.get("models"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        let mut models: Vec<String> = listed
            .iter()
            .filter_map(|entry| entry.get("name").and_then(Value::as_str))
            .filter_map(|name| name.rsplit('/').next())
            .filter(|id| is_chat_model(id))
            .map(str::to_string)
            .collect();

        models.sort_by(|a, b| {
            version_of(b)
                .partial_cmp(&version_of(a))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.cmp(b))
        });
        models.dedup();
        Ok(models)
    }
}

/// Drops the speech, image, embedding and dated-snapshot entries, which either
/// cannot hold a tool-calling conversation or duplicate a stable alias.
fn is_chat_model(id: &str) -> bool {
    if !id.starts_with("gemini-") {
        return false;
    }
    const EXCLUDED: [&str; 6] = ["tts", "embedding", "image", "live", "audio", "-exp-"];
    if EXCLUDED.iter().any(|banned| id.contains(banned)) {
        return false;
    }
    !id.rsplit('-')
        .next()
        .is_some_and(|tail| tail.chars().all(|c| c.is_ascii_digit()))
}

fn version_of(id: &str) -> f64 {
    id.trim_start_matches("gemini-")
        .split('-')
        .next()
        .and_then(|version| version.parse().ok())
        .unwrap_or(0.0)
}

#[derive(Default)]
struct Assembled {
    parts: Vec<Part>,
    calls: usize,
}

impl Assembled {
    fn absorb(&mut self, chunk: &Value, events: &UnboundedSender<StreamEvent>) {
        if let Some(usage) = chunk.get("usageMetadata") {
            let _ = events.send(StreamEvent::Usage {
                input: usage
                    .get("promptTokenCount")
                    .and_then(Value::as_u64)
                    .unwrap_or(0) as u32,
                output: usage
                    .get("candidatesTokenCount")
                    .and_then(Value::as_u64)
                    .unwrap_or(0) as u32,
            });
        }

        let Some(parts) = chunk
            .pointer("/candidates/0/content/parts")
            .and_then(Value::as_array)
        else {
            return;
        };

        for part in parts {
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                if !text.is_empty() {
                    let _ = events.send(StreamEvent::Text(text.to_string()));
                    self.push_text(text);
                }
            }

            if let Some(call) = part.get("functionCall") {
                let name = call.get("name").and_then(Value::as_str).unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                // Gemini does not issue tool-call ids, so synthesize stable ones.
                self.calls += 1;
                self.parts.push(Part::ToolCall {
                    id: format!("call-{}", self.calls),
                    name: name.to_string(),
                    args: call.get("args").cloned().unwrap_or_else(|| json!({})),
                    signature: part
                        .get("thoughtSignature")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                });
            }
        }
    }

    /// Text arrives in many small deltas; keep it as one part.
    fn push_text(&mut self, text: &str) {
        match self.parts.last_mut() {
            Some(Part::Text { text: existing }) => existing.push_str(text),
            _ => self.parts.push(Part::Text {
                text: text.to_string(),
            }),
        }
    }

    fn into_message(self) -> Message {
        Message {
            role: Role::Model,
            parts: self.parts,
        }
    }
}

/// Offset of the blank line ending the first frame, plus its length.
fn next_frame(buffer: &str) -> Option<(usize, usize)> {
    let crlf = buffer.find("\r\n\r\n").map(|at| (at, 4));
    let lf = buffer.find("\n\n").map(|at| (at, 2));
    match (crlf, lf) {
        (Some(a), Some(b)) => Some(if a.0 <= b.0 { a } else { b }),
        (found, None) | (None, found) => found,
    }
}

fn sse_payload(frame: &str) -> Option<String> {
    let data: Vec<&str> = frame
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim)
        .collect();
    if data.is_empty() || data == ["[DONE]"] {
        return None;
    }
    Some(data.join(""))
}

fn build_body(request: &ChatRequest) -> Value {
    let mut body = json!({
        "systemInstruction": { "parts": [{ "text": request.system }] },
        "contents": request.messages.iter().map(to_content).collect::<Vec<_>>(),
        "generationConfig": { "temperature": 0.2 },
    });

    if !request.tools.is_empty() {
        let declarations: Vec<Value> = request
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": codesign_core::schema::to_openapi_subset(&tool.parameters),
                })
            })
            .collect();
        body["tools"] = json!([{ "functionDeclarations": declarations }]);
    }

    body
}

fn to_content(message: &Message) -> Value {
    let mut parts: Vec<Value> = Vec::new();

    for part in &message.parts {
        match part {
            Part::Text { text } => parts.push(json!({ "text": text })),
            Part::ToolCall {
                name,
                args,
                signature,
                ..
            } => {
                let mut entry = json!({ "functionCall": { "name": name, "args": args } });
                if let Some(signature) = signature {
                    entry["thoughtSignature"] = json!(signature);
                }
                parts.push(entry);
            }
            Part::ToolResult { name, result, .. } => parts.push(json!({
                "functionResponse": { "name": name, "response": wrap_response(result) }
            })),
        }
    }

    json!({
        "role": match message.role { Role::User => "user", Role::Model => "model" },
        "parts": parts,
    })
}

/// `functionResponse.response` must be an object, whatever the tool returned.
fn wrap_response(result: &Value) -> Value {
    match result {
        Value::Object(_) => result.clone(),
        other => {
            let mut map = Map::new();
            map.insert("result".into(), other.clone());
            Value::Object(map)
        }
    }
}

fn first_line(body: &str) -> String {
    let trimmed = body.trim();
    let cut: String = trimmed.chars().take(400).collect();
    cut.replace('\n', " ")
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

/// Application Default Credentials as written by
/// `gcloud auth application-default login`.
#[derive(Deserialize)]
pub struct AdcCredentials {
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
    #[serde(default)]
    pub quota_project_id: Option<String>,
}

impl AdcCredentials {
    pub fn path() -> Option<std::path::PathBuf> {
        if let Ok(explicit) = std::env::var("GOOGLE_APPLICATION_CREDENTIALS") {
            return Some(std::path::PathBuf::from(explicit));
        }
        #[cfg(target_os = "windows")]
        let config_dir = std::env::var("APPDATA")
            .ok()
            .map(std::path::PathBuf::from)?;
        #[cfg(not(target_os = "windows"))]
        let config_dir = std::env::var("HOME")
            .ok()
            .map(std::path::PathBuf::from)?
            .join(".config");

        Some(
            config_dir
                .join("gcloud")
                .join("application_default_credentials.json"),
        )
    }

    pub fn load() -> Result<Self, String> {
        let path = Self::path().ok_or("could not work out where gcloud keeps its credentials")?;
        let raw = std::fs::read_to_string(&path).map_err(|_| {
            "no Google credentials found — run `gcloud auth application-default login`".to_string()
        })?;
        serde_json::from_str(&raw).map_err(|e| {
            format!(
                "could not read {}: {e}. Only user credentials are supported so far.",
                path.display()
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adc_path_uses_the_platform_gcloud_directory() {
        let path = AdcCredentials::path().expect("finds the gcloud config directory");
        #[cfg(target_os = "windows")]
        assert_eq!(
            path,
            std::path::PathBuf::from(std::env::var("APPDATA").unwrap())
                .join("gcloud")
                .join("application_default_credentials.json")
        );
        #[cfg(not(target_os = "windows"))]
        assert_eq!(
            path,
            std::path::PathBuf::from(std::env::var("HOME").unwrap())
                .join(".config")
                .join("gcloud")
                .join("application_default_credentials.json")
        );
    }

    #[test]
    fn sse_frames_are_unwrapped() {
        assert_eq!(
            sse_payload("data: {\"a\":1}"),
            Some("{\"a\":1}".to_string())
        );
        assert_eq!(sse_payload("event: ping"), None);
        assert_eq!(sse_payload("data: [DONE]"), None);
    }

    /// Vertex separates frames with CRLF; missing this parsed nothing at all.
    #[test]
    fn frames_split_on_either_line_ending() {
        let crlf = "data: {\"a\":1}\r\n\r\ndata: {\"b\":2}\r\n\r\n";
        let (end, skip) = next_frame(crlf).expect("finds a frame");
        assert_eq!(&crlf[..end], "data: {\"a\":1}");
        assert_eq!(skip, 4);

        let lf = "data: {\"a\":1}\n\n";
        let (end, skip) = next_frame(lf).expect("finds a frame");
        assert_eq!(&lf[..end], "data: {\"a\":1}");
        assert_eq!(skip, 2);

        assert!(next_frame("data: {\"partial\"").is_none());
    }

    #[test]
    fn text_deltas_merge_into_one_part() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let mut assembled = Assembled::default();
        for piece in ["Hel", "lo ", "world"] {
            assembled.absorb(
                &json!({ "candidates": [{ "content": { "parts": [{ "text": piece }] } }] }),
                &tx,
            );
        }
        let message = assembled.into_message();
        assert_eq!(message.parts.len(), 1);
        assert!(matches!(&message.parts[0], Part::Text { text } if text == "Hello world"));
    }

    #[test]
    fn function_calls_get_synthetic_ids() {
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let mut assembled = Assembled::default();
        assembled.absorb(
            &json!({ "candidates": [{ "content": { "parts": [
                { "functionCall": { "name": "create_service", "args": { "label": "A" } } },
                { "functionCall": { "name": "connect", "args": {} } }
            ] } }] }),
            &tx,
        );
        let message = assembled.into_message();
        let calls = message.tool_calls();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].0, "call-1");
        assert_eq!(calls[1].0, "call-2");
    }

    #[test]
    fn tool_results_are_sent_back_as_objects() {
        let body = to_content(&Message {
            role: Role::User,
            parts: vec![Part::ToolResult {
                id: "call-1".into(),
                name: "create_service".into(),
                result: json!("added service"),
            }],
        });
        assert_eq!(
            body["parts"][0]["functionResponse"]["response"]["result"],
            "added service"
        );
    }

    #[test]
    fn the_model_list_keeps_only_usable_chat_models() {
        for keep in [
            "gemini-3.7-flash",
            "gemini-3.1-pro-preview",
            "gemini-3-flash-preview",
            "gemini-3.5-flash-lite",
        ] {
            assert!(is_chat_model(keep), "{keep} should be offered");
        }

        for drop in [
            "gemini-2.5-flash-tts",
            "gemini-embedding-2",
            "gemini-3-pro-image",
            "gemini-live-2.5-flash-native-audio",
            "gemini-2.5-pro-exp-03-25",
            // Dated snapshots duplicate the stable alias.
            "gemini-2.0-flash-001",
            "gemini-2.5-flash-preview-04-17",
            "text-bison",
        ] {
            assert!(!is_chat_model(drop), "{drop} should be hidden");
        }
    }

    #[test]
    fn models_sort_newest_first() {
        let mut models = [
            "gemini-2.5-pro".to_string(),
            "gemini-3.7-flash".to_string(),
            "gemini-3-flash-preview".to_string(),
            "gemini-3.1-pro-preview".to_string(),
        ];
        models.sort_by(|a, b| {
            version_of(b)
                .partial_cmp(&version_of(a))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.cmp(b))
        });
        assert_eq!(models[0], "gemini-3.7-flash");
        assert_eq!(models.last().unwrap(), "gemini-2.5-pro");
    }
}
