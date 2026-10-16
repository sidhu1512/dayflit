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
  Windows SpeechRecognizer (live dictation). Hold-to-talk global shortcut (Alt+Shift+V) with a floating voice window,
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
- Installer: PREINSTALL/PREUNINSTALL hooks kill a running DayFlit instead of prompting; POSTUNINSTALL offers data removal.
- Website (`website/`): static Vite site with real screenshots (dark Ocean / light Graphite), animated hero mock,
  voice/heatmap demos, gallery with theme toggle and lightbox, download/versions/video/docs placeholders in
  `src/config.js`. Verified desktop and mobile renderings with headless Edge.

Build notes: Tauri resolved to 2.12 (windows crate 0.62) when plugins were added; whisper-rs-sys needs libclang, pinned via
`src-tauri/.cargo/config.toml` to the pip `libclang` package.

## 2026-10-13 (round 3: Visual Life Library, Wheel of Life, Life Map, Habit Heatmaps, Floating Window Polish & Verification)
- Floating tray & bubble window edge / shadow resolution:
  - Eliminated asymmetrical bottom-only shadows (`0 4px 14px -2px`) and hard rectangular edge clipping by introducing balanced ambient elevation shadows (`0 0 0 1px rgb(var(--border) / 0.14), 0 2px 8px rgba(0, 0, 0, 0.25), 0 6px 20px -2px rgba(0, 0, 0, 0.35)`).
  - Expanded outer container breathing room from `p-4` (16px) to `p-6` (24px) in `pip.tsx`, `palette.tsx`, `voice.tsx`, and `nudge.tsx`.
  - Bubble window outer dimension expanded in Rust to 84px with 56px inner orb and 14px breathing room; removed GDI region clipping (`make_circular` unclipped) allowing native Windows 11 DWM alpha blending to composite smooth antialiased drop-shadows.
  - PiP Floating Widget Tray upgraded with iOS Dynamic Island & compact tray modes, drag regions, close icons, and widget config (focus, tasks, habits, media, clock).
  - Floating palette (Ctrl+Shift+C / Alt+Shift+C), voice, and nudge windows equipped with drag handles, close icons, and Escape handlers.
- Typography & proportional layout safeguards:
  - Added Sacramento, Pacifico, and Caveat fonts; removed serif and mono font options from settings.
  - Added optical font scaling, line-height normalization in `applyTheme`, and scoped button/chip/input sizing constraints in `app.css` to prevent element disproportion or overflow.
  - Enforced `.tabular` sans-serif numerals on all clocks, timers, and metrics to prevent numeral jumping or baseline distortion.
- Image lifecycle & fallback UI:
  - Note & Journal attachment protection during clipboard cleanup.
  - Markdown renderer enhanced to display a graceful "Image unavailable" pill when images fail to load or are deleted from disk, accompanied by `ImageOff` icon indicators in NoteEditor, Journal, and Clips views.
- Visual Life Library, Wheel of Life & Life Map (`src/views/Life.tsx` & `src/stores/life.ts`):
  - 6 strategic life pillars: Health & Vitality, Work & Craft, Wealth & Finance, Personal Growth, Relationships, and Mindset & Lifestyle.
  - Visual Life Library with domain overview cards, target satisfaction badges, and goal/project drill-downs.
  - Wheel of Life interactive SVG spider radar chart with 1-10 scoring nodes, Life Balance Index diagnostic (variance + symmetry score), and historical assessments with reflection notes.
  - Life Map alignment waterfall tree linking Vision → Strategic Goals → Active Execution (Projects & Habits).
- Habit Contribution Heatmap Grid (`src/components/HabitHeatmap.tsx` & `src/views/Habits.tsx`):
  - GitHub-style 18-week activity contribution grids with month labels, completion intensities, streak calculation, and day inspector.
- Verification:
  - 31 Vitest unit tests passing (`npm test`).
  - Frontend production build succeeds cleanly (`npm run build`).
  - Rust Tauri backend compiles cleanly (`cargo check`).

## 2026-10-14 (round 4: Apple Dynamic Island Overhaul, Zero Dead Space, Floating Window De-boxing & Settings Typography)
- Dynamic Island & Floating Window Overhaul (`src/windows/pip.tsx`, `pip.html`, `src-tauri/src/windows.rs`):
  - Completely resolved the outer card / card-in-a-card defect: eliminated all `p-6` (24px) padding wrappers that caused massive wasted whitespace on the desktop.
  - Disabled Windows 11 DWM rectangular corner rounding on floating overlays (`round_corners(&w, false)` in `windows.rs`), terminating the bottom-biased rectangular OS drop shadow and frame artifacts on borderless transparent webviews.
  - Set `background: transparent !important` on `html`, `body`, and `#root` across all secondary HTML templates (`pip.html`, `palette.html`, `voice.html`, `nudge.html`, `bubble.html`).
  - Implemented authentic Apple OLED hardware aesthetics:
    - Jet-black OLED pill (`#000000`, `rounded-full`, 1px `rgba(255,255,255,0.14)` border, balanced ambient glow).
    - Live Activities: active focus session with pulsating indicator, bold tabular timer numerals `22:36`, task name, quick pause/play; now playing with animated 3-bar equalizer and track info; open tasks badge.
    - Expanded Apple Control Island (`rounded-[26px]`, `w-[370px]`, zero dead space):
      - Draggable header with iOS grab capsule (`data-tauri-drag-region`) and visible close button (`X`).
      - iOS segmented widget switcher (Focus, Tasks, Habits, Media, Energy/Clock, Quick Memo).
      - Inset focus progress bar cleanly bounded within widget padding with `overflow-hidden` so it NEVER starts outside or extends beyond the widget container.
      - Quick task creation and habit punch toggles directly from the floating tray.
      - Instant thought capture memo widget with auto-save to notes.
      - Widget customization toggle sheet.
- Floating Command Palette (Ctrl+Shift+C / Alt+Shift+C), Voice, & Nudge Windows (`palette.tsx`, `voice.tsx`, `nudge.tsx`, `CommandPalette.tsx`):
  - Removed `p-6` outer wrappers, setting tight bounds with exact `ResizeObserver` dimensions.
  - Added native drag handles, visible close icons (`X`), and Escape key handlers across all overlay windows.
  - Balanced multi-layer drop shadows (`0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25)`).
- Settings Fonts & Typography Safeguards (`Settings.tsx`, `themes.ts`, `appFixes.test.ts`):
  - Confirmed removal of `serif` and `mono` font options.
  - Validated Sacramento, Pacifico, and Caveat font scaling and line-height normalization to protect buttons, chips, and cards from disproportion or overflow.
  - Tabular numerals enforced for all clocks, timers, and metrics.
- Verification:
  - 31 Vitest unit tests passing (`npm test`).
  - TypeScript typecheck passing cleanly with 0 errors (`npm run typecheck`).
  - Frontend production build succeeds cleanly (`npm run build`).
  - Rust Tauri backend compiles with 0 errors (`cargo check`).
