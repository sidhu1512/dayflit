# Status / worklog

## 2026-10-01 → 10-02 (round 2: bugs + major features)
Bugs (reproduced on the real desktop with screen captures, then fixed and re-verified):
- Bubble click did not restore: `startDragging` on mousedown swallowed mouseup. Now a drag only starts after 4px of
  movement; a plain click restores (verified via CDP mouse events → main visible).
- Bubble "dark square": the HWND was a transparent rectangle showing whatever was behind. The bubble window now has a
  circular region (`SetWindowRgn`) so hit-testing and any paint are round; pixels around it match the desktop.
- Double corners: CSS radius (18px) sat on top of DWM's 8px rounding so the acrylic rectangle showed outside the surface.
  Shell radius is now `--shell-radius: 8px` (DWM), CSS shadow/double border removed; inner cards keep the user radius.
- Tooltips: every browser `title` was converted to `aria-label`; eleven icon-only controls keep a styled `data-tip`.
- Emoji removed everywhere (habit/journal icons are Lucide names with a legacy-emoji migration; ambient options,
  title chip, bubble pause glyph, notes/clips indicators are icons/CSS).
- Error screen now has minimize/close controls and a drag region.
- Narrow layouts (340px): verified no horizontal overflow on Today/Journal/Calendar/Settings; Settings nav collapses to icons.

Features added and verified in the running app:
- Timeboxing: drop tasks onto the day timeline, move/resize blocks (15-min snap), start focus from a block, "Plan my day"
  auto-fits unscheduled tasks into gaps. Task ↔ block stays in sync (completion, deletion).
- Journal: multiple journals, prompts, templates, moods, favourites, photos, voice memos, calendar browsing, streaks,
  "On this day", search/tags, PIN lock with auto-relock, Today card, palette search, Markdown export.
- Voice capture: cpal recording + whisper.cpp (whisper-rs, models downloaded on demand into `%APPDATA%\Sid\models`) or
  Windows SpeechRecognizer (live dictation). Hold-to-talk global shortcut (Ctrl+Shift+V) with a floating voice window,
  intent detection ("remind me to…", "note to self…", "journal…"), review step, Enter/Ctrl+1-3 to file, original audio
  kept as a voice memo. Verified: TTS WAVs transcribed verbatim with tiny.en in <1 s; real key hold drives the window.
- Distraction nudges: foreground-window poller during work phases; app names, title keywords, full-screen detection;
  cooldown, snooze-per-session, soft sound; a small non-focus-stealing nudge window. Verified with Notepad in front.
- Insights: Overview / Weekly review (this vs last week, best day, where focus went, patterns, carry-forward with
  "move overdue to next week") / Consistency heatmap (26 or 52 weeks, day inspector). Monday 9:00 digest reminder.
- Markdown/Obsidian export (`src-tauri/src/export.rs`): Notes, Journal/<year>, Tasks (Open/Someday/Completed), Habits,
  Focus sessions, Clips, attachments, README; YAML front matter. Verified output.
- Automatic updates: tauri-plugin-updater + process plugin, signing key generated (`%USERPROFILE%\.tauri\sid.key`),
  pubkey in tauri.conf.json, updater artifacts enabled, Settings → Updates UI (check, progress, relaunch), startup
  auto-check, palette command. Endpoint placeholders documented in docs/UPDATES.md.
- Google Calendar + Microsoft 365 two-way sync (`oauth.rs`, `sync.rs`): PKCE loopback OAuth, calendar picker, events
  merged into the calendar; synced events can be moved/resized/created (double-click empty timeline)/renamed/deleted.
  Needs the user's own OAuth client IDs (fields in Settings → Calendars). Not exercised against live accounts here.
- Unified search across tasks, notes, journal, clips and calendar events in the palette; "Copy available slots"
  (tomorrow / next 5 days, working hours, slot length); "Join next meeting"; meeting prep card (attendees, related
  notes/tasks, one-click meeting note); optional auto-join at start time.
- Installer: PREINSTALL/PREUNINSTALL hooks kill a running Sid instead of prompting; POSTUNINSTALL offers data removal.
- Website (`website/`): static Vite site with real screenshots (dark Ocean / light Graphite), animated hero mock,
  voice/heatmap demos, gallery with theme toggle and lightbox, download/versions/video/docs placeholders in
  `src/config.js`. Verified desktop and mobile renderings with headless Edge.

Build notes: Tauri resolved to 2.12 (windows crate 0.62) when plugins were added; whisper-rs-sys needs libclang, pinned via
`src-tauri/.cargo/config.toml` to the pip `libclang` package.

## Not verifiable headlessly
Tray clicks, toast visibility, sound audibility, lock/unlock auto-pause, Spotify OAuth, Google/Outlook OAuth and API
calls (need real client IDs + browser consent), a live media player, real microphone speech (mic did not pick up the
TTS speaker test; file transcription and the recording pipeline were verified instead).

## Remaining ideas (not blocking)
- Semantic (embedding) search: current search is lexical fuzzy search across every data type; an on-device embedding
  model (~30 MB ONNX) could be added behind the same index.
- Private booking link for availability needs a hosted endpoint; the copy-to-clipboard slots work today.
