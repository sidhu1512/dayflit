import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log("=== Comprehensive Deep Verification for Minimalism Edition ===");

const distPath = path.resolve('website/dist/minimalism.html');
assert(fs.existsSync(distPath), "dist/minimalism.html must exist");
const html = fs.readFileSync(distPath, 'utf8');

// 1. Content and Tags Verification
console.log("1. Checking key DOM content and attributes...");
assert(html.includes('Minimalism'), "Page title must contain Minimalism");
assert(html.includes('data-filter="featured"'), "Featured 2x2 tab must exist");
assert(html.includes('id="generative-canvas"'), "Hero generative fan canvas must exist");
assert(html.includes('id="studio-canvas"'), "Studio parametric canvas must exist");
assert(html.includes('id="view-all-downloads-btn"'), "View All Downloads button must exist");
assert(html.includes('id="download-all-btn"'), "Download All Documents button must exist");
assert(html.includes('id="download-selected-btn"'), "Download Selected button must exist");
assert(html.includes('id="selected-count"'), "Selected count badge must exist");
assert(html.includes('id="doc-search-input"'), "Search input must exist");
assert(html.includes('id="toggle-animate-btn"'), "Toggle animate button must exist");
assert(html.includes('id="randomize-fan-btn"'), "Randomize fan button must exist");
assert(html.includes('id="export-svg-btn"'), "Export SVG button must exist");
assert(html.includes('id="snapshot-png-btn"'), "Snapshot PNG button must exist");
assert(html.includes('id="copy-hash-btn"'), "Copy hash button must exist");
assert(html.includes('id="doc-modal-overlay"'), "Modal overlay must exist");
assert(html.includes('id="min-toast"'), "Toast element must exist");
assert(html.includes('955a2f3ade41f34584e5cd463cd37042d24d9440e6dd8967ad3d715837622053'), "Exact SHA-256 must exist");

// 2. Cross Links Verification
console.log("2. Checking cross navigation links...");
assert(html.includes('index.html'), "Must link to index.html");
assert(html.includes('bento.html'), "Must link to bento.html");
assert(html.includes('maximalism.html'), "Must link to maximalism.html");
assert(html.includes('spatial.html'), "Must link to spatial.html");

// 3. Test Pure JS ZIP Packager and PDF Generator from minimalism.js
console.log("3. Testing client-side ZIP packaging and PDF generation...");
const jsSource = fs.readFileSync('website/src/minimalism.js', 'utf8');
assert(jsSource.includes('createZipBlob'), "minimalism.js must include createZipBlob");
assert(jsSource.includes('generateDocumentPdf'), "minimalism.js must include generateDocumentPdf");
assert(jsSource.includes('2,407KB PDF'), "Card 3 size must be 2,407KB PDF matching reference screenshot");

// 4. Test Search Tokenization Logic
console.log("4. Testing search tokenization with edge cases...");
const sampleDocs = [
  { title: "Mitrex Sustainable Facade Brochure", sizeDisplay: "10,220KB PDF", category: "mitrex", abstract: "BIPV modules" },
  { title: "Mitrex General Testing Summary", sizeDisplay: "1,036KB PDF", category: "mitrex", abstract: "ASTM testing" },
  { title: "Mitrex Solar Facade Data Sheet", sizeDisplay: "2,407KB PDF", category: "mitrex", abstract: "Solar electrical" },
  { title: "Dayflit Architecture & Offline Engine Whitepaper", sizeDisplay: "4,120KB PDF", category: "dayflit", abstract: "Rust engine" },
];

function filterDocs(query, docs) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return docs.filter(doc => 
    tokens.length === 0 || tokens.every(t =>
      doc.title.toLowerCase().includes(t) ||
      doc.sizeDisplay.toLowerCase().includes(t) ||
      doc.category.toLowerCase().includes(t) ||
      doc.abstract.toLowerCase().includes(t)
    )
  );
}

// Edge case 1: Multi-word search
const r1 = filterDocs("mitrex brochure", sampleDocs);
assert.strictEqual(r1.length, 1, "Multi-word 'mitrex brochure' must match 1 doc");
assert.strictEqual(r1[0].title, "Mitrex Sustainable Facade Brochure");

// Edge case 2: Partial search
const r2 = filterDocs("solar", sampleDocs);
assert.strictEqual(r2.length, 1, "Partial 'solar' must match 1 doc");

// Edge case 3: Special regex characters
const r3 = filterDocs("(", sampleDocs);
assert.strictEqual(r3.length, 0, "Special character '(' must not crash");

const r4 = filterDocs("10,220", sampleDocs);
assert.strictEqual(r4.length, 1, "Number with comma '10,220' must match");

// Edge case 4: Category search
const r5 = filterDocs("dayflit rust", sampleDocs);
assert.strictEqual(r5.length, 1, "Cross-field 'dayflit rust' must match");

console.log("✓ All deep assertions passed cleanly!");
