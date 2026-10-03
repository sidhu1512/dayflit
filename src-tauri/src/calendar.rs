//! ICS calendar support: fetch (http/https/webcal/file), parse VEVENTs, expand recurrences,
//! apply overrides (RECURRENCE-ID) and detect meeting links.

use anyhow::{anyhow, Context, Result};
use chrono::{Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use ical::parser::ical::component::IcalEvent;
use ical::property::Property;
use regex::Regex;
use rrule::{RRuleSet, Tz};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufReader;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSource {
    pub id: String,
    pub name: String,
    /// http(s)://, webcal:// or a local file path
    pub url: String,
    pub color: String,
    pub enabled: bool,
    #[serde(default)]
    pub refresh_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingLink {
    pub provider: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    pub id: String,
    pub source_id: String,
    pub uid: String,
    pub title: String,
    pub description: String,
    pub location: String,
    /// epoch millis
    pub start: i64,
    pub end: i64,
    pub all_day: bool,
    pub recurring: bool,
    pub status: String,
    pub organizer: String,
    pub attendees: Vec<String>,
    pub url: String,
    pub meeting: Option<MeetingLink>,
    pub color: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub source_id: String,
    pub events: Vec<CalEvent>,
    pub fetched_at: i64,
    pub calendar_name: Option<String>,
    pub error: Option<String>,
}

fn prop<'a>(e: &'a IcalEvent, name: &str) -> Option<&'a Property> {
    e.properties.iter().find(|p| p.name.eq_ignore_ascii_case(name))
}

fn prop_val(e: &IcalEvent, name: &str) -> String {
    prop(e, name).and_then(|p| p.value.clone()).unwrap_or_default()
}

fn param<'a>(p: &'a Property, name: &str) -> Option<&'a str> {
    p.params.as_ref()?.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).and_then(|(_, v)| v.first().map(|s| s.as_str()))
}

/// Windows time zone names (Outlook exports) to IANA.
fn windows_tz_to_iana(name: &str) -> Option<&'static str> {
    Some(match name {
        "Eastern Standard Time" => "America/New_York",
        "Central Standard Time" => "America/Chicago",
        "Mountain Standard Time" => "America/Denver",
        "Pacific Standard Time" => "America/Los_Angeles",
        "Alaskan Standard Time" => "America/Anchorage",
        "Hawaiian Standard Time" => "Pacific/Honolulu",
        "GMT Standard Time" => "Europe/London",
        "W. Europe Standard Time" | "Romance Standard Time" | "Central Europe Standard Time" | "Central European Standard Time" => "Europe/Berlin",
        "E. Europe Standard Time" | "FLE Standard Time" | "GTB Standard Time" => "Europe/Athens",
        "Russian Standard Time" => "Europe/Moscow",
        "India Standard Time" => "Asia/Kolkata",
        "Pakistan Standard Time" => "Asia/Karachi",
        "Bangladesh Standard Time" => "Asia/Dhaka",
        "SE Asia Standard Time" => "Asia/Bangkok",
        "Singapore Standard Time" | "Malay Peninsula Standard Time" => "Asia/Singapore",
        "China Standard Time" => "Asia/Shanghai",
        "Tokyo Standard Time" => "Asia/Tokyo",
        "Korea Standard Time" => "Asia/Seoul",
        "AUS Eastern Standard Time" => "Australia/Sydney",
        "AUS Central Standard Time" => "Australia/Adelaide",
        "W. Australia Standard Time" => "Australia/Perth",
        "New Zealand Standard Time" => "Pacific/Auckland",
        "Arabian Standard Time" => "Asia/Dubai",
        "Israel Standard Time" => "Asia/Jerusalem",
        "South Africa Standard Time" => "Africa/Johannesburg",
        "E. South America Standard Time" => "America/Sao_Paulo",
        "Argentina Standard Time" => "America/Argentina/Buenos_Aires",
        "Atlantic Standard Time" => "America/Halifax",
        "Newfoundland Standard Time" => "America/St_Johns",
        "UTC" | "Coordinated Universal Time" => "UTC",
        _ => return None,
    })
}

fn resolve_tz(tzid: &str) -> Option<chrono_tz::Tz> {
    let t = tzid.trim_matches('"');
    t.parse::<chrono_tz::Tz>().ok().or_else(|| windows_tz_to_iana(t).and_then(|n| n.parse().ok())).or_else(|| {
        // Some feeds prefix e.g. "/mozilla.org/20050126_1/Europe/Berlin"
        t.rsplit('/').take(2).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("/").parse().ok()
    })
}

/// Parse an iCalendar date/date-time property into (epoch ms, all_day).
fn parse_dt(p: &Property) -> Option<(i64, bool)> {
    let v = p.value.as_ref()?.trim();
    let tzid = param(p, "TZID");
    let is_date = param(p, "VALUE").map(|x| x.eq_ignore_ascii_case("DATE")).unwrap_or(false) || v.len() == 8;
    if is_date {
        let d = NaiveDate::parse_from_str(&v[..8], "%Y%m%d").ok()?;
        let local = Local.from_local_datetime(&d.and_hms_opt(0, 0, 0)?).single()?;
        return Some((local.timestamp_millis(), true));
    }
    let core = v.trim_end_matches('Z');
    let ndt = NaiveDateTime::parse_from_str(core, "%Y%m%dT%H%M%S").ok()?;
    let ms = if v.ends_with('Z') {
        Utc.from_utc_datetime(&ndt).timestamp_millis()
    } else if let Some(tz) = tzid.and_then(resolve_tz) {
        tz.from_local_datetime(&ndt).single().or_else(|| tz.from_local_datetime(&ndt).earliest())?.timestamp_millis()
    } else {
        Local.from_local_datetime(&ndt).single().or_else(|| Local.from_local_datetime(&ndt).earliest())?.timestamp_millis()
    };
    Some((ms, false))
}

fn parse_duration(s: &str) -> Option<Duration> {
    // P[n]W / P[n]DT[n]H[n]M[n]S
    let re = Regex::new(r"^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$").ok()?;
    let c = re.captures(s.trim())?;
    let g = |i: usize| c.get(i).and_then(|m| m.as_str().parse::<i64>().ok()).unwrap_or(0);
    let mut d = Duration::weeks(g(2)) + Duration::days(g(3)) + Duration::hours(g(4)) + Duration::minutes(g(5)) + Duration::seconds(g(6));
    if c.get(1).map(|m| m.as_str() == "-").unwrap_or(false) {
        d = -d;
    }
    Some(d)
}

static MEETING_RE: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();

pub fn detect_meeting(texts: &[&str]) -> Option<MeetingLink> {
    let res = MEETING_RE.get_or_init(|| {
        vec![
            ("Google Meet", Regex::new(r#"https?://meet\.google\.com/[a-z0-9\-]+(?:\?[^\s<>\"']*)?"#).unwrap()),
            ("Zoom", Regex::new(r#"https?://(?:[\w-]+\.)?zoom\.(?:us|com)/(?:j|my|s|w)/[^\s<>\"']+"#).unwrap()),
            ("Microsoft Teams", Regex::new(r#"https?://teams\.(?:microsoft\.com|live\.com)/(?:l/meetup-join|meet)/[^\s<>\"']+"#).unwrap()),
            ("Webex", Regex::new(r#"https?://[\w.-]*webex\.com/(?:meet|join|[\w-]+/j\.php)[^\s<>\"']*"#).unwrap()),
            ("Whereby", Regex::new(r#"https?://whereby\.com/[^\s<>\"']+"#).unwrap()),
            ("Jitsi", Regex::new(r#"https?://meet\.jit\.si/[^\s<>\"']+"#).unwrap()),
            ("Around", Regex::new(r#"https?://(?:meet\.)?around\.co/[^\s<>\"']+"#).unwrap()),
            ("Discord", Regex::new(r#"https?://discord(?:\.gg|\.com/invite)/[^\s<>\"']+"#).unwrap()),
            ("Slack Huddle", Regex::new(r#"https?://app\.slack\.com/huddle/[^\s<>\"']+"#).unwrap()),
            ("GoToMeeting", Regex::new(r#"https?://(?:global\.)?gotomeeting\.com/join/[^\s<>\"']+"#).unwrap()),
        ]
    });
    for t in texts {
        for (name, re) in res {
            if let Some(m) = re.find(t) {
                let url = m.as_str().trim_end_matches(|c: char| c == '.' || c == ',' || c == ')' || c == '>');
                return Some(MeetingLink { provider: name.to_string(), url: url.to_string() });
            }
        }
    }
    None
}

fn unescape(s: &str) -> String {
    s.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
}

fn build_event(e: &IcalEvent, source: &CalendarSource, start: i64, end: i64, all_day: bool, recurring: bool, instance_key: &str) -> CalEvent {
    let description = unescape(&prop_val(e, "DESCRIPTION"));
    let location = unescape(&prop_val(e, "LOCATION"));
    let url = prop_val(e, "URL");
    let conf = [
        prop_val(e, "X-GOOGLE-CONFERENCE"),
        prop_val(e, "X-MICROSOFT-SKYPETEAMSMEETINGURL"),
        prop_val(e, "X-MICROSOFT-ONLINEMEETINGEXTERNALLINK"),
        prop_val(e, "CONFERENCE"),
    ]
    .join(" ");
    let meeting = detect_meeting(&[&conf, &location, &url, &description]);
    let attendees = e
        .properties
        .iter()
        .filter(|p| p.name.eq_ignore_ascii_case("ATTENDEE"))
        .map(|p| param(p, "CN").map(|s| s.to_string()).unwrap_or_else(|| p.value.clone().unwrap_or_default().trim_start_matches("mailto:").to_string()))
        .collect();
    let organizer = prop(e, "ORGANIZER").map(|p| param(p, "CN").map(|s| s.to_string()).unwrap_or_else(|| p.value.clone().unwrap_or_default().trim_start_matches("mailto:").to_string())).unwrap_or_default();
    let uid = prop_val(e, "UID");
    CalEvent {
        id: format!("{}:{}:{}", source.id, uid, instance_key),
        source_id: source.id.clone(),
        uid,
        title: unescape(&prop_val(e, "SUMMARY")),
        description,
        location,
        start,
        end,
        all_day,
        recurring,
        status: prop_val(e, "STATUS"),
        organizer,
        attendees,
        url,
        meeting,
        color: source.color.clone(),
    }
}

/// Expand events from ICS text within [from, to] (epoch ms).
pub fn parse_ics(text: &str, source: &CalendarSource, from: i64, to: i64) -> Result<(Vec<CalEvent>, Option<String>)> {
    let reader = BufReader::new(text.as_bytes());
    let mut events = vec![];
    let mut cal_name = None;
    let from_dt = Utc.timestamp_millis_opt(from).single().unwrap_or_else(Utc::now);
    let to_dt = Utc.timestamp_millis_opt(to).single().unwrap_or_else(Utc::now);

    for cal in ical::IcalParser::new(reader) {
        let cal = match cal {
            Ok(c) => c,
            Err(e) => {
                log::warn!("ics parse error: {e}");
                continue;
            }
        };
        if cal_name.is_none() {
            cal_name = cal.properties.iter().find(|p| p.name == "X-WR-CALNAME").and_then(|p| p.value.clone());
        }
        // Overrides: (UID, RECURRENCE-ID ms) -> event
        let mut overrides: HashMap<(String, i64), &IcalEvent> = HashMap::new();
        for e in &cal.events {
            if let Some(rid) = prop(e, "RECURRENCE-ID").and_then(parse_dt) {
                overrides.insert((prop_val(e, "UID"), rid.0), e);
            }
        }
        for e in &cal.events {
            if prop(e, "RECURRENCE-ID").is_some() {
                continue; // handled as override
            }
            if prop_val(e, "STATUS").eq_ignore_ascii_case("CANCELLED") {
                continue;
            }
            let Some(dtstart_p) = prop(e, "DTSTART") else { continue };
            let Some((start, all_day)) = parse_dt(dtstart_p) else { continue };
            let end = match prop(e, "DTEND").and_then(parse_dt) {
                Some((end, _)) => end,
                None => match prop(e, "DURATION").and_then(|p| p.value.as_deref()).and_then(parse_duration) {
                    Some(d) => start + d.num_milliseconds(),
                    None => {
                        if all_day {
                            start + 86_400_000
                        } else {
                            start + 3_600_000
                        }
                    }
                },
            };
            let dur = end - start;
            let uid = prop_val(e, "UID");
            let rrule_p = prop(e, "RRULE");
            if rrule_p.is_none() {
                if end >= from && start <= to {
                    events.push(build_event(e, source, start, end, all_day, false, "0"));
                }
                continue;
            }
            // Recurring: build an rrule set string.
            let mut lines = vec![];
            let dts_val = dtstart_p.value.clone().unwrap_or_default();
            let dtstart_line = if all_day {
                format!("DTSTART:{}T000000", &dts_val[..8.min(dts_val.len())])
            } else if let Some(tz) = param(dtstart_p, "TZID") {
                match resolve_tz(tz) {
                    Some(t) => format!("DTSTART;TZID={}:{}", t.name(), dts_val),
                    None => format!("DTSTART:{}", dts_val.trim_end_matches('Z')),
                }
            } else {
                format!("DTSTART:{dts_val}")
            };
            lines.push(dtstart_line);
            lines.push(format!("RRULE:{}", rrule_p.unwrap().value.clone().unwrap_or_default()));
            for ex in e.properties.iter().filter(|p| p.name.eq_ignore_ascii_case("EXDATE")) {
                if let Some(v) = &ex.value {
                    let v = if all_day { v.split(',').map(|d| format!("{}T000000", &d[..8.min(d.len())])).collect::<Vec<_>>().join(",") } else { v.clone() };
                    match param(ex, "TZID").and_then(resolve_tz) {
                        Some(t) => lines.push(format!("EXDATE;TZID={}:{}", t.name(), v)),
                        None => lines.push(format!("EXDATE:{v}")),
                    }
                }
            }
            for rd in e.properties.iter().filter(|p| p.name.eq_ignore_ascii_case("RDATE")) {
                if let Some(v) = &rd.value {
                    if !all_day && param(rd, "VALUE").map(|x| x != "PERIOD").unwrap_or(true) {
                        lines.push(format!("RDATE:{v}"));
                    }
                }
            }
            let set_str = lines.join("\n");
            let set: RRuleSet = match set_str.parse() {
                Ok(s) => s,
                Err(err) => {
                    log::warn!("rrule parse failed for {uid}: {err} ({set_str:?})");
                    // Fall back to the first occurrence only.
                    if end >= from && start <= to {
                        events.push(build_event(e, source, start, end, all_day, true, "0"));
                    }
                    continue;
                }
            };
            let after = (from_dt - Duration::milliseconds(dur)).with_timezone(&Tz::UTC);
            let before = to_dt.with_timezone(&Tz::UTC);
            let result = set.after(after).before(before).all(400);
            for d in result.dates {
                let s = d.timestamp_millis();
                let key = s.to_string();
                if let Some(ov) = overrides.get(&(uid.clone(), s)) {
                    if prop_val(ov, "STATUS").eq_ignore_ascii_case("CANCELLED") {
                        continue;
                    }
                    let Some((os, oad)) = prop(ov, "DTSTART").and_then(parse_dt) else { continue };
                    let oe = prop(ov, "DTEND").and_then(parse_dt).map(|x| x.0).unwrap_or(os + dur);
                    if oe >= from && os <= to {
                        events.push(build_event(ov, source, os, oe, oad, true, &key));
                    }
                } else {
                    let en = s + dur;
                    if en >= from && s <= to {
                        events.push(build_event(e, source, s, en, all_day, true, &key));
                    }
                }
            }
        }
    }
    events.sort_by_key(|e| e.start);
    Ok((events, cal_name))
}

pub async fn fetch_source_text(url: &str) -> Result<String> {
    let u = url.trim();
    if u.starts_with("webcal://") || u.starts_with("webcals://") {
        let https = u.replacen("webcals://", "https://", 1).replacen("webcal://", "https://", 1);
        return fetch_http(&https).await;
    }
    if u.starts_with("http://") || u.starts_with("https://") {
        return fetch_http(u).await;
    }
    let p = u.trim_start_matches("file://");
    tokio::fs::read_to_string(p).await.with_context(|| format!("read {p}"))
}

async fn fetch_http(url: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent("Sid/1.0 (Windows; calendar)")
        .timeout(std::time::Duration::from_secs(25))
        .build()?;
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow!("HTTP {}", resp.status()));
    }
    let text = resp.text().await?;
    if !text.contains("BEGIN:VCALENDAR") {
        return Err(anyhow!("not an iCalendar feed"));
    }
    Ok(text)
}

pub async fn fetch_source(source: CalendarSource, from: i64, to: i64) -> FetchResult {
    let now = Utc::now().timestamp_millis();
    match fetch_source_text(&source.url).await {
        Ok(text) => match parse_ics(&text, &source, from, to) {
            Ok((events, name)) => FetchResult { source_id: source.id, events, fetched_at: now, calendar_name: name, error: None },
            Err(e) => FetchResult { source_id: source.id, events: vec![], fetched_at: now, calendar_name: None, error: Some(e.to_string()) },
        },
        Err(e) => FetchResult { source_id: source.id, events: vec![], fetched_at: now, calendar_name: None, error: Some(e.to_string()) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn src() -> CalendarSource {
        CalendarSource { id: "s".into(), name: "t".into(), url: "".into(), color: "#fff".into(), enabled: true, refresh_minutes: 30 }
    }

    #[test]
    fn expands_weekly() {
        let ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Standup\r\nDTSTART:20260901T090000Z\r\nDTEND:20260901T091500Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\nDESCRIPTION:Join https://meet.google.com/abc-defg-hij now\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let from = Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap().timestamp_millis();
        let to = Utc.with_ymd_and_hms(2026, 9, 15, 0, 0, 0).unwrap().timestamp_millis();
        let (ev, _) = parse_ics(ics, &src(), from, to).unwrap();
        assert_eq!(ev.len(), 4);
        assert_eq!(ev[0].meeting.as_ref().unwrap().provider, "Google Meet");
    }

    #[test]
    fn detects_links() {
        assert_eq!(detect_meeting(&["see https://us02web.zoom.us/j/1234567890?pwd=abc"]).unwrap().provider, "Zoom");
        assert_eq!(detect_meeting(&["https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=%7b%7d"]).unwrap().provider, "Microsoft Teams");
        assert!(detect_meeting(&["nothing here"]).is_none());
    }
}
