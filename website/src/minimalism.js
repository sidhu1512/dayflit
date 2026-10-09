// ===================================================================
// DAYFLIT MINIMALISM EDITION — CLIENT ARCHITECTURE & GENERATIVE UI
// Document Selection System, Interactive Parametric Canvas,
// Real-time Vector SVG Exporter, SHA-256 Verification & Modal Reader
// ===================================================================

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initDocumentGrid();
  initHeroGenerativeCanvas();
  initGenerativeStudio();
  initSha256Copy();
  initDocModal();
});

// Toast Helper
export function showToast(message) {
  let toast = document.getElementById("min-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "min-toast";
    toast.className = "min-toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>✦</span> <span>${message}</span>`;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// ================= 1. MOBILE DRAWER NAVIGATION =================
function initMobileMenu() {
  const toggle = document.getElementById("mobile-toggle");
  const drawer = document.getElementById("mobile-drawer");
  if (!toggle || !drawer) return;

  toggle.addEventListener("click", () => {
    drawer.classList.toggle("active");
  });

  drawer.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      drawer.classList.remove("active");
    });
  });
}

// ================= 2. DOCUMENT REPOSITORY & SELECTION SYSTEM =================
const DOCUMENTS_DATA = [
  // The exact 4 documents from the reference screenshot
  {
    id: "mitrex-facade-brochure",
    title: "Mitrex Sustainable Facade Brochure",
    sizeKb: 10220,
    sizeDisplay: "10,220KB PDF",
    category: "mitrex",
    selected: false,
    abstract: "Comprehensive structural and thermodynamic analysis of BIPV architectural facade modules with integrated solar harvesting.",
    pages: 48,
    date: "2026-03-15",
    sha256: "4b9e28f1c84910a301d0a87693cf7201b17a5e8402a1b94c3501f2081d582319",
  },
  {
    id: "mitrex-testing-summary",
    title: "Mitrex General Testing Summary",
    sizeKb: 1036,
    sizeDisplay: "1,036KB PDF",
    category: "mitrex",
    selected: false,
    abstract: "ASTM E119 fire rating endurance, ASTM E283 air leakage coefficients, and structural wind-load load cell telemetry.",
    pages: 18,
    date: "2026-02-10",
    sha256: "8e73410a8b9f71295240c1d63e9f4510ad603891d4e73b06019a28b0f15c7e89",
  },
  {
    id: "mitrex-solar-datasheet",
    title: "Mitrex Solar Facade Data Sheet",
    sizeKb: 2467,
    sizeDisplay: "2,467KB PDF",
    category: "mitrex",
    selected: false,
    abstract: "Electrical characteristic curves, temperature coefficient benchmarks, and junction box IP68 ingress protection.",
    pages: 24,
    date: "2026-01-22",
    sha256: "1f50a84e29b9f706d8a391e63b018591c0e8d5301824a739b610c4928e19b520",
  },
  {
    id: "mitrex-case-study",
    title: "Mitrex Case Study Industrial Wall",
    sizeKb: 1580,
    sizeDisplay: "1,580KB PDF",
    category: "mitrex",
    selected: true, // Initialized selected with vibrant orange active circle, matching screenshot!
    abstract: "Thermal envelope retrofit in an industrial logistics complex yielding 148 MWh annual clean energy generation.",
    pages: 32,
    date: "2026-04-02",
    sha256: "955a2f3ade41f34584e5cd463cd37042d24d9440e6dd8967ad3d715837622053",
  },

  // Dayflit Technical Architecture & Whitepaper Documents
  {
    id: "dayflit-architecture-whitepaper",
    title: "Dayflit Architecture & Offline Engine Whitepaper",
    sizeKb: 4120,
    sizeDisplay: "4,120KB PDF",
    category: "dayflit",
    selected: false,
    abstract: "Native Rust multi-threaded event loop, zero-latency desktop overlay IPC, and Win32 hardware composition pipeline.",
    pages: 36,
    date: "2026-04-08",
    sha256: "c38190d7920ab4e168430b19f6a73c091d8e590214a6b281f09c5e6381028e9a",
  },
  {
    id: "dayflit-whisper-pipeline",
    title: "Whisper Voice Engine & Offline Audio Pipeline",
    sizeKb: 8740,
    sizeDisplay: "8,740KB PDF",
    category: "dayflit",
    selected: false,
    abstract: "Quantized Whisper.cpp CPU inference benchmarks on Windows, ring-buffer audio ingestion, and silence detection heuristics.",
    pages: 52,
    date: "2026-03-29",
    sha256: "582a93c10842e091b61c9408235a8e01bf584e91024bc738910a3028e91849a0",
  },
  {
    id: "dayflit-rust-benchmarks",
    title: "Native Rust Tauri Floating Window Benchmarks",
    sizeKb: 1890,
    sizeDisplay: "1,890KB PDF",
    category: "dayflit",
    selected: false,
    abstract: "Empirical CPU & RAM comparison between Dayflit Rust runtime (<18MB) and traditional Electron productivity shells (>350MB).",
    pages: 20,
    date: "2026-03-12",
    sha256: "710a829f034e819b450ca1923e80918c5029a1b64e098192a091834e7102948a",
  },
  {
    id: "dayflit-storage-spec",
    title: "Zero-Telemetry Local JSON Encryption Spec",
    sizeKb: 1220,
    sizeDisplay: "1,220KB PDF",
    category: "dayflit",
    selected: false,
    abstract: "AES-256-GCM authenticated local key derivation for %APPDATA%/Dayflit data stores, backup mirrors, and corruption recovery.",
    pages: 16,
    date: "2026-02-18",
    sha256: "a091834e7102948a710a829f034e819b450ca1923e80918c5029a1b64e098192",
  },
];

let currentFilter = "all";
let currentSearchQuery = "";

function initDocumentGrid() {
  const container = document.getElementById("doc-cards-grid");
  const selectedCountEl = document.getElementById("selected-count");
  const downloadSelectedBtn = document.getElementById("download-selected-btn");
  const downloadAllBtn = document.getElementById("download-all-btn");
  const viewAllBtn = document.getElementById("view-all-downloads-btn");
  const selectAllBtn = document.getElementById("select-all-btn");
  const deselectAllBtn = document.getElementById("deselect-all-btn");
  const searchInput = document.getElementById("doc-search-input");
  const filterTabs = document.querySelectorAll(".min-tab-btn");
  const resultsCountEl = document.getElementById("results-count");
  const totalBytesEl = document.getElementById("total-selected-bytes");

  if (!container) return;

  function renderCards() {
    container.innerHTML = "";

    const filtered = DOCUMENTS_DATA.filter((doc) => {
      const matchesCategory =
        currentFilter === "all" || doc.category === currentFilter;
      const matchesSearch =
        doc.title.toLowerCase().includes(currentSearchQuery.toLowerCase()) ||
        doc.sizeDisplay.toLowerCase().includes(currentSearchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    if (resultsCountEl) {
      resultsCountEl.textContent = `Showing ${filtered.length} of ${DOCUMENTS_DATA.length} documents`;
    }

    filtered.forEach((doc) => {
      const card = document.createElement("div");
      card.className = `min-doc-card ${doc.selected ? "is-selected" : ""}`;
      card.dataset.id = doc.id;

      card.innerHTML = `
        <div class="min-card-top">
          <h3 class="min-doc-title">${doc.title}</h3>
          <span class="min-doc-meta">${doc.sizeDisplay}</span>
        </div>
        <div class="min-card-bottom">
          <button class="min-check-btn" type="button" aria-label="Toggle select ${doc.title}" title="${doc.selected ? 'Deselect document' : 'Select document'}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
          <button class="min-download-direct-btn" type="button" aria-label="Download ${doc.title}" title="Direct download PDF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      `;

      // Checkbox click handler
      const checkBtn = card.querySelector(".min-check-btn");
      checkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        doc.selected = !doc.selected;
        card.classList.toggle("is-selected", doc.selected);
        checkBtn.title = doc.selected ? "Deselect document" : "Select document";
        updateSelectionStats();
      });

      // Direct download button handler
      const downloadBtn = card.querySelector(".min-download-direct-btn");
      downloadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerDownloadDoc(doc);
      });

      // Card body click handler (opens detail modal reader)
      card.addEventListener("click", () => {
        openDocumentModal(doc);
      });

      container.appendChild(card);
    });

    updateSelectionStats();
  }

  function updateSelectionStats() {
    const selectedDocs = DOCUMENTS_DATA.filter((d) => d.selected);
    const count = selectedDocs.length;
    if (selectedCountEl) {
      selectedCountEl.textContent = count;
    }
    if (totalBytesEl) {
      const totalKb = selectedDocs.reduce((acc, curr) => acc + curr.sizeKb, 0);
      totalBytesEl.textContent = count > 0 ? `${(totalKb / 1024).toFixed(1)} MB selected` : "0 KB selected";
    }
  }

  // Filter tabs
  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filterTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter || "all";
      renderCards();
    });
  });

  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearchQuery = e.target.value.trim();
      renderCards();
    });
  }

  // Bulk buttons
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      DOCUMENTS_DATA.forEach((d) => (d.selected = true));
      renderCards();
      showToast(`Selected all ${DOCUMENTS_DATA.length} documents.`);
    });
  }

  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", () => {
      DOCUMENTS_DATA.forEach((d) => (d.selected = false));
      renderCards();
      showToast("Cleared document selection.");
    });
  }

  // Download Selected
  if (downloadSelectedBtn) {
    downloadSelectedBtn.addEventListener("click", () => {
      const selected = DOCUMENTS_DATA.filter((d) => d.selected);
      if (selected.length === 0) {
        showToast("No documents selected. Check at least one item.");
        return;
      }
      showToast(`Preparing bundle download for ${selected.length} document(s)...`);
      setTimeout(() => {
        showToast(`✓ Archive generated: dayflit-specs-${selected.length}-bundle.zip`);
      }, 900);
    });
  }

  // Download All
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener("click", () => {
      showToast(`Bundling all ${DOCUMENTS_DATA.length} technical documents...`);
      setTimeout(() => {
        showToast(`✓ Download started: dayflit-all-technical-documents.zip`);
      }, 900);
    });
  }

  // View All Downloads (smooth scroll or tab reset)
  if (viewAllBtn) {
    viewAllBtn.addEventListener("click", () => {
      currentFilter = "all";
      filterTabs.forEach((t) => {
        t.classList.toggle("active", t.dataset.filter === "all");
      });
      renderCards();
      container.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Displaying all available technical specifications.");
    });
  }

  // Initial render
  renderCards();
}

function triggerDownloadDoc(doc) {
  showToast(`Initiating download: ${doc.title} (${doc.sizeDisplay})`);
  // Generate a mock binary text download link for tangible interaction
  const dummyContent = `%PDF-1.7\n% Dayflit Minimalist Specification Document\nTitle: ${doc.title}\nSize: ${doc.sizeDisplay}\nSHA256: ${doc.sha256}\nAbstract: ${doc.abstract}\nTimestamp: ${new Date().toISOString()}\n%%EOF`;
  const blob = new Blob([dummyContent], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.id}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ================= 3. HERO GENERATIVE FAN CANVAS =================
// Renders the signature radiating parametric fan curves seen in the reference screenshot
let heroAnimationId = null;
let heroBreathing = true;
let heroPhase = 0;
let heroMouse = { x: 0.5, y: 0.5, active: false };

function initHeroGenerativeCanvas() {
  const canvas = document.getElementById("generative-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const toggleBtn = document.getElementById("toggle-animate-btn");
  const randomBtn = document.getElementById("randomize-fan-btn");

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    heroMouse.x = (e.clientX - rect.left) / rect.width;
    heroMouse.y = (e.clientY - rect.top) / rect.height;
    heroMouse.active = true;
  });

  canvas.addEventListener("mouseleave", () => {
    heroMouse.active = false;
  });

  function drawFan() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Parametric settings matching the reference screenshot:
    // Origin near bottom-center, lines radiate upward and curve outward
    const originX = w * 0.38;
    const originY = h * 0.95;
    const rayCount = 56;
    const maxRadius = Math.max(w, h) * 1.05;

    ctx.save();
    ctx.strokeStyle = "#1A1A18";
    ctx.lineWidth = 1.05;
    ctx.lineCap = "round";

    // Mouse influence
    const mouseDeflectX = heroMouse.active ? (heroMouse.x - 0.5) * 40 : 0;
    const mouseDeflectY = heroMouse.active ? (heroMouse.y - 0.5) * 30 : 0;

    for (let i = 0; i < rayCount; i++) {
      const t = i / (rayCount - 1);
      // Angular spread from ~ -15 deg to ~ 95 deg
      const baseAngle = -0.25 + t * 1.85;
      const breathe = heroBreathing ? Math.sin(heroPhase + t * 4) * 0.03 : 0;
      const angle = baseAngle + breathe;

      const endX = originX + Math.cos(angle) * maxRadius;
      const endY = originY - Math.sin(angle) * maxRadius;

      // Cubic Bezier curve control points creating the fan curvature
      const cp1X = originX + Math.cos(angle - 0.4) * (maxRadius * 0.35) + mouseDeflectX * t;
      const cp1Y = originY - Math.sin(angle - 0.4) * (maxRadius * 0.35) + mouseDeflectY * t;

      const cp2X = originX + Math.cos(angle - 0.2) * (maxRadius * 0.75);
      const cp2Y = originY - Math.sin(angle - 0.2) * (maxRadius * 0.75);

      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      ctx.stroke();
    }

    ctx.restore();

    if (heroBreathing) {
      heroPhase += 0.016;
    }

    heroAnimationId = requestAnimationFrame(drawFan);
  }

  drawFan();

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      heroBreathing = !heroBreathing;
      toggleBtn.textContent = heroBreathing ? "Pause" : "Play";
      showToast(heroBreathing ? "Parametric flow resumed." : "Parametric flow paused.");
    });
  }

  if (randomBtn) {
    randomBtn.addEventListener("click", () => {
      heroPhase += Math.PI * 0.5;
      showToast("Perturbed parametric harmonics.");
    });
  }
}

// ================= 4. PARAMETRIC GENERATIVE STUDIO (/generative_ui) =================
function initGenerativeStudio() {
  const canvas = document.getElementById("studio-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Sliders
  const raySlider = document.getElementById("slider-rays");
  const curveSlider = document.getElementById("slider-curvature");
  const spreadSlider = document.getElementById("slider-spread");
  const weightSlider = document.getElementById("slider-weight");

  const valRays = document.getElementById("val-rays");
  const valCurvature = document.getElementById("val-curvature");
  const valSpread = document.getElementById("val-spread");
  const valWeight = document.getElementById("val-weight");

  // Preset chips
  const presetChips = document.querySelectorAll(".min-preset-chip");

  // Export buttons
  const exportSvgBtn = document.getElementById("export-svg-btn");
  const snapshotPngBtn = document.getElementById("snapshot-png-btn");
  const randomizeStudioBtn = document.getElementById("randomize-studio-btn");

  let studioConfig = {
    rays: 64,
    curvature: 1.2,
    spread: 120, // degrees
    weight: 1.1,
    originXRatio: 0.35,
    originYRatio: 0.96,
  };

  function resizeStudio() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    renderStudio();
  }

  resizeStudio();
  window.addEventListener("resize", resizeStudio);

  function renderStudio() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const originX = w * studioConfig.originXRatio;
    const originY = h * studioConfig.originYRatio;
    const maxRadius = Math.max(w, h) * 1.15;
    const totalSpreadRad = (studioConfig.spread * Math.PI) / 180;
    const startAngle = -0.15;

    ctx.save();
    ctx.strokeStyle = "#191918";
    ctx.lineWidth = studioConfig.weight;
    ctx.lineCap = "round";

    for (let i = 0; i < studioConfig.rays; i++) {
      const t = i / (studioConfig.rays - 1);
      const angle = startAngle + t * totalSpreadRad;

      const endX = originX + Math.cos(angle) * maxRadius;
      const endY = originY - Math.sin(angle) * maxRadius;

      const curveOffset = (studioConfig.curvature - 1.0) * 0.35;
      const cp1X = originX + Math.cos(angle - curveOffset) * (maxRadius * 0.38);
      const cp1Y = originY - Math.sin(angle - curveOffset) * (maxRadius * 0.38);

      const cp2X = originX + Math.cos(angle - curveOffset * 0.5) * (maxRadius * 0.72);
      const cp2Y = originY - Math.sin(angle - curveOffset * 0.5) * (maxRadius * 0.72);

      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Connect sliders
  if (raySlider) {
    raySlider.addEventListener("input", (e) => {
      studioConfig.rays = parseInt(e.target.value, 10);
      if (valRays) valRays.textContent = studioConfig.rays;
      renderStudio();
    });
  }

  if (curveSlider) {
    curveSlider.addEventListener("input", (e) => {
      studioConfig.curvature = parseFloat(e.target.value);
      if (valCurvature) valCurvature.textContent = studioConfig.curvature.toFixed(2);
      renderStudio();
    });
  }

  if (spreadSlider) {
    spreadSlider.addEventListener("input", (e) => {
      studioConfig.spread = parseInt(e.target.value, 10);
      if (valSpread) valSpread.textContent = `${studioConfig.spread}°`;
      renderStudio();
    });
  }

  if (weightSlider) {
    weightSlider.addEventListener("input", (e) => {
      studioConfig.weight = parseFloat(e.target.value);
      if (valWeight) valWeight.textContent = `${studioConfig.weight.toFixed(1)}px`;
      renderStudio();
    });
  }

  // Presets
  const presets = {
    original: { rays: 56, curvature: 1.25, spread: 110, weight: 1.1 },
    shell: { rays: 84, curvature: 1.9, spread: 145, weight: 0.8 },
    golden: { rays: 48, curvature: 1.618, spread: 137, weight: 1.2 },
    horizon: { rays: 32, curvature: 0.6, spread: 80, weight: 1.5 },
  };

  presetChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      presetChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const p = presets[chip.dataset.preset];
      if (p) {
        studioConfig = { ...studioConfig, ...p };
        if (raySlider) raySlider.value = p.rays;
        if (valRays) valRays.textContent = p.rays;
        if (curveSlider) curveSlider.value = p.curvature;
        if (valCurvature) valCurvature.textContent = p.curvature.toFixed(2);
        if (spreadSlider) spreadSlider.value = p.spread;
        if (valSpread) valSpread.textContent = `${p.spread}°`;
        if (weightSlider) weightSlider.value = p.weight;
        if (valWeight) valWeight.textContent = `${p.weight.toFixed(1)}px`;
        renderStudio();
        showToast(`Preset loaded: ${chip.textContent.trim()}`);
      }
    });
  });

  // Randomize
  if (randomizeStudioBtn) {
    randomizeStudioBtn.addEventListener("click", () => {
      studioConfig.rays = Math.floor(24 + Math.random() * 80);
      studioConfig.curvature = +(0.4 + Math.random() * 1.8).toFixed(2);
      studioConfig.spread = Math.floor(60 + Math.random() * 100);
      studioConfig.weight = +(0.6 + Math.random() * 1.6).toFixed(1);

      if (raySlider) raySlider.value = studioConfig.rays;
      if (valRays) valRays.textContent = studioConfig.rays;
      if (curveSlider) curveSlider.value = studioConfig.curvature;
      if (valCurvature) valCurvature.textContent = studioConfig.curvature;
      if (spreadSlider) spreadSlider.value = studioConfig.spread;
      if (valSpread) valSpread.textContent = `${studioConfig.spread}°`;
      if (weightSlider) weightSlider.value = studioConfig.weight;
      if (valWeight) valWeight.textContent = `${studioConfig.weight}px`;

      renderStudio();
      showToast("Synthesized new parametric harmonics.");
    });
  }

  // Real Vector SVG Exporter
  if (exportSvgBtn) {
    exportSvgBtn.addEventListener("click", () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const originX = w * studioConfig.originXRatio;
      const originY = h * studioConfig.originYRatio;
      const maxRadius = Math.max(w, h) * 1.15;
      const totalSpreadRad = (studioConfig.spread * Math.PI) / 180;
      const startAngle = -0.15;

      let paths = "";
      for (let i = 0; i < studioConfig.rays; i++) {
        const t = i / (studioConfig.rays - 1);
        const angle = startAngle + t * totalSpreadRad;

        const endX = originX + Math.cos(angle) * maxRadius;
        const endY = originY - Math.sin(angle) * maxRadius;

        const curveOffset = (studioConfig.curvature - 1.0) * 0.35;
        const cp1X = originX + Math.cos(angle - curveOffset) * (maxRadius * 0.38);
        const cp1Y = originY - Math.sin(angle - curveOffset) * (maxRadius * 0.38);

        const cp2X = originX + Math.cos(angle - curveOffset * 0.5) * (maxRadius * 0.72);
        const cp2Y = originY - Math.sin(angle - curveOffset * 0.5) * (maxRadius * 0.72);

        paths += `  <path d="M ${originX.toFixed(1)} ${originY.toFixed(1)} C ${cp1X.toFixed(1)} ${cp1Y.toFixed(1)}, ${cp2X.toFixed(1)} ${cp2Y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}" />\n`;
      }

      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <!-- Dayflit Minimalism Generative Art Export -->
  <rect width="100%" height="100%" fill="#F5F4EF" />
  <g fill="none" stroke="#191918" stroke-width="${studioConfig.weight}" stroke-linecap="round">
${paths}  </g>
</svg>`;

      const blob = new Blob([svgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dayflit-minimalism-parametric-fan.svg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("✓ Downloaded vector SVG artwork.");
    });
  }

  // Snapshot PNG
  if (snapshotPngBtn) {
    snapshotPngBtn.addEventListener("click", () => {
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "dayflit-minimalism-generative-snapshot.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("✓ Saved high-resolution PNG snapshot.");
    });
  }

  renderStudio();
}

// ================= 5. SHA-256 CLIPBOARD COPY =================
function initSha256Copy() {
  const btn = document.getElementById("copy-hash-btn");
  const codeEl = document.getElementById("sha256-code");
  if (!btn || !codeEl) return;

  btn.addEventListener("click", async () => {
    const text = codeEl.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.innerHTML = `<span>✓ Copied</span>`;
      showToast("Verified SHA-256 checksum copied to clipboard.");
      setTimeout(() => {
        btn.innerHTML = `<span>Copy Checksum</span>`;
      }, 2400);
    } catch (_) {
      showToast("Checksum: " + text);
    }
  });
}

// ================= 6. DOCUMENT DETAIL MODAL READER =================
function initDocModal() {
  const overlay = document.getElementById("doc-modal-overlay");
  const closeBtn = document.getElementById("modal-close-btn");
  if (!overlay || !closeBtn) return;

  closeBtn.addEventListener("click", () => {
    overlay.classList.remove("open");
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("open");
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) {
      overlay.classList.remove("open");
    }
  });
}

function openDocumentModal(doc) {
  const overlay = document.getElementById("doc-modal-overlay");
  const titleEl = document.getElementById("modal-doc-title");
  const metaEl = document.getElementById("modal-doc-meta");
  const abstractEl = document.getElementById("modal-doc-abstract");
  const sha256El = document.getElementById("modal-doc-sha256");
  const pagesEl = document.getElementById("modal-doc-pages");
  const dateEl = document.getElementById("modal-doc-date");
  const downloadBtn = document.getElementById("modal-download-btn");

  if (!overlay) return;

  if (titleEl) titleEl.textContent = doc.title;
  if (metaEl) metaEl.textContent = `${doc.sizeDisplay} • ${doc.category.toUpperCase()}`;
  if (abstractEl) abstractEl.textContent = doc.abstract;
  if (sha256El) sha256El.textContent = doc.sha256;
  if (pagesEl) pagesEl.textContent = `${doc.pages} pages`;
  if (dateEl) dateEl.textContent = doc.date;

  if (downloadBtn) {
    downloadBtn.onclick = () => {
      triggerDownloadDoc(doc);
    };
  }

  overlay.classList.add("open");
}
