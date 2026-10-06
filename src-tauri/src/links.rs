//! Rich link previews (Open Graph / Twitter cards / HTML title), with an in-memory cache
//! that the frontend also persists in the `link_cache` collection.

use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkPreview {
    pub url: String,
    pub final_url: String,
    pub title: String,
    pub description: String,
    pub image: Option<String>,
    pub site_name: String,
    pub favicon: Option<String>,
    /// "page" | "image" | "video" | "pdf" | "other"
    pub kind: String,
    pub fetched_at: i64,
    pub error: Option<String>,
}

static CACHE: OnceLock<Mutex<HashMap<String, LinkPreview>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, LinkPreview>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn cached(url: &str) -> Option<LinkPreview> {
    cache().lock().get(url).cloned()
}

pub fn seed(items: Vec<LinkPreview>) {
    let mut c = cache().lock();
    for it in items {
        c.insert(it.url.clone(), it);
    }
}

fn meta(doc: &Html, names: &[&str]) -> Option<String> {
    for n in names {
        let sel = Selector::parse(&format!("meta[property=\"{n}\"], meta[name=\"{n}\"]")).ok()?;
        if let Some(el) = doc.select(&sel).next() {
            if let Some(c) = el.value().attr("content") {
                let c = c.trim();
                if !c.is_empty() {
                    return Some(c.to_string());
                }
            }
        }
    }
    None
}

fn absolutize(base: &Url, v: Option<String>) -> Option<String> {
    let v = v?;
    base.join(v.trim()).ok().map(|u| u.to_string())
}

pub async fn fetch(url: &str) -> LinkPreview {
    if let Some(p) = cached(url) {
        if chrono::Utc::now().timestamp_millis() - p.fetched_at < 7 * 86_400_000 && p.error.is_none() {
            return p;
        }
    }
    let now = chrono::Utc::now().timestamp_millis();
    let result = fetch_inner(url).await;
    let preview = match result {
        Ok(p) => p,
        Err(e) => {
            let host = Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.to_string())).unwrap_or_default();
            LinkPreview {
                url: url.to_string(),
                final_url: url.to_string(),
                title: host.clone(),
                description: String::new(),
                image: None,
                site_name: host,
                favicon: None,
                kind: "other".into(),
                fetched_at: now,
                error: Some(e.to_string()),
            }
        }
    };
    cache().lock().insert(url.to_string(), preview.clone());
    preview
}

async fn fetch_inner(url: &str) -> Result<LinkPreview> {
    let parsed = Url::parse(url)?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(anyhow!("unsupported scheme"));
    }
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Dayflit/1.0 (+link preview)")
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(6))
        .build()?;
    let resp = client.get(parsed.clone()).header("Accept", "text/html,application/xhtml+xml,*/*;q=0.8").send().await?;
    let final_url = resp.url().clone();
    let ct = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_ascii_lowercase();
    let now = chrono::Utc::now().timestamp_millis();
    let host = final_url.host_str().unwrap_or("").to_string();
    let favicon = Some(format!("{}://{}/favicon.ico", final_url.scheme(), host));
    if ct.starts_with("image/") {
        return Ok(LinkPreview {
            url: url.into(),
            final_url: final_url.to_string(),
            title: final_url.path_segments().and_then(|mut s| s.next_back()).unwrap_or("image").to_string(),
            description: String::new(),
            image: Some(final_url.to_string()),
            site_name: host,
            favicon,
            kind: "image".into(),
            fetched_at: now,
            error: None,
        });
    }
    if ct.contains("application/pdf") {
        return Ok(LinkPreview {
            url: url.into(),
            final_url: final_url.to_string(),
            title: final_url.path_segments().and_then(|mut s| s.next_back()).unwrap_or("PDF").to_string(),
            description: "PDF document".into(),
            image: None,
            site_name: host,
            favicon,
            kind: "pdf".into(),
            fetched_at: now,
            error: None,
        });
    }
    if !ct.contains("html") && !ct.is_empty() {
        return Ok(LinkPreview {
            url: url.into(),
            final_url: final_url.to_string(),
            title: host.clone(),
            description: ct,
            image: None,
            site_name: host,
            favicon,
            kind: "other".into(),
            fetched_at: now,
            error: None,
        });
    }
    // Read at most ~600 KB of the body.
    let bytes = resp.bytes().await?;
    let slice = if bytes.len() > 600_000 { &bytes[..600_000] } else { &bytes[..] };
    let html = String::from_utf8_lossy(slice).to_string();
    let doc = Html::parse_document(&html);
    let title_sel = Selector::parse("title").unwrap();
    let title = meta(&doc, &["og:title", "twitter:title"]).or_else(|| doc.select(&title_sel).next().map(|t| t.text().collect::<String>().trim().to_string())).unwrap_or_else(|| host.clone());
    let description = meta(&doc, &["og:description", "twitter:description", "description"]).unwrap_or_default();
    let image = absolutize(&final_url, meta(&doc, &["og:image", "og:image:url", "twitter:image", "twitter:image:src"]));
    let site_name = meta(&doc, &["og:site_name"]).unwrap_or_else(|| host.clone());
    let icon_sel = Selector::parse("link[rel~=\"icon\"], link[rel=\"shortcut icon\"], link[rel=\"apple-touch-icon\"]").unwrap();
    let favicon = doc
        .select(&icon_sel)
        .next()
        .and_then(|l| l.value().attr("href").map(|h| h.to_string()))
        .and_then(|h| final_url.join(&h).ok().map(|u| u.to_string()))
        .or(favicon);
    let og_type = meta(&doc, &["og:type"]).unwrap_or_default();
    let kind = if og_type.starts_with("video") || host.contains("youtube.com") || host.contains("youtu.be") || host.contains("vimeo.com") { "video" } else { "page" };
    Ok(LinkPreview {
        url: url.into(),
        final_url: final_url.to_string(),
        title: title.chars().take(200).collect(),
        description: description.chars().take(400).collect(),
        image,
        site_name,
        favicon,
        kind: kind.into(),
        fetched_at: now,
        error: None,
    })
}
