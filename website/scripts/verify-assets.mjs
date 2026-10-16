import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");

if (!fs.existsSync(distDir)) {
  console.error("❌ Error: dist/ directory does not exist. Run 'npm run build' first.");
  process.exit(1);
}

const htmlFile = path.join(distDir, "index.html");
const html = fs.readFileSync(htmlFile, "utf8");

// Match all relative src and href attributes starting with ./ or ../ or quotes
const regex = /(?:src|href|content)=["'](\.[^"']+)["']/g;
let match;
const missing = [];
const found = [];

while ((match = regex.exec(html)) !== null) {
  const relPath = match[1];
  // Ignore anchor hash links or protocol links if any slipped in
  if (relPath.startsWith("#") || relPath.startsWith("http")) continue;

  const fullPath = path.resolve(distDir, relPath);
  if (fs.existsSync(fullPath)) {
    found.push(relPath);
  } else {
    missing.push(relPath);
  }
}

// Also check gallery shots dynamically referenced in js (e.g. ./shots/<name>-<theme>.png)
const shotNames = [
  "today", "tasks", "calendar", "focus", "journal", "habits", "insights", "palette"
];
const themes = ["dark", "light"];
for (const s of shotNames) {
  for (const t of themes) {
    const shotPath = `./shots/${s}-${t}.png`;
    const fullShotPath = path.resolve(distDir, shotPath);
    if (fs.existsSync(fullShotPath)) {
      found.push(shotPath);
    } else {
      missing.push(shotPath);
    }
  }
}

// Check other shots
for (const extra of ["bubble.png", "voice-recording.png", "focus-running-dark.png", "focus-running-light.png", "pip-dark.png", "pip-light.png"]) {
  const p = `./shots/${extra}`;
  if (fs.existsSync(path.resolve(distDir, p))) {
    found.push(p);
  } else {
    missing.push(p);
  }
}

// Check showcase media files
const showcaseFiles = [
  "demo_hero_tour.webm",
  "demo_hero_tour.gif",
  "demo_dynamic_island.webm",
  "demo_dynamic_island.gif",
  "demo_doc_to_edgeless_canvas.webm",
  "demo_doc_to_edgeless_canvas.gif",
  "demo_life_architecture.webm",
  "demo_life_architecture.gif",
  "demo_reality_timeline_and_clips.webm",
  "demo_reality_timeline_and_clips.gif",
  "hero_dark.png",
  "hero_light.png",
  "bento_canvas.png",
  "bento_life_map.png",
  "bento_dynamic_island.png",
  "bento_notes_journal.png",
  "bento_calendar_reality.png",
  "bento_clips_smart_cards.png",
];
for (const sc of showcaseFiles) {
  const p = `./showcase/${sc}`;
  if (fs.existsSync(path.resolve(distDir, p))) {
    found.push(p);
  } else {
    missing.push(p);
  }
}

console.log("==========================================");
console.log(`Verified ${found.length} asset references:`);
for (const f of new Set(found)) {
  console.log(`  ✓ ${f}`);
}

if (missing.length > 0) {
  console.error(`\n❌ Found ${missing.length} missing asset(s):`);
  for (const m of new Set(missing)) {
    console.error(`  ✗ ${m}`);
  }
  process.exit(1);
}

console.log("\n🎉 All asset links resolved cleanly with zero 404s!");
