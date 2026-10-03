# Automatic updates

Dayflit uses the Tauri updater: a signed `latest.json` manifest plus a signed installer per version.

## What is already wired
- `tauri-plugin-updater` + `tauri-plugin-process` (relaunch) in `src-tauri/src/lib.rs`
- `plugins.updater` in `src-tauri/tauri.conf.json` with the public key and release endpoint
- `bundle.createUpdaterArtifacts: true` so `npm run tauri build` emits `Dayflit_<ver>_x64-setup.exe.sig`
- In-app UX: Settings → Updates (check, download with progress, install, relaunch), auto-check on startup, palette command "Check for updates", non-blocking toast when a version is available.

## What you must provide
1. **Signing key** – generated at `%USERPROFILE%\.tauri\dayflit.key` (or `%USERPROFILE%\.tauri\sid.key`). Builds that should be installable as updates must be signed with this key:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\dayflit.key" -Raw
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   npm run tauri build
   ```
   This writes `Dayflit_<ver>_x64-setup.exe` and `Dayflit_<ver>_x64-setup.exe.sig` under `src-tauri/target/release/bundle/nsis/`.
2. **Endpoint** – configured in `tauri.conf.json` as `https://github.com/sidhu1512/dayflit/releases/latest/download/latest.json`.
   Attach `latest.json`, `Dayflit_<ver>_x64-setup.exe` and its `.sig` to each GitHub release. `latest.json` format:
   ```json
   {
     "version": "1.0.0",
     "notes": "What changed",
     "pub_date": "2026-10-03T18:00:00Z",
     "platforms": {
       "windows-x86_64": {
         "signature": "<contents of .sig>",
         "url": "https://github.com/sidhu1512/dayflit/releases/download/v1.0.0/Dayflit_1.0.0_x64-setup.exe"
       }
     }
   }
   ```
Until the endpoint exists, "Check for updates" reports that no update server is configured and the app keeps working normally.
