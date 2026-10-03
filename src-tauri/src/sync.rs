//! Two-way calendar sync with Google Calendar and Microsoft 365 (Outlook) through their REST APIs.
//! Events are read into the shared `CalEvent` shape; moves/resizes/creates/deletes made in Sid are
//! pushed back immediately. Recurrence is expanded server-side (singleEvents / calendarView).

use crate::calendar::{detect_meeting, CalEvent};
use crate::oauth::{self, Provider};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc};
use serde::Serialize;
use serde_json::{json, Value};

pub const GOOGLE: Provider = Provider {
    name: "google",
    auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    scopes: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email",
    port: 8913,
    extra: &[("access_type", "offline"), ("prompt", "consent")],
};

pub const OUTLOOK: Provider = Provider {
    name: "outlook",
    auth_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: "offline_access User.Read Calendars.ReadWrite",
    port: 8914,
    extra: &[("response_mode", "query")],
};

pub fn provider(name: &str) -> Result<&'static Provider> {
    match name {
        "google" => Ok(&GOOGLE),
        "outlook" => Ok(&OUTLOOK),
        _ => Err(anyhow!("unknown provider {name}")),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub provider: String,
    pub connected: bool,
    pub account: String,
    pub client_id: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCalendar {
    pub id: String,
    pub name: String,
    pub color: String,
    pub primary: bool,
    pub can_edit: bool,
}

pub fn status(name: &str) -> Result<SyncStatus> {
    let p = provider(name)?;
    let t = oauth::tokens(name);
    Ok(SyncStatus { provider: name.into(), connected: !t.refresh_token.is_empty(), account: t.account, client_id: t.client_id, redirect_uri: oauth::redirect_uri(p) })
}

pub async fn connect(name: &str, client_id: String, client_secret: String) -> Result<SyncStatus> {
    let p = provider(name)?;
    oauth::connect(p, client_id, client_secret).await?;
    // account label
    let account = match name {
        "google" => oauth::api(p, "GET", "https://www.googleapis.com/oauth2/v2/userinfo", None, &[]).await.ok().and_then(|v| v["email"].as_str().map(|s| s.to_string())),
        _ => oauth::api(p, "GET", "https://graph.microsoft.com/v1.0/me", None, &[]).await.ok().and_then(|v| v["mail"].as_str().or(v["userPrincipalName"].as_str()).map(|s| s.to_string())),
    };
    if let Some(a) = account {
        oauth::set_account(name, &a);
    }
    status(name)
}

pub fn disconnect(name: &str) -> Result<SyncStatus> {
    oauth::disconnect(name);
    status(name)
}

pub async fn calendars(name: &str) -> Result<Vec<RemoteCalendar>> {
    let p = provider(name)?;
    match name {
        "google" => {
            let v = oauth::api(p, "GET", "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100", None, &[]).await?;
            Ok(v["items"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|c| RemoteCalendar {
                            id: c["id"].as_str().unwrap_or("").into(),
                            name: c["summaryOverride"].as_str().or(c["summary"].as_str()).unwrap_or("Calendar").into(),
                            color: c["backgroundColor"].as_str().unwrap_or("#4285f4").into(),
                            primary: c["primary"].as_bool().unwrap_or(false),
                            can_edit: matches!(c["accessRole"].as_str(), Some("owner") | Some("writer")),
                        })
                        .collect()
                })
                .unwrap_or_default())
        }
        _ => {
            let v = oauth::api(p, "GET", "https://graph.microsoft.com/v1.0/me/calendars?$top=100", None, &[]).await?;
            Ok(v["value"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|c| RemoteCalendar {
                            id: c["id"].as_str().unwrap_or("").into(),
                            name: c["name"].as_str().unwrap_or("Calendar").into(),
                            color: c["hexColor"].as_str().filter(|s| !s.is_empty()).unwrap_or("#0078d4").into(),
                            primary: c["isDefaultCalendar"].as_bool().unwrap_or(false),
                            can_edit: c["canEdit"].as_bool().unwrap_or(true),
                        })
                        .collect()
                })
                .unwrap_or_default())
        }
    }
}

fn parse_rfc3339(s: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis()).or_else(|| {
        // Graph returns "2026-10-02T09:00:00.0000000" without offset (in the requested tz = UTC)
        let trimmed = s.trim_end_matches('Z');
        let core = trimmed.split('.').next().unwrap_or(trimmed);
        chrono::NaiveDateTime::parse_from_str(core, "%Y-%m-%dT%H:%M:%S").ok().map(|n| Utc.from_utc_datetime(&n).timestamp_millis())
    })
}

fn parse_date(s: &str) -> Option<i64> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok().and_then(|d| Local.from_local_datetime(&d.and_hms_opt(0, 0, 0)?).single()).map(|d| d.timestamp_millis())
}

fn ms_to_rfc3339(ms: i64) -> String {
    Utc.timestamp_millis_opt(ms).single().map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)).unwrap_or_default()
}

fn google_event(c: &Value, cal_id: &str, color: &str) -> Option<CalEvent> {
    if c["status"].as_str() == Some("cancelled") {
        return None;
    }
    let id = c["id"].as_str()?.to_string();
    let all_day = c["start"]["date"].is_string();
    let start = if all_day { parse_date(c["start"]["date"].as_str()?)? } else { parse_rfc3339(c["start"]["dateTime"].as_str()?)? };
    let end = if all_day { parse_date(c["end"]["date"].as_str()?)? } else { parse_rfc3339(c["end"]["dateTime"].as_str()?)? };
    let description = c["description"].as_str().unwrap_or("").to_string();
    let location = c["location"].as_str().unwrap_or("").to_string();
    let hangout = c["hangoutLink"].as_str().unwrap_or("").to_string();
    let conf = c["conferenceData"]["entryPoints"].as_array().and_then(|a| a.iter().find(|e| e["entryPointType"].as_str() == Some("video")).and_then(|e| e["uri"].as_str())).unwrap_or("").to_string();
    let meeting = detect_meeting(&[&hangout, &conf, &location, &description]);
    let attendees = c["attendees"].as_array().map(|a| a.iter().filter_map(|x| x["displayName"].as_str().or(x["email"].as_str()).map(|s| s.to_string())).collect()).unwrap_or_default();
    Some(CalEvent {
        id: format!("g:{cal_id}:{id}"),
        source_id: String::new(),
        uid: id,
        title: c["summary"].as_str().unwrap_or("(untitled)").into(),
        description,
        location,
        start,
        end,
        all_day,
        recurring: c["recurringEventId"].is_string(),
        status: c["status"].as_str().unwrap_or("").into(),
        organizer: c["organizer"]["displayName"].as_str().or(c["organizer"]["email"].as_str()).unwrap_or("").into(),
        attendees,
        url: c["htmlLink"].as_str().unwrap_or("").into(),
        meeting,
        color: color.into(),
    })
}

fn graph_event(c: &Value, cal_id: &str, color: &str) -> Option<CalEvent> {
    if c["isCancelled"].as_bool().unwrap_or(false) {
        return None;
    }
    let id = c["id"].as_str()?.to_string();
    let all_day = c["isAllDay"].as_bool().unwrap_or(false);
    let start = parse_rfc3339(c["start"]["dateTime"].as_str()?)?;
    let end = parse_rfc3339(c["end"]["dateTime"].as_str()?)?;
    // all-day events come back as UTC midnight; show them on the local date
    let (start, end) = if all_day {
        let s = Utc.timestamp_millis_opt(start).single()?.date_naive();
        let e = Utc.timestamp_millis_opt(end).single()?.date_naive();
        (parse_date(&s.to_string())?, parse_date(&e.to_string())?)
    } else {
        (start, end)
    };
    let description = c["bodyPreview"].as_str().unwrap_or("").to_string();
    let location = c["location"]["displayName"].as_str().unwrap_or("").to_string();
    let join = c["onlineMeeting"]["joinUrl"].as_str().or(c["onlineMeetingUrl"].as_str()).unwrap_or("").to_string();
    let meeting = detect_meeting(&[&join, &location, &description]);
    let attendees = c["attendees"].as_array().map(|a| a.iter().filter_map(|x| x["emailAddress"]["name"].as_str().or(x["emailAddress"]["address"].as_str()).map(|s| s.to_string())).collect()).unwrap_or_default();
    Some(CalEvent {
        id: format!("o:{cal_id}:{id}"),
        source_id: String::new(),
        uid: id,
        title: c["subject"].as_str().unwrap_or("(untitled)").into(),
        description,
        location,
        start,
        end,
        all_day,
        recurring: c["seriesMasterId"].is_string(),
        status: if c["showAs"].as_str() == Some("tentative") { "TENTATIVE".into() } else { "CONFIRMED".into() },
        organizer: c["organizer"]["emailAddress"]["name"].as_str().unwrap_or("").into(),
        attendees,
        url: c["webLink"].as_str().unwrap_or("").into(),
        meeting,
        color: color.into(),
    })
}

/// Fetch events of one remote calendar in [from, to] (epoch ms).
pub async fn fetch(name: &str, cal_id: &str, color: &str, from: i64, to: i64) -> Result<Vec<CalEvent>> {
    let p = provider(name)?;
    let mut out = vec![];
    match name {
        "google" => {
            let mut page: Option<String> = None;
            loop {
                let mut url = format!(
                    "https://www.googleapis.com/calendar/v3/calendars/{}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin={}&timeMax={}",
                    urlencoding(cal_id),
                    ms_to_rfc3339(from),
                    ms_to_rfc3339(to)
                );
                if let Some(t) = &page {
                    url.push_str(&format!("&pageToken={t}"));
                }
                let v = oauth::api(p, "GET", &url, None, &[]).await?;
                if let Some(items) = v["items"].as_array() {
                    out.extend(items.iter().filter_map(|c| google_event(c, cal_id, color)));
                }
                match v["nextPageToken"].as_str() {
                    Some(t) if out.len() < 2000 => page = Some(t.to_string()),
                    _ => break,
                }
            }
        }
        _ => {
            let mut url = format!(
                "https://graph.microsoft.com/v1.0/me/calendars/{}/calendarView?startDateTime={}&endDateTime={}&$top=250&$orderby=start/dateTime",
                cal_id,
                ms_to_rfc3339(from),
                ms_to_rfc3339(to)
            );
            loop {
                let v = oauth::api(p, "GET", &url, None, &[("Prefer", "outlook.timezone=\"UTC\"")]).await?;
                if let Some(items) = v["value"].as_array() {
                    out.extend(items.iter().filter_map(|c| graph_event(c, cal_id, color)));
                }
                match v["@odata.nextLink"].as_str() {
                    Some(next) if out.len() < 2000 => url = next.to_string(),
                    _ => break,
                }
            }
        }
    }
    out.sort_by_key(|e| e.start);
    Ok(out)
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

/// Split "g:<cal>:<event>" / "o:<cal>:<event>".
fn split_id(id: &str) -> Result<(&str, String, String)> {
    let mut parts = id.splitn(3, ':');
    let prov = match parts.next() {
        Some("g") => "google",
        Some("o") => "outlook",
        _ => return Err(anyhow!("not a synced event")),
    };
    let cal = parts.next().ok_or_else(|| anyhow!("bad id"))?.to_string();
    let ev = parts.next().ok_or_else(|| anyhow!("bad id"))?.to_string();
    Ok((prov, cal, ev))
}

pub async fn create(name: &str, cal_id: &str, color: &str, title: &str, start: i64, end: i64, description: &str) -> Result<CalEvent> {
    let p = provider(name)?;
    match name {
        "google" => {
            let body = json!({ "summary": title, "description": description, "start": { "dateTime": ms_to_rfc3339(start) }, "end": { "dateTime": ms_to_rfc3339(end) } });
            let v = oauth::api(p, "POST", &format!("https://www.googleapis.com/calendar/v3/calendars/{}/events", urlencoding(cal_id)), Some(body), &[]).await?;
            google_event(&v, cal_id, color).ok_or_else(|| anyhow!("unexpected response"))
        }
        _ => {
            let body = json!({ "subject": title, "body": { "contentType": "text", "content": description }, "start": { "dateTime": ms_to_rfc3339(start), "timeZone": "UTC" }, "end": { "dateTime": ms_to_rfc3339(end), "timeZone": "UTC" } });
            let v = oauth::api(p, "POST", &format!("https://graph.microsoft.com/v1.0/me/calendars/{cal_id}/events"), Some(body), &[("Prefer", "outlook.timezone=\"UTC\"")]).await?;
            graph_event(&v, cal_id, color).ok_or_else(|| anyhow!("unexpected response"))
        }
    }
}

pub async fn update(id: &str, color: &str, title: Option<String>, start: Option<i64>, end: Option<i64>) -> Result<CalEvent> {
    let (name, cal, ev) = split_id(id)?;
    let p = provider(name)?;
    match name {
        "google" => {
            let mut body = json!({});
            if let Some(t) = title {
                body["summary"] = json!(t);
            }
            if let Some(s) = start {
                body["start"] = json!({ "dateTime": ms_to_rfc3339(s) });
            }
            if let Some(e) = end {
                body["end"] = json!({ "dateTime": ms_to_rfc3339(e) });
            }
            let v = oauth::api(p, "PATCH", &format!("https://www.googleapis.com/calendar/v3/calendars/{}/events/{}", urlencoding(&cal), ev), Some(body), &[]).await?;
            google_event(&v, &cal, color).ok_or_else(|| anyhow!("unexpected response"))
        }
        _ => {
            let mut body = json!({});
            if let Some(t) = title {
                body["subject"] = json!(t);
            }
            if let Some(s) = start {
                body["start"] = json!({ "dateTime": ms_to_rfc3339(s), "timeZone": "UTC" });
            }
            if let Some(e) = end {
                body["end"] = json!({ "dateTime": ms_to_rfc3339(e), "timeZone": "UTC" });
            }
            let v = oauth::api(p, "PATCH", &format!("https://graph.microsoft.com/v1.0/me/events/{ev}"), Some(body), &[("Prefer", "outlook.timezone=\"UTC\"")]).await?;
            graph_event(&v, &cal, color).ok_or_else(|| anyhow!("unexpected response"))
        }
    }
}

pub async fn delete(id: &str) -> Result<()> {
    let (name, cal, ev) = split_id(id)?;
    let p = provider(name)?;
    match name {
        "google" => {
            oauth::api(p, "DELETE", &format!("https://www.googleapis.com/calendar/v3/calendars/{}/events/{}", urlencoding(&cal), ev), None, &[]).await?;
        }
        _ => {
            oauth::api(p, "DELETE", &format!("https://graph.microsoft.com/v1.0/me/events/{ev}"), None, &[]).await?;
        }
    }
    Ok(())
}
