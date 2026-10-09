const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("==========================================");
console.log("Deep Bento Grid Masterpiece Verification");
console.log("==========================================\n");

const distBentoPath = path.resolve(__dirname, '../website/dist/bento.html');
const distIndexPath = path.resolve(__dirname, '../website/dist/index.html');

assert(fs.existsSync(distBentoPath), "dist/bento.html must exist");
assert(fs.existsSync(distIndexPath), "dist/index.html must exist");

const bentoHtml = fs.readFileSync(distBentoPath, 'utf8');
const indexHtml = fs.readFileSync(distIndexPath, 'utf8');

// 1. Cross-linking between Classic Apple site and Bento Masterpiece
console.log("1. Checking bidirectional navigation links...");
assert(indexHtml.includes('bento.html'), "index.html must link to bento.html");
assert(bentoHtml.includes('index.html'), "bento.html must link to index.html");
console.log("   ✓ index.html -> bento.html verified");
console.log("   ✓ bento.html -> index.html verified");

// 2. Verified SHA-256 Checksum
console.log("\n2. Checking verified SHA-256 checksum...");
const sha256Expected = "955a2f3ade41f34584e5cd463cd37042d24d9440e6dd8967ad3d715837622053";
assert(bentoHtml.includes(sha256Expected), "bento.html must contain exact SHA-256 hash");
console.log(`   ✓ Found exact SHA-256: ${sha256Expected}`);

// 3. Nine Core Bento Grid Cards Presence & Elements
console.log("\n3. Checking 9 Core Bento Grid cards & IDs...");
const expectedCards = [
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

for (const card of expectedCards) {
  assert(bentoHtml.includes(`id="${card.id}"`), `Card ${card.id} must exist in HTML`);
  console.log(`   ✓ ${card.id} (${card.label}) found`);
}

// 4. Interactive Components Verification
console.log("\n4. Checking interactive sub-components...");
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
console.log("   ✓ All 14 interactive UI IDs verified in DOM");

// 5. Extended Bento sections
console.log("\n5. Checking extended bento sections...");
assert(bentoHtml.includes('id="nlp-studio"'), "NLP Studio section must exist");
assert(bentoHtml.includes('id="shortcuts"'), "Shortcuts Matrix section must exist");
assert(bentoHtml.includes('id="comparison"'), "Comparison table section must exist");
assert(bentoHtml.includes('id="gallery"'), "Visual Gallery section must exist");
console.log("   ✓ NLP Studio, Shortcuts, Comparison, and Gallery sections present");

console.log("\n🎉 ALL SPEC VERIFICATIONS PASSED WITH 100% SUCCESS!");
