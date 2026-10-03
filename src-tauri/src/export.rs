//! One-click Markdown export (Obsidian-friendly, plain Markdown everywhere else).
//!
//! Layout:
//!   <dir>/README.md
//!   <dir>/Notes/<title>.md                 (YAML front matter: created, updated, tags, pinned)
//!   <dir>/Journal/<yyyy>/<yyyy-mm-dd>[ -n].md
//!   <dir>/Tasks/Open.md, Completed.md, Someday.md
//!   <dir>/Habits/Habits.md                 (+ per-habit log table)
//!   <dir>/Focus/Sessions.md
//!   <dir>/Clips/Clips.md
//!   <dir>/attachments/<file>               (images + audio referenced as attachments/<file>)

use crate::store::Store;
use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Local, TimeZone, Utc};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub dir: String,
    pub notes: usize,
    pub journal: usize,
    pub tasks: usize,
    pub habits: usize,
    pub sessions: usize,
    pub clips: usize,
    pub attachments: usize,
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}
fn n(v: &Value, k: &str) -> i64 {
    v.get(k).and_then(|x| x.as_i64()).or_else(|| v.get(k).and_then(|x| x.as_f64()).map(|f| f as i64)).unwrap_or(0)
}
fn b(v: &Value, k: &str) -> bool {
    v.get(k).and_then(|x| x.as_bool()).unwrap_or(false)
}
fn arr<'a>(v: &'a Value, k: &str) -> Vec<&'a Value> {
    v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().collect()).unwrap_or_default()
}
fn strs(v: &Value, k: &str) -> Vec<String> {
    arr(v, k).into_iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()
}
fn ts(ms: i64) -> String {
    Utc.timestamp_millis_opt(ms).single().map(|d| d.with_timezone(&Local).format("%Y-%m-%d %H:%M").to_string()).unwrap_or_default()
}
fn yaml_str(v: &str) -> String {
    format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\""))
}
fn safe_name(title: &str, fallback: &str) -> String {
    let cleaned: String = title.chars().map(|c| if r#"\/:*?"<>|"#.contains(c) || c.is_control() { ' ' } else { c }).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = cleaned.trim_matches('.').trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}
fn unique(dir: &Path, base: &str, used: &mut HashSet<String>) -> PathBuf {
    let mut name = format!("{base}.md");
    let mut i = 2;
    while used.contains(&name.to_lowercase()) || dir.join(&name).exists() {
        name = format!("{base} {i}.md");
        i += 1;
    }
    used.insert(name.to_lowercase());
    dir.join(name)
}
/// Rewrite `dayflit-image://name` (and legacy `sid-image://name`) links to the exported attachments folder.
fn rewrite_links(body: &str, depth: usize) -> String {
    let prefix = "../".repeat(depth);
    let target = format!("{prefix}attachments/");
    body.replace("dayflit-image://", &target).replace("sid-image://", &target)
}
fn frontmatter(pairs: &[(&str, String)]) -> String {
    let mut out = String::from("---\n");
    for (k, v) in pairs {
        out.push_str(&format!("{k}: {v}\n"));
    }
    out.push_str("---\n\n");
    out
}
fn tags_yaml(tags: &[String]) -> String {
    if tags.is_empty() {
        "[]".into()
    } else {
        format!("[{}]", tags.iter().map(|t| yaml_str(t)).collect::<Vec<_>>().join(", "))
    }
}
fn load(store: &Store, name: &str) -> Value {
    store.load(name).ok().and_then(|r| r.data).unwrap_or(Value::Null)
}

pub fn export_markdown(store: &Store, dir: &Path) -> Result<ExportReport> {
    if dir.as_os_str().is_empty() {
        return Err(anyhow!("choose a folder"));
    }
    fs::create_dir_all(dir)?;
    let mut report = ExportReport { dir: dir.to_string_lossy().into(), notes: 0, journal: 0, tasks: 0, habits: 0, sessions: 0, clips: 0, attachments: 0 };
    let mut referenced: HashSet<String> = HashSet::new();
    let collect_refs = |body: &str, set: &mut HashSet<String>| {
        for scheme in ["dayflit-image://", "sid-image://"] {
            for m in body.split(scheme).skip(1) {
                let name: String = m.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '.' || *c == '_').collect();
                if !name.is_empty() {
                    set.insert(name);
                }
            }
        }
    };

    // ---- Notes
    let notes_dir = dir.join("Notes");
    fs::create_dir_all(&notes_dir)?;
    let mut used = HashSet::new();
    if let Some(list) = load(store, "notes").as_array() {
        for note in list {
            let body = s(note, "body");
            let title = s(note, "title");
            let first = body.lines().map(|l| l.trim_start_matches('#').trim()).find(|l| !l.is_empty()).unwrap_or("").to_string();
            let name = safe_name(if title.is_empty() { &first } else { &title }, &format!("Note {}", &s(note, "id")[..8.min(s(note, "id").len())]));
            let path = unique(&notes_dir, &name, &mut used);
            let tags = strs(note, "tags");
            let mut md = frontmatter(&[
                ("title", yaml_str(if title.is_empty() { &first } else { &title })),
                ("created", yaml_str(&ts(n(note, "createdAt")))),
                ("updated", yaml_str(&ts(n(note, "updatedAt")))),
                ("tags", tags_yaml(&tags)),
                ("pinned", b(note, "pinned").to_string()),
                ("archived", b(note, "archived").to_string()),
                ("source", yaml_str("sid-note")),
            ]);
            if !title.is_empty() {
                md.push_str(&format!("# {title}\n\n"));
            }
            md.push_str(&rewrite_links(&body, 1));
            md.push('\n');
            collect_refs(&body, &mut referenced);
            for img in strs(note, "images") {
                referenced.insert(img);
            }
            fs::write(&path, md)?;
            report.notes += 1;
        }
    }

    // ---- Journal
    let journal = load(store, "journal");
    let journals: Vec<Value> = arr(&journal, "journals").into_iter().cloned().collect();
    let jname = |id: &str| journals.iter().find(|j| s(j, "id") == id).map(|j| s(j, "name")).unwrap_or_else(|| "Journal".into());
    let mut per_day: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut entries: Vec<&Value> = arr(&journal, "entries");
    entries.sort_by_key(|e| n(e, "createdAt"));
    for e in entries {
        let date = s(e, "date");
        let year = date.get(..4).unwrap_or("undated").to_string();
        let jdir = dir.join("Journal").join(&year);
        fs::create_dir_all(&jdir)?;
        let count = per_day.entry(date.clone()).or_insert(0);
        *count += 1;
        let fname = if *count == 1 { format!("{date}.md") } else { format!("{date} -{}.md", *count) };
        let body = s(e, "body");
        let title = s(e, "title");
        let mood = e.get("mood").and_then(|m| m.as_i64());
        let tags = strs(e, "tags");
        let mut md = frontmatter(&[
            ("date", yaml_str(&date)),
            ("created", yaml_str(&ts(n(e, "createdAt")))),
            ("journal", yaml_str(&jname(&s(e, "journalId")))),
            ("title", yaml_str(&title)),
            ("tags", tags_yaml(&tags)),
            ("mood", mood.map(|m| m.to_string()).unwrap_or_else(|| "null".into())),
            ("favorite", b(e, "favorite").to_string()),
            ("source", yaml_str(&s(e, "source"))),
        ]);
        if !title.is_empty() {
            md.push_str(&format!("# {title}\n\n"));
        }
        md.push_str(&rewrite_links(&body, 2));
        md.push('\n');
        let audio = strs(e, "audio");
        if !audio.is_empty() {
            md.push_str("\n## Voice memos\n\n");
            for a in &audio {
                md.push_str(&format!("- [{a}](../../attachments/{a})\n"));
                referenced.insert(a.clone());
            }
        }
        collect_refs(&body, &mut referenced);
        for img in strs(e, "images") {
            referenced.insert(img);
        }
        fs::write(jdir.join(fname), md)?;
        report.journal += 1;
    }

    // ---- Tasks
    let tasks_dir = dir.join("Tasks");
    fs::create_dir_all(&tasks_dir)?;
    let tasks = load(store, "tasks");
    let tlist: Vec<&Value> = tasks.as_array().map(|a| a.iter().collect()).unwrap_or_default();
    let line = |t: &Value| -> String {
        let done = s(t, "status") == "done";
        let mut meta = vec![];
        let due = s(t, "due");
        if !due.is_empty() {
            meta.push(format!("due: {}", due.replace('T', " ")));
        }
        let p = s(t, "priority");
        if p != "none" && !p.is_empty() {
            meta.push(format!("priority:: {p}"));
        }
        for tag in strs(t, "tags") {
            meta.push(format!("#{tag}"));
        }
        let est = n(t, "estimateMin");
        if est > 0 {
            meta.push(format!("{est}m"));
        }
        let mut out = format!("- [{}] {}{}\n", if done { "x" } else { " " }, s(t, "title"), if meta.is_empty() { String::new() } else { format!("  {}", meta.join(" ")) });
        let notes = s(t, "notes");
        if !notes.trim().is_empty() {
            for l in notes.lines() {
                out.push_str(&format!("    {l}\n"));
            }
        }
        for st in arr(t, "subtasks") {
            out.push_str(&format!("    - [{}] {}\n", if b(st, "done") { "x" } else { " " }, s(st, "title")));
        }
        out
    };
    let mut open_md = String::from("# Open tasks\n\n");
    let mut someday_md = String::from("# Someday\n\n");
    let mut done_md = String::from("# Completed tasks\n\n");
    let mut lists: std::collections::BTreeMap<String, Vec<&Value>> = Default::default();
    for t in &tlist {
        if s(t, "status") == "done" {
            continue;
        }
        if b(t, "backlog") {
            someday_md.push_str(&line(t));
        } else {
            lists.entry(s(t, "list")).or_default().push(t);
        }
    }
    for (list, items) in lists {
        open_md.push_str(&format!("## {}\n\n", if list.is_empty() { "Inbox".into() } else { list }));
        for t in items {
            open_md.push_str(&line(t));
        }
        open_md.push('\n');
    }
    let mut done: Vec<&&Value> = tlist.iter().filter(|t| s(t, "status") == "done").collect();
    done.sort_by_key(|t| -n(t, "completedAt"));
    let mut last_day = String::new();
    for t in done {
        let day = ts(n(t, "completedAt")).get(..10).unwrap_or("").to_string();
        if day != last_day {
            done_md.push_str(&format!("\n## {day}\n\n"));
            last_day = day;
        }
        done_md.push_str(&line(t));
    }
    fs::write(tasks_dir.join("Open.md"), open_md)?;
    fs::write(tasks_dir.join("Someday.md"), someday_md)?;
    fs::write(tasks_dir.join("Completed.md"), done_md)?;
    report.tasks = tlist.len();
    for t in &tlist {
        for img in strs(t, "images") {
            referenced.insert(img);
        }
        collect_refs(&s(t, "notes"), &mut referenced);
    }

    // ---- Habits
    let habits_dir = dir.join("Habits");
    fs::create_dir_all(&habits_dir)?;
    let mut hmd = String::from("# Habits\n\n");
    if let Some(list) = load(store, "habits").as_array() {
        for h in list {
            let log = h.get("log").and_then(|l| l.as_object());
            let total: i64 = log.map(|l| l.values().filter_map(|v| v.as_i64()).sum()).unwrap_or(0);
            hmd.push_str(&format!("## {}\n\n- target: {} {}\n- since: {}\n- check-ins: {}\n\n", s(h, "name"), n(h, "target").max(1), s(h, "unit"), ts(n(h, "createdAt")), total));
            if let Some(l) = log {
                let mut days: Vec<(&String, &Value)> = l.iter().collect();
                days.sort_by(|a, b| b.0.cmp(a.0));
                hmd.push_str("| date | count |\n|---|---|\n");
                for (d, c) in days.iter().take(400) {
                    hmd.push_str(&format!("| {} | {} |\n", d, c.as_i64().unwrap_or(0)));
                }
                hmd.push('\n');
            }
            report.habits += 1;
        }
    }
    fs::write(habits_dir.join("Habits.md"), hmd)?;

    // ---- Focus sessions
    let focus_dir = dir.join("Focus");
    fs::create_dir_all(&focus_dir)?;
    let mut fmd = String::from("# Focus sessions\n\n| started | task | planned | actual | completed |\n|---|---|---|---|---|\n");
    if let Some(list) = load(store, "focus_history").as_array() {
        let mut items: Vec<&Value> = list.iter().filter(|h| s(h, "phase") == "work").collect();
        items.sort_by_key(|h| -n(h, "startedAt"));
        for h in items {
            fmd.push_str(&format!("| {} | {} | {}m | {}m | {} |\n", ts(n(h, "startedAt")), s(h, "taskTitle").replace('|', "/"), n(h, "plannedSecs") / 60, n(h, "actualSecs") / 60, if b(h, "completed") { "yes" } else { "no" }));
            report.sessions += 1;
        }
    }
    fs::write(focus_dir.join("Sessions.md"), fmd)?;

    // ---- Clips
    let clips_dir = dir.join("Clips");
    fs::create_dir_all(&clips_dir)?;
    let mut cmd = String::from("# Clipboard captures\n\n");
    if let Some(list) = load(store, "clips").as_array() {
        for c in list {
            let src = c.get("source").cloned().unwrap_or(Value::Null);
            cmd.push_str(&format!("## {} · {}\n\n", ts(n(c, "at")), s(&src, "app")));
            if !s(&src, "title").is_empty() {
                cmd.push_str(&format!("_{}_\n\n", s(&src, "title")));
            }
            if s(c, "kind") == "image" {
                let img = s(c, "image");
                cmd.push_str(&format!("![clip](../attachments/{img})\n\n"));
                referenced.insert(img);
            } else {
                cmd.push_str("```\n");
                cmd.push_str(&s(c, "text"));
                cmd.push_str("\n```\n\n");
            }
            report.clips += 1;
        }
    }
    fs::write(clips_dir.join("Clips.md"), cmd)?;

    // ---- Attachments
    let att = dir.join("attachments");
    fs::create_dir_all(&att)?;
    for name in &referenced {
        if let Ok(p) = store.image_path(name) {
            if p.exists() && fs::copy(&p, att.join(name)).is_ok() {
                report.attachments += 1;
            }
        }
    }

    // ---- README
    let now: DateTime<Local> = Local::now();
    fs::write(
        dir.join("README.md"),
        format!(
            "# Sid export\n\nExported {} from Sid.\n\n- `Notes/` – one Markdown file per note (front matter: tags, created, updated)\n- `Journal/<year>/` – one file per entry, named by date\n- `Tasks/` – open, someday and completed tasks as Markdown checklists\n- `Habits/` – habit definitions and check-in logs\n- `Focus/` – focus session history\n- `Clips/` – clipboard captures\n- `attachments/` – images and voice memos referenced from the files above\n\nEverything is plain Markdown. Open this folder as an Obsidian vault to get backlinks, tags and search.\n",
            now.format("%Y-%m-%d %H:%M")
        ),
    )
    .context("write README")?;
    Ok(report)
}
