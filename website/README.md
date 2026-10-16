# DayFlit website

Static marketing site for DayFlit. No framework at runtime: one HTML page, one stylesheet, one script, built with Vite.

```
cd website
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/ (deploy this folder anywhere static: Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3)
```

## Before launch
Edit `src/config.js`:
- `downloadUrl`, `releasesUrl`, `version`, `releaseDate`, `sha256` (from `certutil -hashfile Dayflit_x.y.z_x64-setup.exe SHA256`)
- `docsUrl`, `supportUrl`, `contactUrl`, `privacyUrl`, `sourceUrl`, `betaUrl`
- `demoVideoUrl` (a local `public/demo.mp4` or a YouTube/Vimeo embed URL)
- `analytics.plausibleDomain` (optional, privacy-friendly analytics; leave empty to disable)

Links that are still empty are rendered disabled and show a small "not configured" notice when clicked, so nothing on the page is a dead end.

## Screenshots
`public/shots/*.png` are real captures of the app (dark Ocean + light Graphite themes, 420x720 logical) taken with the
CDP test harness (`docs/TESTING.md` in the main repo). Re-capture after visual changes by running `flow15.mjs` from the
harness, or replace the files by hand. The gallery toggles between `<name>-dark.png` and `<name>-light.png`.

## Deploy
`dist/` is fully relative (`base: "./"`), so it works from a sub-path too. Set a custom domain and HTTPS at the host;
nothing else is required.
