const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("==========================================");
console.log("Deep Multi-Edition Verification Suite");
console.log("Apple Light • Bento Grid • Maximalism • Minimalism");
console.log("==========================================\n");

const distBentoPath = path.resolve(__dirname, '../website/dist/bento.html');
const distIndexPath = path.resolve(__dirname, '../website/dist/index.html');
const distMaximalismPath = path.resolve(__dirname, '../website/dist/maximalism.html');
const distMinimalismPath = path.resolve(__dirname, '../website/dist/minimalism.html');

assert(fs.existsSync(distBentoPath), "dist/bento.html must exist");
assert(fs.existsSync(distIndexPath), "dist/index.html must exist");
assert(fs.existsSync(distMaximalismPath), "dist/maximalism.html must exist");
assert(fs.existsSync(distMinimalismPath), "dist/minimalism.html must exist");

const bentoHtml = fs.readFileSync(distBentoPath, 'utf8');
const indexHtml = fs.readFileSync(distIndexPath, 'utf8');
const maximalismHtml = fs.readFileSync(distMaximalismPath, 'utf8');
const minimalismHtml = fs.readFileSync(distMinimalismPath, 'utf8');

// 1. Cross-linking between all four editions
console.log("1. Checking quad-directional navigation links...");
assert(indexHtml.includes('bento.html'), "index.html must link to bento.html");
assert(indexHtml.includes('maximalism.html'), "index.html must link to maximalism.html");
assert(indexHtml.includes('minimalism.html'), "index.html must link to minimalism.html");

assert(bentoHtml.includes('index.html'), "bento.html must link to index.html");
assert(bentoHtml.includes('maximalism.html'), "bento.html must link to maximalism.html");
assert(bentoHtml.includes('minimalism.html'), "bento.html must link to minimalism.html");

assert(maximalismHtml.includes('index.html'), "maximalism.html must link to index.html");
assert(maximalismHtml.includes('bento.html'), "maximalism.html must link to bento.html");
assert(maximalismHtml.includes('minimalism.html'), "maximalism.html must link to minimalism.html");

assert(minimalismHtml.includes('index.html'), "minimalism.html must link to index.html");
assert(minimalismHtml.includes('bento.html'), "minimalism.html must link to bento.html");
assert(minimalismHtml.includes('maximalism.html'), "minimalism.html must link to maximalism.html");

console.log("   ✓ index.html -> bento, maximalism, minimalism verified");
console.log("   ✓ bento.html -> index, maximalism, minimalism verified");
console.log("   ✓ maximalism.html -> index, bento, minimalism verified");
console.log("   ✓ minimalism.html -> index, bento, maximalism verified");

// 2. Verified SHA-256 Checksum
console.log("\n2. Checking verified SHA-256 checksum across editions...");
const sha256Expected = "955a2f3ade41f34584e5cd463cd37042d24d9440e6dd8967ad3d715837622053";
assert(bentoHtml.includes(sha256Expected), "bento.html must contain exact SHA-256 hash");
assert(maximalismHtml.includes(sha256Expected), "maximalism.html must contain exact SHA-256 hash");
assert(minimalismHtml.includes(sha256Expected), "minimalism.html must contain exact SHA-256 hash");
console.log(`   ✓ Found exact SHA-256 in bento: ${sha256Expected}`);
console.log(`   ✓ Found exact SHA-256 in maximalism: ${sha256Expected}`);
console.log(`   ✓ Found exact SHA-256 in minimalism: ${sha256Expected}`);

// 3. Nine Core Bento Grid Cards Presence & Elements
console.log("\n3. Checking 9 Core Bento Grid cards & IDs...");
const expectedBentoCards = [
  { id: "card-device", label: "Phone & Companion Dock Card" },
  { id: "card-sage", label: "Sage Green Metric Card (4.875 ♥)" },
  { id: "card-slate", label: "Dark Slate Charcoal Card (57K, +10%)" },
  { id: "card-butter", label: "Butter Yellow Card with Sunburst" },
  { id: "card-lilac", label: "Centerpiece Lilac Spline Card" },
  { id: "card-blue", label: "Periwinkle Blue Soundscapes Card" },
  { id: "card-cream", label: "Pale Cream Typography Card" },
  { id: "card-forest", label: "Deep Forest Green Whisper Radar Card" },
  { id: "card-rose", label: "Dusty Rose Knot Card (CUBO style)" },
];

for (const card of expectedBentoCards) {
  assert(bentoHtml.includes(`id="${card.id}"`), `Bento card ${card.id} must exist in HTML`);
  console.log(`   ✓ ${card.id} (${card.label}) found`);
}

// 4. Interactive Components Verification in Bento
console.log("\n4. Checking interactive sub-components in Bento...");
assert(bentoHtml.includes('id="dynamic-island"'), "Dynamic Island element must exist");
assert(bentoHtml.includes('id="spline-svg"'), "Spline SVG element must exist");
assert(bentoHtml.includes('id="spline-active-dot"'), "Spline active dot circle must exist");
assert(bentoHtml.includes('id="spline-active-halo"'), "Spline active halo circle must exist");
assert(bentoHtml.includes('id="btn-spline-weekly"'), "Spline weekly tab must exist");
assert(bentoHtml.includes('id="btn-spline-monthly"'), "Spline monthly tab must exist");
assert(bentoHtml.includes('id="sound-play-btn"'), "Soundscape play button must exist");
assert(bentoHtml.includes('id="sound-equalizer"'), "Soundscape equalizer must exist");
assert(bentoHtml.includes('id="btn-whisper-demo"'), "Whisper button must exist");
assert(bentoHtml.includes('id="radar-sweep-beam"'), "Radar sweep beam must exist");
assert(bentoHtml.includes('id="nlp-input"'), "NLP input element must exist");
assert(bentoHtml.includes('id="btn-copy-sha256"'), "SHA-256 copy button must exist");
assert(bentoHtml.includes('sunburst-badge'), "Sunburst badge must exist");
assert(bentoHtml.includes('rose-geometric-knot'), "Triquetra knot emblem must exist");
console.log("   ✓ All 14 interactive UI IDs verified in Bento DOM");

// 5. Extended Bento sections
console.log("\n5. Checking extended bento sections...");
assert(bentoHtml.includes('id="nlp-studio"'), "NLP Studio section must exist");
assert(bentoHtml.includes('id="shortcuts"'), "Shortcuts Matrix section must exist");
assert(bentoHtml.includes('id="comparison"'), "Comparison table section must exist");
assert(bentoHtml.includes('id="gallery"'), "Visual Gallery section must exist");
console.log("   ✓ NLP Studio, Shortcuts, Comparison, and Gallery sections present in Bento");

// 6. Maximalism Edition Core Cards & Micro-widgets
console.log("\n6. Checking Maximalism Edition cards & micro-widgets...");
const expectedMaxCards = [
  { id: "card-device", label: "Desktop Companion & Phone Frame" },
  { id: "card-balance", label: "Balance & Sunburst Card" },
  { id: "card-savings", label: "Yearly Focus Savings & Multi-colored Meter" },
  { id: "card-mascot", label: "Mascot & Editorial Craft Card" },
  { id: "card-habits", label: "Tactile Habit Punch-Card" },
  { id: "sound-studio", label: "Ambient Soundscapes Studio" },
  { id: "nlp-whisper", label: "Natural Language & Whisper Studio" },
  { id: "download-verified", label: "Verified Installer Download Card" },
  { id: "comparison", label: "Engineering & Architecture Matrix" },
  { id: "gallery", label: "Visual Interface Gallery" },
];

for (const card of expectedMaxCards) {
  assert(maximalismHtml.includes(`id="${card.id}"`), `Maximalism card ${card.id} must exist in HTML`);
  console.log(`   ✓ ${card.id} (${card.label}) found`);
}

// 7. Maximalism Interactive Components
console.log("\n7. Checking Maximalism interactive sub-components...");
assert(maximalismHtml.includes('id="phone-island"'), "Phone Dynamic Island must exist");
assert(maximalismHtml.includes('id="sparkline-wave"'), "Sparkline wave path must exist");
assert(maximalismHtml.includes('id="balance-starburst-svg"'), "Balance starburst SVG or class must exist");
assert(maximalismHtml.includes('id="sound-play-toggle"'), "Sound play toggle button must exist");
assert(maximalismHtml.includes('id="nlp-input"'), "NLP input element must exist");
assert(maximalismHtml.includes('id="btn-whisper-test"'), "Whisper test mic button must exist");
assert(maximalismHtml.includes('id="btn-copy-sha256"'), "SHA-256 copy button must exist");
assert(maximalismHtml.includes('id="gallery-modal"'), "Gallery modal lightbox must exist");
console.log("   ✓ All Maximalist interactive UI IDs verified in DOM");

// 8. Minimalism Edition Sections & UI Elements (Reference Screenshot & Generative UI)
console.log("\n8. Checking Minimalism Edition sections & architectural elements...");
const expectedMinSections = [
  { id: "documents", label: "Iconic Technical Documents & Generative Art Showcase" },
  { id: "generative-studio", label: "Parametric Ray Synthesizer Studio (/generative_ui)" },
  { id: "specifications", label: "Low-level System Specifications Matrix" },
  { id: "verification", label: "Cryptographic Manifest Verification Card" },
  { id: "editions", label: "Four-Edition Cross-Showcase Gallery" },
];

for (const sec of expectedMinSections) {
  assert(minimalismHtml.includes(`id="${sec.id}"`), `Minimalism section ${sec.id} must exist in HTML`);
  console.log(`   ✓ Section ${sec.id} (${sec.label}) found`);
}

// 9. Minimalism Interactive Components
console.log("\n9. Checking Minimalism interactive sub-components...");
assert(minimalismHtml.includes('id="doc-cards-grid"'), "Document cards container must exist");
assert(minimalismHtml.includes('id="generative-canvas"'), "Hero generative fan canvas must exist");
assert(minimalismHtml.includes('id="studio-canvas"'), "Studio parametric canvas must exist");
assert(minimalismHtml.includes('id="view-all-downloads-btn"'), "View All Downloads button must exist");
assert(minimalismHtml.includes('id="download-all-btn"'), "Download All Documents button must exist");
assert(minimalismHtml.includes('id="download-selected-btn"'), "Download Selected button must exist");
assert(minimalismHtml.includes('id="selected-count"'), "Selected count badge must exist");
assert(minimalismHtml.includes('id="doc-search-input"'), "Document search input must exist");
assert(minimalismHtml.includes('id="toggle-animate-btn"'), "Toggle animate button must exist");
assert(minimalismHtml.includes('id="randomize-fan-btn"'), "Randomize fan button must exist");
assert(minimalismHtml.includes('id="export-svg-btn"'), "Vector SVG export button must exist");
assert(minimalismHtml.includes('id="snapshot-png-btn"'), "Snapshot PNG button must exist");
assert(minimalismHtml.includes('id="copy-hash-btn"'), "Copy hash button must exist");
assert(minimalismHtml.includes('id="doc-modal-overlay"'), "Document sheet reader modal must exist");
assert(minimalismHtml.includes('id="modal-close-btn"'), "Modal close button must exist");
assert(minimalismHtml.includes('id="min-toast"'), "Minimalist toast element must exist");
console.log("   ✓ All 16 Minimalism interactive UI components verified in DOM");

console.log("\n🎉 ALL MULTI-EDITION SPEC VERIFICATIONS PASSED WITH 100% SUCCESS!");
