# Dayflit

[![Website](https://img.shields.io/badge/Website-sidhu1512.github.io%2Fdayflit-60a5fa?style=flat-square)](https://sidhu1512.github.io/dayflit/)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078d4?style=flat-square&logo=windows)](https://sidhu1512.github.io/dayflit/)
[![Tests](https://img.shields.io/badge/Tests-266%20Passed-success?style=flat-square)](https://github.com/sidhu1512/dayflit)
[![Built with](https://img.shields.io/badge/Built%20with-Tauri%20v2%20%2B%20React%2019-ea580c?style=flat-square)](https://tauri.app)
[![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)

> **A floating desktop productivity companion for Windows.** Tasks, canvas boards, notes, focus sessions, habits, calendar timeboxing, clipboard capture, and media controls in one translucent, high-performance window that is always a keystroke away. 100% offline, local JSON storage, zero telemetry.

🌐 **Live Website & Interactive Preview:** [https://sidhu1512.github.io/dayflit/](https://sidhu1512.github.io/dayflit/)

## Features

- **Instant capture** with natural language: `Call Sam tomorrow 3pm #work !high every week for 30m`
- **Interactive Canvas Board & Life Map**: Visual spatial workspace with live embeds, connections, radar balance instrument, and smart object cards
- **Dynamic Island & Floating Bubble**: Seamless micro-interactions, spring physics, and quick access floating widgets

- **Tasks**: priorities, due dates/times, recurrence (schedule or after completion), lists, tags, subtasks, estimates, snooze, someday backlog, keyboard-first (j/k/x/e/f…)
- **Focus**: Pomodoro / deep work / custom / stopwatch, Rust-authoritative timers that survive a hidden window, task linking, floating PiP timer, completion sounds, ambient soundscapes, media hooks (play on start, pause on break/end), pause on Windows lock
- **Notes**: Markdown, checklists, #tags, link previews, pasted/dropped images stored locally
- **Habits**: daily / specific days / times per week, counts and units, streaks, 14-day grid, reminders
- **Calendar**: any `.ics` feed (Google, Outlook, iCloud…), recurring events, meeting-link detection (Meet, Zoom, Teams, Webex…) with one-click join and reminders
- **Clips**: clipboard history with source app/window, convert to task or note; password managers ignored
- **Media**: Windows media transport controls (works with Spotify, browsers, players), system volume, optional Spotify Web API (PKCE) for playlists
- **Windows integration**: frameless acrylic/mica window, edge docking, multi-monitor aware, bubble mode, tray, global shortcuts, notifications with Focus Assist awareness, single instance, autostart, lock/power/display events
- **Data**: local JSON with checksums, atomic writes, daily zip backups, corruption recovery, movable data folder (OneDrive/Dropbox friendly)
- **Voice capture**: hold Alt+Shift+V, speak, release. Offline Whisper (model downloaded on demand) or Windows speech; becomes a task, note or journal entry
- **Journal**: prompts, templates, moods, photos, voice memos, multiple journals, PIN lock, "On this day", streaks
- **Timeboxing**: drag tasks onto the day timeline, move/resize, "Plan my day", start focus from a block
- **Google / Outlook sync**: two-way with your own OAuth client IDs; move, resize, create and delete from Dayflit
- **Distraction nudges**: quiet reminder when a configured app/page comes to the front during a focus block
- **Insights**: consistency heatmap, weekly review, where your focus went
- **Export**: one click to a Markdown folder that opens as an Obsidian vault
- **Updates**: signed in-app updates (see docs/UPDATES.md for the endpoint you need to provide)

## Development

```bash
npm install
npm run tauri dev
```

Requires Rust (MSVC toolchain), Node 20+, and the WebView2 runtime (bundled with Windows 11).

Tests: `npm test` (frontend) and `cargo test --manifest-path src-tauri/Cargo.toml` (backend).

## Build an installer

```bash
npm run tauri build
```

Produces an NSIS installer under `src-tauri/target/release/bundle/nsis/`.

## Data locations

- App config, window state, Spotify tokens, logs: `%APPDATA%\Dayflit\`
- User data (default): `%APPDATA%\Dayflit\data\` — change it from Settings → Data & backups.

See `docs/PROJECT.md` for architecture notes, `docs/STATUS.md` for what was verified, `docs/UPDATES.md` for the update server, and `website/` for the marketing site.
