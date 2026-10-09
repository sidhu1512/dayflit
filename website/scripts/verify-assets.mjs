import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");

if (!fs.existsSync(distDir)) {
  console.error("❌ Error: dist/ directory does not exist. Run 'npm run build' first.");
  process.exit(1);
}

const htmlFiles = ["index.html", "bento.html", "maximalism.html", "minimalism.html", "spatial.html"]
  .map((f) => path.join(distDir, f))
  .filter((f) => fs.existsSync(f));

if (htmlFiles.length === 0) {
  console.error("❌ Error: No HTML files found in dist/.");
  process.exit(1);
}

// Match all relative src and href attributes starting with ./ or ../ or quotes
const regex = /(?:src|href|content)=["'](\.[^"']+)["']/g;
const missing = [];
const found = [];

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, "utf8");
  let match;
  while ((match = regex.exec(html)) !== null) {
    const relPath = match[1];
    // Ignore anchor hash links or protocol links if any slipped in
    if (relPath.startsWith("#") || relPath.startsWith("http")) continue;

    // Handle relative links between pages e.g. ./bento.html or ./index.html
    const fullPath = path.resolve(distDir, relPath);
    if (fs.existsSync(fullPath)) {
      found.push(relPath);
    } else {
      missing.push(`${path.basename(htmlFile)} -> ${relPath}`);
    }
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
