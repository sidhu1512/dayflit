//! Shared OAuth 2.0 authorization-code + PKCE flow for desktop (loopback redirect),
//! with token persistence in `%APPDATA%\Sid\<provider>.json`.

use anyhow::{anyhow, Result};
use base64::Engine;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Tokens {
    pub client_id: String,
    pub client_secret: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub account: String,
}

pub struct Provider {
    pub name: &'static str,
    pub auth_url: &'static str,
    pub token_url: &'static str,
    pub scopes: &'static str,
    pub port: u16,
    /// extra query params for the authorize request
    pub extra: &'static [(&'static str, &'static str)],
}

static STORE: OnceLock<Mutex<HashMap<String, Tokens>>> = OnceLock::new();
static DIR: OnceLock<PathBuf> = OnceLock::new();

fn store() -> &'static Mutex<HashMap<String, Tokens>> {
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn init(config_dir: PathBuf) {
    let _ = DIR.set(config_dir);
}

fn path(name: &str) -> Option<PathBuf> {
    DIR.get().map(|d| d.join(format!("{name}.json")))
}

pub fn tokens(name: &str) -> Tokens {
    if let Some(t) = store().lock().get(name) {
        return t.clone();
    }
    let t = path(name).and_then(|p| std::fs::read_to_string(p).ok()).and_then(|s| serde_json::from_str::<Tokens>(&s).ok()).unwrap_or_default();
    store().lock().insert(name.into(), t.clone());
    t
}

fn save(name: &str, t: &Tokens) {
    store().lock().insert(name.into(), t.clone());
    if let Some(p) = path(name) {
        if let Ok(json) = serde_json::to_string_pretty(t) {
            let _ = crate::store::atomic_write(&p, json.as_bytes());
        }
    }
}

pub fn disconnect(name: &str) {
    let t = tokens(name);
    save(name, &Tokens { client_id: t.client_id, client_secret: t.client_secret, ..Default::default() });
}

pub fn redirect_uri(p: &Provider) -> String {
    format!("http://127.0.0.1:{}/callback", p.port)
}

fn random_string(n: usize) -> String {
    use rand::Rng;
    const CH: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    (0..n).map(|_| CH[rng.gen_range(0..CH.len())] as char).collect()
}

const PAGE_OK: &str = "<html><body style='font-family:Segoe UI;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh'><div style='text-align:center'><h2>Connected to Dayflit</h2><p>You can close this tab and return to Dayflit.</p></div></body></html>";
const PAGE_CANCEL: &str = "<html><body style='font-family:Segoe UI;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh'><div style='text-align:center'><h2>Connection cancelled</h2><p>You can close this tab.</p></div></body></html>";

/// Run the browser flow and persist tokens. `client_secret` may be empty for public clients.
pub async fn connect(p: &Provider, client_id: String, client_secret: String) -> Result<Tokens> {
    let client_id = client_id.trim().to_string();
    if client_id.len() < 8 {
        return Err(anyhow!("enter the OAuth client ID first"));
    }
    let verifier = random_string(64);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_string(16);
    let listener = TcpListener::bind(("127.0.0.1", p.port)).await.map_err(|e| anyhow!("could not listen on port {}: {e}", p.port))?;
    let redirect = redirect_uri(p);
    let mut params: Vec<(&str, String)> = vec![
        ("client_id", client_id.clone()),
        ("response_type", "code".into()),
        ("redirect_uri", redirect.clone()),
        ("code_challenge_method", "S256".into()),
        ("code_challenge", challenge),
        ("state", state.clone()),
        ("scope", p.scopes.into()),
    ];
    for (k, v) in p.extra {
        params.push((k, (*v).into()));
    }
    let url = url::Url::parse_with_params(p.auth_url, params.iter().map(|(k, v)| (*k, v.as_str())))?;
    tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|e| anyhow!("open browser: {e}"))?;

    let code = tokio::time::timeout(std::time::Duration::from_secs(300), async {
        loop {
            let (mut sock, _) = listener.accept().await?;
            let mut buf = vec![0u8; 8192];
            let n = sock.read(&mut buf).await?;
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let first = req.lines().next().unwrap_or("").to_string();
            let path = first.split_whitespace().nth(1).unwrap_or("/").to_string();
            let full = url::Url::parse(&format!("http://127.0.0.1{path}"))?;
            let q: HashMap<_, _> = full.query_pairs().into_owned().collect();
            let ok = full.path() == "/callback" && q.get("state").map(|s| s == &state).unwrap_or(false) && q.contains_key("code");
            let (status, body) = if ok { ("200 OK", PAGE_OK) } else if q.contains_key("error") { ("200 OK", PAGE_CANCEL) } else { ("404 Not Found", "") };
            let resp = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            let _ = sock.write_all(resp.as_bytes()).await;
            let _ = sock.shutdown().await;
            if ok {
                return Ok::<String, anyhow::Error>(q.get("code").cloned().unwrap_or_default());
            }
            if q.contains_key("error") {
                return Err(anyhow!("authorization cancelled: {}", q.get("error").cloned().unwrap_or_default()));
            }
        }
    })
    .await
    .map_err(|_| anyhow!("timed out waiting for authorization"))??;

    let client = reqwest::Client::new();
    let mut form: Vec<(&str, &str)> = vec![("grant_type", "authorization_code"), ("code", &code), ("redirect_uri", &redirect), ("client_id", &client_id), ("code_verifier", &verifier)];
    if !client_secret.trim().is_empty() {
        form.push(("client_secret", client_secret.trim()));
    }
    let resp: Value = client.post(p.token_url).form(&form).send().await?.json().await?;
    if let Some(err) = resp.get("error") {
        return Err(anyhow!("token exchange failed: {} {}", err, resp.get("error_description").and_then(|v| v.as_str()).unwrap_or("")));
    }
    let t = Tokens {
        client_id,
        client_secret: client_secret.trim().into(),
        access_token: resp["access_token"].as_str().unwrap_or("").into(),
        refresh_token: resp["refresh_token"].as_str().unwrap_or("").into(),
        expires_at: chrono::Utc::now().timestamp() + resp["expires_in"].as_i64().unwrap_or(3600) - 30,
        account: String::new(),
    };
    save(p.name, &t);
    Ok(t)
}

pub fn set_account(name: &str, account: &str) {
    let mut t = tokens(name);
    t.account = account.into();
    save(name, &t);
}

pub async fn access_token(p: &Provider) -> Result<String> {
    let t = tokens(p.name);
    if t.refresh_token.is_empty() {
        return Err(anyhow!("{} is not connected", p.name));
    }
    if !t.access_token.is_empty() && chrono::Utc::now().timestamp() < t.expires_at {
        return Ok(t.access_token);
    }
    let client = reqwest::Client::new();
    let mut form: Vec<(&str, &str)> = vec![("grant_type", "refresh_token"), ("refresh_token", &t.refresh_token), ("client_id", &t.client_id)];
    if !t.client_secret.is_empty() {
        form.push(("client_secret", &t.client_secret));
    }
    if p.name == "outlook" {
        form.push(("scope", p.scopes));
    }
    let resp: Value = client.post(p.token_url).form(&form).send().await?.json().await?;
    if let Some(err) = resp.get("error") {
        if err.as_str() == Some("invalid_grant") {
            disconnect(p.name);
        }
        return Err(anyhow!("refresh failed: {err}"));
    }
    let mut nt = t.clone();
    nt.access_token = resp["access_token"].as_str().unwrap_or("").into();
    if let Some(r) = resp["refresh_token"].as_str() {
        nt.refresh_token = r.into();
    }
    nt.expires_at = chrono::Utc::now().timestamp() + resp["expires_in"].as_i64().unwrap_or(3600) - 30;
    save(p.name, &nt);
    Ok(nt.access_token)
}

/// Authenticated JSON request. Returns Value::Null for empty bodies.
pub async fn api(p: &Provider, method: &str, url: &str, body: Option<Value>, headers: &[(&str, &str)]) -> Result<Value> {
    let token = access_token(p).await?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build()?;
    let mut req = match method {
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "PATCH" => client.patch(url),
        "DELETE" => client.delete(url),
        _ => client.get(url),
    }
    .bearer_auth(token);
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    if let Some(b) = body {
        req = req.json(&b);
    }
    let resp = req.send().await?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let msg = serde_json::from_str::<Value>(&text).ok().and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string())).unwrap_or_else(|| text.chars().take(300).collect());
        return Err(anyhow!("{} {}: {}", p.name, status.as_u16(), msg));
    }
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}
