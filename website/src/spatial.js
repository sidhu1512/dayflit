// ===================================================================
// DAYFLIT SPATIAL UI EDITION — JAVASCRIPT & MICRO-INTERACTIONS
// VisionOS 3D Mouse Parallax, Live Audio Synthesizer,
// Dynamic Organ & Telemetry Switcher, Live NLP Parser Studio,
// SHA-256 Copy & Lightbox Modal
// ===================================================================

import { SITE } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initSpatialParallax();
  initModeToggle();
  initOrganSelector();
  initWebAudio();
  initNlpStudio();
  initSha256Copy();
  initGalleryLightbox();
  injectVersionAndConfig();
});

// Toast Helper
function showToast(message) {
  let toast = document.getElementById("spatial-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "spatial-toast";
    toast.className = "spatial-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// 1. Mobile Drawer
function initMobileMenu() {
  const toggle = document.getElementById("mobile-toggle");
  const drawer = document.getElementById("spatial-mobile-drawer");
  if (!toggle || !drawer) return;

  toggle.addEventListener("click", () => {
    drawer.classList.toggle("open");
  });

  drawer.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      drawer.classList.remove("open");
    });
  });
}

// 2. 3D Mouse Parallax Tilt for Spatial Window
function initSpatialParallax() {
  const windowEl = document.getElementById("master-spatial-window");
  if (!windowEl) return;

  const container = windowEl.closest(".spatial-showcase-container");
  if (!container) return;

  container.addEventListener("mousemove", (e) => {
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    const rotY = dx * 6; // max 6 degrees
    const rotX = -dy * 5; // max 5 degrees

    windowEl.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(8px)`;
  });

  container.addEventListener("mouseleave", () => {
    windowEl.style.transform = "rotateX(0deg) rotateY(0deg) translateZ(0px)";
  });
}

// 3. Audio Synthesizer (Web Audio API)
let audioCtx = null;
let soundEnabled = true;

function playSpatialClick() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, audioCtx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  } catch (e) {}
}

function initWebAudio() {
  document.querySelectorAll("[data-sound='click']").forEach(btn => {
    btn.addEventListener("click", () => playSpatialClick());
  });
}

// 4. Dual-Mode Switcher: Dayflit Productivity Hub vs Spatial Health Telemetry
function initModeToggle() {
  const prodBtn = document.getElementById("mode-productivity");
  const healthBtn = document.getElementById("mode-health");
  const prodView = document.getElementById("view-productivity");
  const healthView = document.getElementById("view-health");

  if (!prodBtn || !healthBtn || !prodView || !healthView) return;

  prodBtn.addEventListener("click", () => {
    playSpatialClick();
    prodBtn.classList.add("active");
    healthBtn.classList.remove("active");
    prodView.style.display = "block";
    healthView.style.display = "none";
  });

  healthBtn.addEventListener("click", () => {
    playSpatialClick();
    healthBtn.classList.add("active");
    prodBtn.classList.remove("active");
    healthView.style.display = "block";
    prodView.style.display = "none";
  });
}

// 5. Interactive Organ & Bio Telemetry Selector
const organModels = {
  heart: {
    name: "My Heart",
    status: "Heart Synchronized (120 bpm)",
    val: "120 bpm",
    svg: `<svg viewBox="0 0 200 200" width="160" height="160" fill="none">
      <path d="M75 35 C70 25, 80 15, 95 18 C105 20, 108 30, 105 45 Z" fill="#0284c7" />
      <path d="M92 40 C90 15, 125 10, 135 30 C140 45, 130 65, 115 65 C100 65, 95 50, 92 40 Z" fill="#e11d48" />
      <path d="M70 70 C40 85, 45 130, 85 170 C98 182, 105 185, 115 178 C155 145, 165 95, 135 70 C120 58, 90 55, 70 70 Z" fill="#ff4b5c" />
      <path d="M95 72 Q105 110, 88 150 M102 98 Q125 118, 128 145" stroke="#fda4af" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`
  },
  liver: {
    name: "Liver",
    status: "Metabolic Function Optimal (98%)",
    val: "98%",
    svg: `<svg viewBox="0 0 200 200" width="160" height="160" fill="none">
      <path d="M30 60 C40 30, 160 25, 175 75 C185 110, 135 150, 70 140 C35 135, 20 95, 30 60 Z" fill="#d97706" />
      <path d="M45 65 C60 40, 140 38, 155 80" stroke="#fef08a" stroke-width="3" stroke-linecap="round"/>
    </svg>`
  },
  kidneys: {
    name: "Kidneys",
    status: "Filtration GFR 99 mL/min",
    val: "99 mL",
    svg: `<svg viewBox="0 0 200 200" width="160" height="160" fill="none">
      <path d="M50 40 C20 60, 25 130, 60 140 C80 145, 90 120, 75 90 C65 75, 75 50, 50 40 Z" fill="#b91c1c" />
      <path d="M150 40 C180 60, 175 130, 140 140 C120 145, 110 120, 125 90 C135 75, 125 50, 150 40 Z" fill="#b91c1c" />
    </svg>`
  },
  brain: {
    name: "Brain",
    status: "Alpha Synchrony 10.2 Hz (Focus)",
    val: "10.2 Hz",
    svg: `<svg viewBox="0 0 200 200" width="160" height="160" fill="none">
      <path d="M60 40 C30 50, 25 120, 60 145 C80 150, 95 125, 95 50 Z" fill="#db2777" />
      <path d="M140 40 C170 50, 175 120, 140 145 C120 150, 105 125, 105 50 Z" fill="#db2777" />
    </svg>`
  }
};

function initOrganSelector() {
  const cards = document.querySelectorAll("[data-organ]");
  const chamber = document.getElementById("master-organ-display");
  const statusPill = document.getElementById("organ-status-badge");

  cards.forEach(card => {
    card.addEventListener("click", () => {
      playSpatialClick();
      cards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");

      const key = card.getAttribute("data-organ");
      const model = organModels[key];
      if (model && chamber) {
        chamber.innerHTML = model.svg;
        if (statusPill) statusPill.textContent = model.status;
      }
    });
  });
}

// 6. Live NLP Parser Studio
function initNlpStudio() {
  const input = document.getElementById("nlp-studio-input");
  const parsedTitle = document.getElementById("parsed-title");
  const parsedDate = document.getElementById("parsed-date");
  const parsedTime = document.getElementById("parsed-time");
  const parsedPriority = document.getElementById("parsed-priority");
  const parsedTag = document.getElementById("parsed-tag");

  if (!input) return;

  function parseQuery(text) {
    if (!text.trim()) {
      if (parsedTitle) parsedTitle.textContent = "Type natural language above...";
      return;
    }

    let title = text;
    let date = "Today";
    let time = "No time set";
    let priority = "Normal (P3)";
    let tag = "inbox";

    // Detect priority e.g. p1, !urgent
    if (/(\bp1\b|!urgent|high)/i.test(title)) {
      priority = "🔥 Urgent (P1)";
      title = title.replace(/(\bp1\b|!urgent|high)/gi, "").trim();
    } else if (/(\bp2\b|medium)/i.test(title)) {
      priority = "⚡ Medium (P2)";
      title = title.replace(/(\bp2\b|medium)/gi, "").trim();
    }

    // Detect date e.g. tomorrow, friday
    if (/\btomorrow\b/i.test(title)) {
      date = "Tomorrow";
      title = title.replace(/\btomorrow\b/gi, "").trim();
    } else if (/\bfriday\b/i.test(title)) {
      date = "This Friday";
      title = title.replace(/\bfriday\b/gi, "").trim();
    } else if (/\bmonday\b/i.test(title)) {
      date = "Next Monday";
      title = title.replace(/\bmonday\b/gi, "").trim();
    }

    // Detect time e.g. at 4pm, 10:30am
    const timeMatch = title.match(/\b(at\s+)?(\d{1,2}(:\d{2})?\s*(am|pm))\b/i);
    if (timeMatch) {
      time = timeMatch[2].toUpperCase();
      title = title.replace(timeMatch[0], "").trim();
    }

    // Detect tags #work, #health
    const tagMatch = title.match(/#(\w+)/);
    if (tagMatch) {
      tag = tagMatch[1];
      title = title.replace(tagMatch[0], "").trim();
    }

    if (parsedTitle) parsedTitle.textContent = title || "Task captured";
    if (parsedDate) parsedDate.textContent = `📅 ${date}`;
    if (parsedTime) parsedTime.textContent = `⏰ ${time}`;
    if (parsedPriority) parsedPriority.textContent = priority;
    if (parsedTag) parsedTag.textContent = `#${tag}`;
  }

  input.addEventListener("input", (e) => {
    parseQuery(e.target.value);
  });

  if (input.value) {
    parseQuery(input.value);
  }
}

// 7. Copy SHA-256 Checksum
function initSha256Copy() {
  const btn = document.getElementById("btn-copy-sha256");
  if (!btn) return;

  btn.addEventListener("click", () => {
    playSpatialClick();
    const sha = SITE.sha256;
    navigator.clipboard.writeText(sha).then(() => {
      showToast("✓ SHA-256 copied to clipboard!");
      const originalText = btn.textContent;
      btn.textContent = "✓ Copied!";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }).catch(() => {
      showToast("SHA-256: " + sha);
    });
  });
}

// 8. Gallery Lightbox Modal
function initGalleryLightbox() {
  const modal = document.getElementById("spatial-lightbox");
  const modalImg = document.getElementById("lightbox-img");
  const closeBtn = document.getElementById("lightbox-close");
  const items = document.querySelectorAll("[data-gallery-src]");

  if (!modal || !modalImg) return;

  items.forEach(item => {
    item.addEventListener("click", () => {
      playSpatialClick();
      const src = item.getAttribute("data-gallery-src");
      modalImg.src = src;
      modal.classList.add("open");
    });
  });

  const closeModal = () => modal.classList.remove("open");

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Inject Config Links & Checksums
function injectVersionAndConfig() {
  document.querySelectorAll("[data-version]").forEach(el => {
    el.textContent = SITE.version;
  });

  document.querySelectorAll("[data-download-url]").forEach(el => {
    el.href = SITE.downloadUrl;
  });

  const shaEl = document.getElementById("sha256-display");
  if (shaEl) {
    shaEl.textContent = SITE.sha256;
  }
}
