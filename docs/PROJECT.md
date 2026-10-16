# DayFlit — project memory

Floating desktop productivity companion for Windows. Built 2026-09-25 onward.
No prior codebase existed on this machine; the functional brief (docs/BRIEF.md) is the spec.

## Stack (decided 2026-09-25)
- **Tauri 2.11** (Rust 1.94, MSVC) — small footprint, native WebView2, first-class Windows access via the `windows` crate.
- **React 19 + TypeScript + Vite 8 + Tailwind 4 + Zustand 5** frontend.
- **Storage**: local-first JSON documents in a user-selectable data folder. Each collection is one file
  wrapped with a CRC32 + version envelope, written atomically (tmp + fsync + rename, retry for sync-folder locks).
  Rolling backups in `<data>/backups`. Images stored in `<data>/images`. A small pointer file in
  `%APPDATA%\Sid\config.json` records where the data folder is. Chosen over SQLite because SQLite in
  OneDrive/Dropbox folders is unsafe (WAL/locking); whole-file JSON with atomic replace syncs cleanly.
- **Timers** are authoritative in Rust (WebView2 throttles JS timers in hidden windows). Frontend derives
  remaining time from `startedAt`/`pausedAt` snapshots and ticks emitted by Rust.
- **Windows**: `main` (frameless, translucent), `bubble` (tiny always-on-top draggable orb when minimized),
  `pip` (compact focus timer), `palette` (global command palette). All created in Rust.

## Layout
- `src/` frontend. `src/stores` Zustand stores, `src/lib` pure logic (nlp parser, recurrence, search),
  `src/components`, `src/views`, `src/windows` (entry points for bubble/pip/palette).
- `src-tauri/src/` Rust: `store.rs` (persistence), `focus.rs` (timer engine), `media.rs` (SMTC),
  `spotify.rs` (Web API PKCE), `system.rs` (lock/power/focus-assist/foreground window), `clipboard.rs`
  (clipboard listener + source app), `calendar.rs` (ICS fetch/parse/rrule), `links.rs` (OG previews),
  `windows.rs` (window creation, docking, bubble), `commands.rs` (IPC surface), `sound.rs`.

## Round-2 modules (2026-10-02)
- `src-tauri/src/voice.rs` (cpal + whisper-rs + WinRT SpeechRecognizer), `distraction.rs` (foreground poller → nudge
  window), `export.rs` (Markdown vault), `oauth.rs` + `sync.rs` (Google Calendar / Microsoft Graph two-way sync).
- Windows: `voice` (hold-to-talk pill, `voice.html`) and `nudge` (`nudge.html`) in addition to main/bubble/pip/palette.
- Frontend: `views/Journal.tsx`, `views/Review.tsx`, `components/Timeline.tsx` (timeboxing + synced-event editing),
  `components/Heatmap.tsx`, `lib/activity.ts`, `lib/availability.ts`, `lib/voiceIntent.ts`, `lib/updater.ts`.
- Collections added: `journal`, `activity` (reserved). Attachments (audio) share the `images/` folder.
- Shell corner radius is fixed at 8px to match DWM; `--radius` only styles inner surfaces.
- Tooltips: never `title=`; use `aria-label` and, only for icon-only controls, `data-tip` (+ `data-tip-pos="top"`).
- No emoji anywhere; icons come from lucide (`components/icons.tsx` maps stored names).
- `website/` is the marketing site (Vite, static). Screenshots live in `website/public/shots`.

## Conventions
- IPC commands are `snake_case`; events are `sid://<domain>/<event>`.
- All user data changes go through the frontend stores which call `store_save` (debounced 400ms).
- Never block the Tauri main thread: heavy work in `tauri::async_runtime::spawn` / `spawn_blocking`.

## Status log
See docs/STATUS.md for remaining work and decisions.

## Building the installer (gotcha)
`npm run tauri build` downloads NSIS on first use and can hit `timeout: global` on slow networks.
Pre-seed the cache instead (`%LOCALAPPDATA%\tauri\NSIS`):
- extract `nsis-3.11.zip` (tauri-apps/binary-releases) so `makensis.exe` is directly inside `NSIS\`
- put `nsis_tauri_utils.dll` (tauri-apps/nsis-tauri-utils v0.5.3, sha1 75197fee…) in
  `NSIS\Plugins\x86-unicode\additional\`
The bundler checks that exact layout and recreates the folder if anything is missing.
The uninstaller hook lives in `src-tauri/nsis/hooks.nsh` (offers to delete `%APPDATA%\Sid`).
