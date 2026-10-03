# Testing Sid

## Unit tests
- `npm test` — parser (chrono + custom recurrence/priority/estimate), recurrence engine.
- `cargo test --manifest-path src-tauri/Cargo.toml` — ICS expansion and meeting-link detection.

## Driving the real app (no screen needed)
Launch with WebView2 remote debugging and drive every window over the Chrome DevTools Protocol:

```
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" npm run tauri dev
```

Targets appear at http://127.0.0.1:9222/json (main `localhost:1420/`, `bubble.html`, `pip.html`,
`palette.html`). `Page.captureScreenshot` gives exact webview screenshots even when the desktop is locked;
`Input.dispatchKeyEvent` / `Input.insertText` / `Runtime.evaluate` drive the UI. Tauri commands can be
invoked from a page with `window.__TAURI_INTERNALS__.invoke(name, args)`.

Useful invariants to check after a flow:
- `%APPDATA%\Sid\data\*.json` all parse and carry matching CRCs (a corrupt file gets quarantined as
  `*.corrupt-<stamp>` and the `.bak` or newest zip backup is used).
- `%APPDATA%\Sid\logs\sid.log` has no `[ERROR]` lines.

## Website renders
`website/dist` must be served over HTTP for checks (Vite adds `crossorigin`, which file:// blocks):
`npx vite preview --port 4321` then headless Edge:
`msedge --headless=new --window-size=1400,5600 --screenshot=out.png http://localhost:4321/`.
Headless Edge enforces a minimum window width, so for phone widths attach over `--remote-debugging-port`
and use `Emulation.setDeviceMetricsOverride` (see scratchpad `mobile.mjs` pattern); scroll-reveal sections stay
invisible until scrolled, so scroll before capturing below the fold.

## Voice
`voice_transcribe_file` transcribes any WAV; Windows TTS (`System.Speech`) can generate deterministic test audio.
Hold-to-talk can be exercised with synthetic `keybd_event` presses of the configured shortcut.
