//! Spotify Web API integration using Authorization Code with PKCE (no client secret).
//! Tokens are stored in `%APPDATA%\Sid\spotify.json`, outside the user's data folder.

use anyhow::{anyhow, Result};
use base64::Engine;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const REDIRECT_PORT: u16 = 8912;
const SCOPES: &str = "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-read-private";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SpotifyAuth {
    pub client_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub display_name: String,
    pub product: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyStatus {
    pub connected: bool,
    pub client_id: String,
    pub display_name: String,
    pub premium: bool,
    pub redirect_uri: String,
}

static AUTH: OnceLock<Mutex<SpotifyAuth>> = OnceLock::new();
static PATH: OnceLock<PathBuf> = OnceLock::new();
static PENDING: OnceLock<Mutex<Option<(String, String)>>> = OnceLock::new(); // (verifier, state)

fn auth() -> &'static Mutex<SpotifyAuth> {
    AUTH.get_or_init(|| Mutex::new(SpotifyAuth::default()))
}

pub fn redirect_uri() -> String {
    format!("http://127.0.0.1:{REDIRECT_PORT}/callback")
}

pub fn init(config_dir: PathBuf) {
    let p = config_dir.join("spotify.json");
    if let Ok(s) = std::fs::read_to_string(&p) {
        if let Ok(a) = serde_json::from_str::<SpotifyAuth>(&s) {
            *auth().lock() = a;
        }
    }
    let _ = PATH.set(p);
}

fn persist() {
    if let Some(p) = PATH.get() {
        if let Ok(json) = serde_json::to_string_pretty(&*auth().lock()) {
            let _ = crate::store::atomic_write(p, json.as_bytes());
        }
    }
}

pub fn status() -> SpotifyStatus {
    let a = auth().lock();
    SpotifyStatus {
        connected: !a.refresh_token.is_empty(),
        client_id: a.client_id.clone(),
        display_name: a.display_name.clone(),
        premium: a.product == "premium",
        redirect_uri: redirect_uri(),
    }
}

pub fn disconnect() {
    let cid = auth().lock().client_id.clone();
    *auth().lock() = SpotifyAuth { client_id: cid, ..Default::default() };
    persist();
}

fn random_string(n: usize) -> String {
    use rand::Rng;
    const CH: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    (0..n).map(|_| CH[rng.gen_range(0..CH.len())] as char).collect()
}

/// Begin the PKCE flow: opens the browser and waits for the loopback callback.
pub async fn connect(app: AppHandle, client_id: String) -> Result<SpotifyStatus> {
    let client_id = client_id.trim().to_string();
    if client_id.len() < 10 {
        return Err(anyhow!("enter your Spotify app Client ID first"));
    }
    let verifier = random_string(64);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_string(16);
    *PENDING.get_or_init(|| Mutex::new(None)).lock() = Some((verifier.clone(), state.clone()));
    {
        let mut a = auth().lock();
        a.client_id = client_id.clone();
    }
    persist();

    // Bind before opening the browser so the callback can't race us.
    let listener = TcpListener::bind(("127.0.0.1", REDIRECT_PORT)).await.map_err(|e| anyhow!("could not listen on port {REDIRECT_PORT}: {e}"))?;

    let url = url::Url::parse_with_params(
        "https://accounts.spotify.com/authorize",
        &[
            ("client_id", client_id.as_str()),
            ("response_type", "code"),
            ("redirect_uri", redirect_uri().as_str()),
            ("code_challenge_method", "S256"),
            ("code_challenge", challenge.as_str()),
            ("state", state.as_str()),
            ("scope", SCOPES),
        ],
    )?;
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
            let q: std::collections::HashMap<_, _> = full.query_pairs().into_owned().collect();
            let ok = full.path() == "/callback" && q.get("state").map(|s| s == &state).unwrap_or(false) && q.contains_key("code");
            let (status_line, body) = if ok {
                ("200 OK", "<html><body style='font-family:Segoe UI;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh'><div style='text-align:center'><h2>Sid is connected to Spotify</h2><p>You can close this tab and return to Sid.</p></div></body></html>")
            } else if q.contains_key("error") {
                ("200 OK", "<html><body style='font-family:Segoe UI;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh'><div style='text-align:center'><h2>Spotify connection cancelled</h2><p>You can close this tab.</p></div></body></html>")
            } else {
                ("404 Not Found", "")
            };
            let resp = format!("HTTP/1.1 {status_line}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            let _ = sock.write_all(resp.as_bytes()).await;
            let _ = sock.shutdown().await;
            if ok {
                return Ok::<String, anyhow::Error>(q.get("code").cloned().unwrap_or_default());
            }
            if q.contains_key("error") {
                return Err(anyhow!("authorization cancelled"));
            }
        }
    })
    .await
    .map_err(|_| anyhow!("timed out waiting for Spotify authorization"))??;

    let client = reqwest::Client::new();
    let resp: Value = client
        .post("https://accounts.spotify.com/api/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri().as_str()),
            ("client_id", client_id.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await?
        .json()
        .await?;
    if let Some(err) = resp.get("error") {
        return Err(anyhow!("token exchange failed: {} {}", err, resp.get("error_description").and_then(|v| v.as_str()).unwrap_or("")));
    }
    {
        let mut a = auth().lock();
        a.access_token = resp["access_token"].as_str().unwrap_or("").to_string();
        a.refresh_token = resp["refresh_token"].as_str().unwrap_or("").to_string();
        a.expires_at = chrono::Utc::now().timestamp() + resp["expires_in"].as_i64().unwrap_or(3600) - 30;
    }
    persist();
    if let Ok(me) = api("GET", "/me", None).await {
        let mut a = auth().lock();
        a.display_name = me["display_name"].as_str().unwrap_or("").to_string();
        a.product = me["product"].as_str().unwrap_or("").to_string();
    }
    persist();
    let st = status();
    let _ = app.emit("sid://spotify/status", &st);
    Ok(st)
}

async fn ensure_token() -> Result<String> {
    let (token, refresh, client_id, expires_at) = {
        let a = auth().lock();
        (a.access_token.clone(), a.refresh_token.clone(), a.client_id.clone(), a.expires_at)
    };
    if refresh.is_empty() {
        return Err(anyhow!("Spotify not connected"));
    }
    if !token.is_empty() && chrono::Utc::now().timestamp() < expires_at {
        return Ok(token);
    }
    let client = reqwest::Client::new();
    let resp: Value = client
        .post("https://accounts.spotify.com/api/token")
        .form(&[("grant_type", "refresh_token"), ("refresh_token", refresh.as_str()), ("client_id", client_id.as_str())])
        .send()
        .await?
        .json()
        .await?;
    if let Some(err) = resp.get("error") {
        if err.as_str() == Some("invalid_grant") {
            disconnect();
        }
        return Err(anyhow!("refresh failed: {err}"));
    }
    let new_token = resp["access_token"].as_str().unwrap_or("").to_string();
    {
        let mut a = auth().lock();
        a.access_token = new_token.clone();
        if let Some(r) = resp["refresh_token"].as_str() {
            a.refresh_token = r.to_string();
        }
        a.expires_at = chrono::Utc::now().timestamp() + resp["expires_in"].as_i64().unwrap_or(3600) - 30;
    }
    persist();
    Ok(new_token)
}

/// Call the Spotify Web API. Returns `Value::Null` for 204 responses.
pub async fn api(method: &str, path: &str, body: Option<Value>) -> Result<Value> {
    let token = ensure_token().await?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(12)).build()?;
    let url = if path.starts_with("http") { path.to_string() } else { format!("https://api.spotify.com/v1{path}") };
    let mut req = match method {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    }
    .bearer_auth(token);
    if let Some(b) = body {
        req = req.json(&b);
    } else if method == "PUT" || method == "POST" {
        req = req.header("Content-Length", "0");
    }
    let resp = req.send().await?;
    let status = resp.status();
    if status.as_u16() == 204 {
        return Ok(Value::Null);
    }
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let msg = serde_json::from_str::<Value>(&text).ok().and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string())).unwrap_or(text.clone());
        return Err(anyhow!("Spotify {}: {}", status.as_u16(), msg));
    }
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}

/// High-level control. action: play|pause|next|previous|toggle|shuffle:on|repeat:track|volume:50|seek:ms
pub async fn control(action: &str, context_uri: Option<String>, device_id: Option<String>) -> Result<Value> {
    let dev = device_id.map(|d| format!("?device_id={d}")).unwrap_or_default();
    match action {
        "play" => {
            let body = context_uri.map(|u| if u.contains(":track:") { serde_json::json!({ "uris": [u] }) } else { serde_json::json!({ "context_uri": u }) });
            api("PUT", &format!("/me/player/play{dev}"), body).await
        }
        "pause" => api("PUT", &format!("/me/player/pause{dev}"), None).await,
        "next" => api("POST", &format!("/me/player/next{dev}"), None).await,
        "previous" => api("POST", &format!("/me/player/previous{dev}"), None).await,
        "toggle" => {
            let st = api("GET", "/me/player", None).await?;
            if st["is_playing"].as_bool().unwrap_or(false) {
                api("PUT", "/me/player/pause", None).await
            } else {
                api("PUT", "/me/player/play", None).await
            }
        }
        a if a.starts_with("volume:") => {
            let v: u8 = a[7..].parse().unwrap_or(50);
            api("PUT", &format!("/me/player/volume?volume_percent={}", v.min(100)), None).await
        }
        a if a.starts_with("shuffle:") => api("PUT", &format!("/me/player/shuffle?state={}", &a[8..] == "on"), None).await,
        a if a.starts_with("repeat:") => api("PUT", &format!("/me/player/repeat?state={}", &a[7..]), None).await,
        a if a.starts_with("seek:") => api("PUT", &format!("/me/player/seek?position_ms={}", &a[5..]), None).await,
        a if a.starts_with("transfer:") => api("PUT", "/me/player", Some(serde_json::json!({ "device_ids": [&a[9..]], "play": true }))).await,
        _ => Err(anyhow!("unknown action {action}")),
    }
}
