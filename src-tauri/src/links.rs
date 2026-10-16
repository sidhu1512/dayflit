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

pub fn is_private_or_loopback_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ipv4) => {
            let octets = ipv4.octets();
            // 0.0.0.0/8 (Current network / unspecified)
            if octets[0] == 0 {
                return true;
            }
            // 10.0.0.0/8 (RFC 1918 Private)
            if octets[0] == 10 {
                return true;
            }
            // 100.64.0.0/10 (Shared Address Space / CGNAT RFC 6598)
            if octets[0] == 100 && (octets[1] >= 64 && octets[1] <= 127) {
                return true;
            }
            // 127.0.0.0/8 (Loopback)
            if octets[0] == 127 {
                return true;
            }
            // 169.254.0.0/16 (Link-local / APIPA / Cloud instance metadata 169.254.169.254)
            if octets[0] == 169 && octets[1] == 254 {
                return true;
            }
            // 172.16.0.0/12 (RFC 1918 Private)
            if octets[0] == 172 && (octets[1] >= 16 && octets[1] <= 31) {
                return true;
            }
            // 192.0.0.0/24 (IETF Protocol Assignments RFC 6890)
            if octets[0] == 192 && octets[1] == 0 && octets[2] == 0 {
                return true;
            }
            // 192.0.2.0/24 (TEST-NET-1 Documentation RFC 5737)
            if octets[0] == 192 && octets[1] == 0 && octets[2] == 2 {
                return true;
            }
            // 192.168.0.0/16 (RFC 1918 Private)
            if octets[0] == 192 && octets[1] == 168 {
                return true;
            }
            // 198.18.0.0/15 (Benchmarking RFC 2544)
            if octets[0] == 198 && (octets[1] == 18 || octets[1] == 19) {
                return true;
            }
            // 198.51.100.0/24 (TEST-NET-2 Documentation RFC 5737)
            if octets[0] == 198 && octets[1] == 51 && octets[2] == 100 {
                return true;
            }
            // 203.0.113.0/24 (TEST-NET-3 Documentation RFC 5737)
            if octets[0] == 203 && octets[1] == 0 && octets[2] == 113 {
                return true;
            }
            // 224.0.0.0/4 (Multicast)
            if octets[0] >= 224 && octets[0] <= 239 {
                return true;
            }
            // 240.0.0.0/4 (Reserved for future use)
            if octets[0] >= 240 {
                return true;
            }
            // 255.255.255.255 (Broadcast)
            if ipv4.is_broadcast() {
                return true;
            }
            false
        }
        std::net::IpAddr::V6(ipv6) => {
            if ipv6.is_loopback() || ipv6.is_unspecified() {
                return true;
            }
            // IPv4-mapped IPv6 address (::ffff:x.x.x.x)
            let segments = ipv6.segments();
            if segments[0] == 0 && segments[1] == 0 && segments[2] == 0 && segments[3] == 0 && segments[4] == 0 && segments[5] == 0xffff {
                let octet1 = (segments[6] >> 8) as u8;
                let octet2 = (segments[6] & 0xff) as u8;
                let octet3 = (segments[7] >> 8) as u8;
                let octet4 = (segments[7] & 0xff) as u8;
                let mapped_v4 = std::net::Ipv4Addr::new(octet1, octet2, octet3, octet4);
                return is_private_or_loopback_ip(std::net::IpAddr::V4(mapped_v4));
            }
            // Unique local unicast (fc00::/7)
            if (segments[0] & 0xfe00) == 0xfc00 {
                return true;
            }
            // Link-local unicast (fe80::/10)
            if (segments[0] & 0xffc0) == 0xfe80 {
                return true;
            }
            // Documentation (2001:db8::/32)
            if segments[0] == 0x2001 && segments[1] == 0x0db8 {
                return true;
            }
            // Multicast (ff00::/8)
            if (segments[0] & 0xff00) == 0xff00 {
                return true;
            }
            false
        }
    }
}

pub fn is_disallowed_hostname(host: &str) -> bool {
    let h = host.trim().to_ascii_lowercase();
    h.is_empty()
        || h == "localhost"
        || h.ends_with(".localhost")
        || h.ends_with(".local")
        || h.ends_with(".internal")
        || h.ends_with(".lan")
        || h.ends_with(".home.arpa")
        || h.ends_with(".onion")
}

pub fn is_private_or_loopback_host_sync(host: &str, port: u16) -> bool {
    let host_clean = host.trim().to_ascii_lowercase();
    if is_disallowed_hostname(&host_clean) {
        return true;
    }
    if let Ok(ip) = host_clean.parse::<std::net::IpAddr>() {
        return is_private_or_loopback_ip(ip);
    }
    use std::net::ToSocketAddrs;
    if let Ok(iter) = (host_clean.as_str(), port).to_socket_addrs() {
        let mut resolved = false;
        for addr in iter {
            resolved = true;
            if is_private_or_loopback_ip(addr.ip()) {
                return true;
            }
        }
        if !resolved {
            return true;
        }
    }
    false
}

#[allow(dead_code)]
pub fn is_private_or_loopback_host(host: &str) -> bool {
    is_private_or_loopback_host_sync(host, 80)
}

pub async fn validate_url_for_ssrf(url: &Url) -> Result<()> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(anyhow!("unsupported scheme: only http and https are permitted"));
    }
    let host = url.host_str().ok_or_else(|| anyhow!("missing host in URL"))?;
    let host_clean = host.trim().to_ascii_lowercase();
    if is_disallowed_hostname(&host_clean) {
        return Err(anyhow!("requests to private or local network hosts are blocked"));
    }
    if let Ok(ip) = host_clean.parse::<std::net::IpAddr>() {
        if is_private_or_loopback_ip(ip) {
            return Err(anyhow!("requests to private, loopback, or metadata IP addresses are blocked"));
        }
        return Ok(());
    }
    let port = url.port_or_known_default().unwrap_or(80);
    match tokio::net::lookup_host((host_clean.as_str(), port)).await {
        Ok(addrs) => {
            let mut resolved = false;
            for addr in addrs {
                resolved = true;
                if is_private_or_loopback_ip(addr.ip()) {
                    return Err(anyhow!("host resolves to blocked private, loopback, or metadata IP: {}", addr.ip()));
                }
            }
            if !resolved {
                return Err(anyhow!("DNS resolution failed for host"));
            }
        }
        Err(e) => {
            return Err(anyhow!("DNS lookup failed for host: {e}"));
        }
    }
    Ok(())
}

async fn fetch_inner(url: &str) -> Result<LinkPreview> {
    let parsed = Url::parse(url)?;
    validate_url_for_ssrf(&parsed).await?;
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Dayflit/1.0 (+link preview)")
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 6 {
                attempt.error("too many redirects")
            } else {
                let u = attempt.url();
                let port = u.port_or_known_default().unwrap_or(80);
                let host = u.host_str().unwrap_or("");
                if is_private_or_loopback_host_sync(host, port) {
                    attempt.error("redirect to private or local network host blocked")
                } else {
                    attempt.follow()
                }
            }
        }))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_private_or_loopback_ip_v4() {
        let blocked = [
            "127.0.0.1",
            "127.1.2.3",
            "10.0.0.1",
            "10.255.255.254",
            "172.16.0.1",
            "172.31.255.254",
            "192.168.0.1",
            "192.168.1.1",
            "169.254.169.254", // AWS/GCP metadata
            "169.254.1.1",
            "100.64.0.1", // CGNAT
            "100.127.255.254",
            "198.18.0.1", // Benchmark
            "198.19.255.254",
            "192.0.2.1", // TEST-NET-1
            "198.51.100.1", // TEST-NET-2
            "203.0.113.1", // TEST-NET-3
            "0.0.0.0",
            "255.255.255.255",
        ];
        for ip_str in blocked {
            let ip: std::net::IpAddr = ip_str.parse().unwrap();
            assert!(is_private_or_loopback_ip(ip), "IP {ip_str} should be flagged as private/loopback/metadata");
        }

        let public = ["8.8.8.8", "1.1.1.1", "142.250.190.46", "93.184.216.34"];
        for ip_str in public {
            let ip: std::net::IpAddr = ip_str.parse().unwrap();
            assert!(!is_private_or_loopback_ip(ip), "Public IP {ip_str} should NOT be flagged");
        }
    }

    #[test]
    fn test_is_private_or_loopback_ip_v6() {
        let blocked = [
            "::1",
            "::",
            "fc00::1",
            "fd00::1234",
            "fe80::1",
            "::ffff:127.0.0.1", // IPv4-mapped loopback
            "::ffff:169.254.169.254", // IPv4-mapped cloud metadata
            "::ffff:192.168.1.1", // IPv4-mapped private
            "::ffff:10.0.0.1",
        ];
        for ip_str in blocked {
            let ip: std::net::IpAddr = ip_str.parse().unwrap();
            assert!(is_private_or_loopback_ip(ip), "IPv6 {ip_str} should be flagged as private/loopback/metadata");
        }

        let public = [
            "2606:4700:4700::1111", // Cloudflare
            "2001:4860:4860::8888", // Google
            "::ffff:8.8.8.8", // IPv4-mapped public IP
        ];
        for ip_str in public {
            let ip: std::net::IpAddr = ip_str.parse().unwrap();
            assert!(!is_private_or_loopback_ip(ip), "Public IPv6 {ip_str} should NOT be flagged");
        }
    }

    #[test]
    fn test_is_disallowed_hostname() {
        let blocked = [
            "localhost",
            "foo.localhost",
            "printer.local",
            "database.internal",
            "router.lan",
            "nas.home.arpa",
            "darknet.onion",
        ];
        for h in blocked {
            assert!(is_disallowed_hostname(h), "Host {h} should be disallowed");
        }

        let allowed = ["dayflit.com", "github.com", "spotify.com", "google.com"];
        for h in allowed {
            assert!(!is_disallowed_hostname(h), "Legitimate domain {h} should be allowed");
        }
    }

    #[tokio::test]
    async fn test_validate_url_for_ssrf() {
        let bad_urls = [
            "http://127.0.0.1/admin",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/status",
            "http://[::ffff:127.0.0.1]/secret",
            "http://localhost:8080/data",
            "http://router.local/",
            "ftp://dayflit.com/file", // invalid scheme
            "file:///etc/passwd",
        ];
        for u_str in bad_urls {
            let u = Url::parse(u_str);
            if let Ok(url) = u {
                assert!(validate_url_for_ssrf(&url).await.is_err(), "URL {u_str} must fail SSRF validation");
            }
        }
    }
}

