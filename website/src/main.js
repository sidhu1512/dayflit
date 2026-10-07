import { SITE } from "./config.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ==========================================
// 1. CONFIG & METADATA BINDINGS
// ==========================================
$$("[data-version]").forEach((e) => (e.textContent = SITE.version));
$$("[data-size]").forEach((e) => (e.textContent = SITE.installerSize));
$$("[data-year]").forEach((e) => (e.textContent = String(new Date().getFullYear())));
if (SITE.sha256) $$("[data-sha]").forEach((e) => (e.textContent = SITE.sha256));
if (SITE.releaseDate) $$("[data-date]").forEach((e) => (e.textContent = SITE.releaseDate));

const link = (attr, url) =>
  $$(`[${attr}]`).forEach((a) => {
    if (url) {
      a.href = url;
      a.removeAttribute("aria-disabled");
    } else {
      a.setAttribute("aria-disabled", "true");
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        toast("Feature coming in next build");
      });
    }
  });

link("data-download", SITE.downloadUrl);
link("data-releases", SITE.releasesUrl);
link("data-beta", SITE.betaUrl);
link("data-docs", SITE.docsUrl);
link("data-support", SITE.supportUrl);
link("data-contact", SITE.contactUrl);
link("data-privacy", SITE.privacyUrl);
link("data-source", SITE.sourceUrl);

// Toast notification helper
export function toast(msg) {
  let t = $(".site-toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "site-toast";
    document.body.appendChild(t);
  }
  t.innerHTML = `<span style="color:var(--accent);">⚡</span><span>${msg}</span>`;
  t.classList.add("on");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("on"), 2400);
}

// ==========================================
// 2. SPOTLIGHT CARDS DYNAMIC CURSOR GLOW
// ==========================================
function initSpotlights() {
  const cards = $$(".spotlight-card");
  if (!cards.length) return;

  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);
    });
  });
}
initSpotlights();

// ==========================================
// 3. MOBILE NAVIGATION & HEADER SHADOW
// ==========================================
const menuBtn = $(".menu-btn");
const mobileNav = $("#mobile-nav");
menuBtn?.addEventListener("click", () => {
  const open = mobileNav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.classList.toggle("open", open);
});
$$("#mobile-nav a").forEach((a) =>
  a.addEventListener("click", () => {
    mobileNav.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.classList.remove("open");
  })
);

const topHeader = $(".top");
window.addEventListener(
  "scroll",
  () => topHeader?.classList.toggle("scrolled", window.scrollY > 12),
  { passive: true }
);

// Scroll reveal observer
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.08 }
);
$$(".reveal").forEach((el) => (reduce ? el.classList.add("in") : io.observe(el)));

// ==========================================
// 4. HERO TYPING SIMULATION & TIMER
// ==========================================
const phrases = [
  { text: "Call Sam tomorrow 3pm #work !high", chips: ["Tomorrow · 3 PM", "high", "#work"], add: "Call Sam" },
  { text: "Deploy API release every 1st !urgent", chips: ["Monthly on 1st", "urgent", "#dev"], add: "Deploy API release" },
  { text: "Review quarterly roadmap for 45m next monday", chips: ["Next Monday", "45m", "#strategy"], add: "Review quarterly roadmap" },
  { text: "Submit taxes by Friday #finance !important", chips: ["Friday 5 PM", "important"], add: "Submit taxes" },
];
const typed = $("#fw-typed");
const chips = $("#fw-chips");
const list = $("#fw-list");
const count = $("#fw-count");

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function typeLoop() {
  if (reduce || !typed) return;
  let i = 0;
  for (;;) {
    const p = phrases[i % phrases.length];
    typed.textContent = "";
    chips.innerHTML = "";
    for (const ch of p.text) {
      typed.textContent += ch;
      if (typed.textContent.length === Math.floor(p.text.length * 0.55)) {
        chips.innerHTML = p.chips.slice(0, 1).map((c) => `<span>${c}</span>`).join("");
      }
      await wait(35 + Math.random() * 35);
    }
    chips.innerHTML = p.chips.map((c) => `<span>${c}</span>`).join("");
    await wait(800);

    const li = document.createElement("li");
    li.innerHTML = `<span class="fw-check"></span><span>${p.add}</span><em>${p.chips[0]}</em>`;
    li.classList.add("new");
    list.prepend(li);
    if (count) count.textContent = String(list.children.length);

    typed.textContent = "";
    chips.innerHTML = "";
    await wait(1800);
    if (list.children.length > 4) list.lastElementChild.remove();
    if (count) count.textContent = String(list.children.length);
    i++;
    await wait(500);
  }
}
typeLoop();

// Hero timer countdown
const fwTimer = $("#fw-timer");
const pipTime = $("#pip-time");
let secs = 25 * 60;
setInterval(() => {
  if (reduce) return;
  secs = secs <= 0 ? 25 * 60 : secs - 1;
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  const t = `${m}:${s}`;
  if (fwTimer) fwTimer.textContent = t;
  if (pipTime) pipTime.textContent = t;
}, 1000);

// Live Date in Hero
const liveDateEl = $("#fw-live-date");
if (liveDateEl) {
  const d = new Date();
  const dayName = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthName = d.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  liveDateEl.textContent = `${dayName}, ${d.getDate()} ${monthName}`;
}

// Bento voice bars animation
const bentoVoiceBars = $$("#bento-voice-bars i");
if (bentoVoiceBars.length) {
  setInterval(() => {
    if (!reduce) {
      bentoVoiceBars.forEach((bar) => {
        bar.style.height = `${15 + Math.random() * 80}%`;
      });
    }
  }, 100);
}

// ==========================================
// 5. INTERACTIVE PRODUCT TOUR
// ==========================================
const tourSteps = [
  {
    step: "01. Capture",
    badge: "Step 1 of 5 · Global Summon",
    heading: "Fuzzy Global Command Palette",
    desc: "Press <kbd>Alt</kbd><kbd>Space</kbd> from any application or full-screen game. Type natural language commands to capture tasks, search across your notes, jump to calendar events, or check your clipboard history instantly.",
    checks: [
      "Instant global summon with zero perceptible startup latency",
      "Fuzzy search across open tasks, archives, and Markdown notes",
      "Full keyboard navigation: arrow keys, Enter to execute, Esc to dismiss",
    ],
    shot: "palette",
    hotspot: "⚡ Alt+Space Everywhere",
  },
  {
    step: "02. Voice",
    badge: "Step 2 of 5 · Whisper AI",
    heading: "Offline Whisper Voice Dictation",
    desc: "Hold <kbd>Alt</kbd><kbd>Shift</kbd><kbd>V</kbd> while gaming, coding, or reading. Speak your mind freely. High-speed local Whisper models transcribe your voice directly into structured tasks or journal memos with zero cloud latency.",
    checks: [
      "100% Offline execution on your local CPU or GPU",
      "Automatic punctuation, grammar formatting, and date tagging",
      "Keep original audio WAV attachments whenever you wish",
    ],
    shot: "voice-recording",
    hotspot: "🎙 Offline Whisper Running",
  },
  {
    step: "03. Focus",
    badge: "Step 3 of 5 · Pomodoro & Music",
    heading: "Deep Work Sessions with Native Spotify Control",
    desc: "Press <kbd>Alt</kbd><kbd>Shift</kbd><kbd>Space</kbd> to launch a Pomodoro focus block. Dayflit automatically queues your Spotify playlist, dims distractions, and floats a compact picture-in-picture timer over your IDE or documents.",
    checks: [
      "Windows Media Integration: Auto-pauses music on breaks",
      "Smart presence detection: pauses timer when Windows locks",
      "Distraction nudges when social tabs or games steal focus",
    ],
    shot: "focus-running",
    hotspot: "🎵 Spotify Linked · 25:00",
  },
  {
    step: "04. Timebox",
    badge: "Step 4 of 5 · Timeline Engine",
    heading: "Visual Calendar Timeboxing & One-Click Join",
    desc: "Press <kbd>Alt</kbd><kbd>Shift</kbd><kbd>T</kbd> to inspect your day timeline. Drag tasks into free calendar slots to commit to exact time blocks. Dayflit detects Google Meet, Zoom, and Microsoft Teams links and opens them with one click.",
    checks: [
      "Two-way synchronization with Google Calendar & Microsoft 365",
      "One-click 'Join Meeting' button for Zoom, Teams, Meet",
      "Instant 'Copy Free Slots' to share availability in emails",
    ],
    shot: "calendar",
    hotspot: "📅 Two-Way Sync Active",
  },
  {
    step: "05. Journal",
    badge: "Step 5 of 5 · Quantified Mind",
    heading: "Encrypted Journal & Habit Consistency Matrix",
    desc: "Press <kbd>Alt</kbd><kbd>Shift</kbd><kbd>N</kbd> for quick note reflection. Daily prompts, mood logs, habit streak trackers, and year-long consistency heatmaps keep your thoughts organized and exportable to Obsidian Markdown.",
    checks: [
      "PIN security lock with auto-lock on idle timer",
      "Quantified consistency heatmap inspired by GitHub contributions",
      "Direct export to Obsidian Vault with full YAML metadata",
    ],
    shot: "journal",
    hotspot: "🔒 PIN-Protected Local Vault",
  },
];

let currentTourIdx = 0;
let tourAutoplay = true;
let tourTimer = null;

function getCurrentTheme() {
  const activeBtn = $("[data-theme-pick].on");
  return activeBtn ? activeBtn.dataset.themePick : "dark";
}

function renderTourStep(idx) {
  currentTourIdx = idx;
  const data = tourSteps[idx];
  if (!data) return;

  const mode = getCurrentTheme();
  const badge = $("#tour-badge");
  const heading = $("#tour-heading");
  const desc = $("#tour-description");
  const checks = $("#tour-checks");
  const img = $("#tour-image");
  const hotspot = $("#tour-hotspot");

  if (badge) badge.textContent = data.badge;
  if (heading) heading.textContent = data.heading;
  if (desc) desc.innerHTML = data.desc;
  if (checks) {
    checks.innerHTML = data.checks.map((c) => `<li>${c}</li>`).join("");
  }
  if (img) {
    // Map shot path
    const shotName = data.shot.includes("voice") || data.shot.includes("bubble")
      ? `${data.shot}.png`
      : `${data.shot}-${mode}.png`;
    img.src = `./shots/${shotName}`;
    img.alt = data.heading;
  }
  if (hotspot) hotspot.textContent = data.hotspot;

  // Update tabs
  $$(".tour-tab").forEach((tab, i) => {
    const isActive = i === idx;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}

function startTourAutoplay() {
  if (reduce) return;
  clearInterval(tourTimer);
  tourTimer = setInterval(() => {
    if (!tourAutoplay) return;
    const next = (currentTourIdx + 1) % tourSteps.length;
    renderTourStep(next);
  }, 4800);
}

$$(".tour-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const idx = parseInt(tab.dataset.tourStep, 10);
    renderTourStep(idx);
    // Pause autoplay on manual tab selection
    tourAutoplay = false;
    updateTourPlayBtn();
  });
});

const tourPlayBtn = $("#tour-autoplay-btn");
const tourPlayIcon = $("#tour-play-icon");
const tourPlayText = $("#tour-play-text");

function updateTourPlayBtn() {
  if (!tourPlayBtn) return;
  if (tourAutoplay) {
    if (tourPlayIcon) tourPlayIcon.textContent = "⏸";
    if (tourPlayText) tourPlayText.textContent = "Pause Tour";
  } else {
    if (tourPlayIcon) tourPlayIcon.textContent = "▶";
    if (tourPlayText) tourPlayText.textContent = "Play Tour";
  }
}

tourPlayBtn?.addEventListener("click", () => {
  tourAutoplay = !tourAutoplay;
  updateTourPlayBtn();
  if (tourAutoplay) startTourAutoplay();
});

$("#tour-next-btn")?.addEventListener("click", () => {
  const next = (currentTourIdx + 1) % tourSteps.length;
  renderTourStep(next);
});

startTourAutoplay();

// ==========================================
// 6. INTERACTIVE 3D KEYBOARD SHORTCUT STATION
// ==========================================
const shortcutData = {
  "alt-space": {
    title: "Summon / Dismiss Dayflit",
    action: "Summon Floating Window",
    latency: "< 8ms response",
    desc: "Brings the floating companion to front from any application with fluid Acrylic glass blur.",
    shot: "today",
    badge: "Alt + Space",
  },
  "alt-shift-t": {
    title: "Quick Task Capture",
    action: "Natural Language Task Prompt",
    latency: "< 10ms response",
    desc: "Opens instant task capture prompt with intelligent date, priority, and project parsing.",
    shot: "tasks",
    badge: "Alt + Shift + T",
  },
  "alt-shift-v": {
    title: "Whisper Voice Memo",
    action: "Offline Local Transcription",
    latency: "< 14ms response",
    desc: "Hold to dictate voice notes; on-device Whisper transcribes without cloud servers.",
    shot: "voice-recording",
    badge: "Alt + Shift + V",
  },
  "alt-shift-space": {
    title: "Toggle Focus Session",
    action: "Deep Focus Pomodoro",
    latency: "< 6ms response",
    desc: "Starts a 25-minute Pomodoro, syncs with Spotify, and displays an acrylic PIP timer.",
    shot: "focus-running",
    badge: "Alt + Shift + Space",
  },
  "alt-shift-n": {
    title: "Quick Note / Daily Journal",
    action: "Encrypted Journal Scratchpad",
    latency: "< 9ms response",
    desc: "Opens today's journal prompt with Markdown support, tags, and biometric/PIN lock.",
    shot: "journal",
    badge: "Alt + Shift + N",
  },
  "alt-shift-c": {
    title: "Toggle Companion Bubble",
    action: "Mini Floating Acrylic Orb",
    latency: "< 7ms response",
    desc: "Collapses Dayflit into an ambient floating desktop bubble displaying active timer.",
    shot: "bubble",
    badge: "Alt + Shift + C",
  },
};

function selectShortcut(key) {
  const info = shortcutData[key];
  if (!info) return;

  const mode = getCurrentTheme();
  $$(".shortcut-card").forEach((card) => {
    const isSelected = card.dataset.shortcut === key;
    card.classList.toggle("active", isSelected);
  });

  const titleEl = $("#preview-action-title");
  const latencyEl = $("#preview-latency");
  const descEl = $("#preview-description");
  const badgeEl = $("#preview-key-badge");
  const imgEl = $("#preview-img");

  if (titleEl) titleEl.textContent = info.action;
  if (latencyEl) latencyEl.textContent = info.latency;
  if (descEl) descEl.textContent = info.desc;
  if (badgeEl) badgeEl.textContent = info.badge;
  if (imgEl) {
    const filename = info.shot.includes("voice") || info.shot.includes("bubble")
      ? `${info.shot}.png`
      : `${info.shot}-${mode}.png`;
    imgEl.src = `./shots/${filename}`;
  }
}

// Click listener for shortcut cards
$$(".shortcut-card").forEach((card) => {
  card.addEventListener("click", () => {
    const key = card.dataset.shortcut;
    selectShortcut(key);
    // Depress the keys visually
    const keys = $$(".kbd-3d", card);
    keys.forEach((k) => k.classList.add("active"));
    setTimeout(() => keys.forEach((k) => k.classList.remove("active")), 260);
  });
});

// Real Global Keyboard Shortcut Listener
window.addEventListener("keydown", (e) => {
  const isAlt = e.altKey;
  const isShift = e.shiftKey;
  const keyUpper = e.key.toUpperCase();
  const code = e.code;

  let triggered = null;

  if (isAlt && !isShift && (code === "Space" || e.key === " ")) {
    triggered = "alt-space";
  } else if (isAlt && isShift && keyUpper === "T") {
    triggered = "alt-shift-t";
  } else if (isAlt && isShift && keyUpper === "V") {
    triggered = "alt-shift-v";
  } else if (isAlt && isShift && (code === "Space" || e.key === " ")) {
    triggered = "alt-shift-space";
  } else if (isAlt && isShift && keyUpper === "N") {
    triggered = "alt-shift-n";
  } else if (isAlt && isShift && keyUpper === "C") {
    triggered = "alt-shift-c";
  }

  if (triggered) {
    e.preventDefault();
    selectShortcut(triggered);
    const card = $(`[data-shortcut="${triggered}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const keys = $$(".kbd-3d", card);
      keys.forEach((k) => k.classList.add("active"));
      setTimeout(() => keys.forEach((k) => k.classList.remove("active")), 350);
    }
    toast(`Hotkey triggered: ${shortcutData[triggered].badge}`);
  }
});

// ==========================================
// 7. COPYABLE SHA-256 BOX
// ==========================================
const copyShaBtn = $("#copy-sha-btn");
const shaTarget = $("#sha-target");
const psCmd = $("#ps-cmd");

async function copyChecksum() {
  const hash = shaTarget?.textContent?.trim() || SITE.sha256;
  try {
    await navigator.clipboard.writeText(hash);
    if (copyShaBtn) {
      copyShaBtn.innerHTML = `<span>✓</span><span>Copied!</span>`;
      setTimeout(() => {
        copyShaBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>`;
      }, 2000);
    }
    toast("SHA-256 Checksum copied to clipboard!");
  } catch (err) {
    toast("Unable to copy hash to clipboard");
  }
}

copyShaBtn?.addEventListener("click", copyChecksum);
shaTarget?.addEventListener("click", copyChecksum);

psCmd?.addEventListener("click", async () => {
  const cmd = psCmd.textContent.trim();
  try {
    await navigator.clipboard.writeText(cmd);
    toast("PowerShell verification command copied!");
  } catch (e) {
    toast("Copied command");
  }
});

// ==========================================
// 8. DARK / LIGHT GALLERY & FILTER TABS
// ==========================================
$$("[data-theme-pick]").forEach((b) =>
  b.addEventListener("click", () => {
    $$("[data-theme-pick]").forEach((x) => x.classList.toggle("on", x === b));
    const mode = b.dataset.themePick;
    $$("#gallery-grid img").forEach((img) => {
      const shot = img.dataset.shot;
      if (shot) img.src = `./shots/${shot}-${mode}.png`;
    });
    // Also sync the tour image and shortcut preview image
    renderTourStep(currentTourIdx);
    const activeShortcut = $(".shortcut-card.active")?.dataset.shortcut || "alt-space";
    selectShortcut(activeShortcut);
  })
);

// Gallery Category Filter Tabs
$$(".gallery-filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".gallery-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter;

    $$("#gallery-grid figure").forEach((fig) => {
      const cat = fig.dataset.category;
      if (filter === "all" || cat === filter) {
        fig.style.display = "";
      } else {
        fig.style.display = "none";
      }
    });
  });
});

// Lightbox Modal
const lb = $("#lightbox");
const lbImg = $("#lb-image");
const lbCaption = $("#lb-caption");

function openLightbox(src, alt) {
  if (!lb || !lbImg) return;
  lbImg.src = src;
  lbImg.alt = alt || "Screenshot view";
  if (lbCaption) lbCaption.textContent = alt || "";
  lb.hidden = false;
  $(".lb-close", lb)?.focus();
}

function closeLightbox() {
  if (lb) lb.hidden = true;
}

$$("#gallery-grid img, .shot img, #tour-image, #preview-img").forEach((img) =>
  img.addEventListener("click", () => {
    openLightbox(img.src, img.alt);
  })
);

$(".lb-close", lb)?.addEventListener("click", closeLightbox);
lb?.addEventListener("click", (e) => {
  if (e.target === lb) closeLightbox();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && lb && !lb.hidden) closeLightbox();
});

// ==========================================
// 9. FAQ ACCORDION FILTERS
// ==========================================
$$(".faq-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$(".faq-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    const filter = chip.dataset.faqFilter;

    $$(".faq-item").forEach((item) => {
      const cat = item.dataset.faqCat;
      if (filter === "all" || cat === filter) {
        item.style.display = "";
      } else {
        item.style.display = "none";
      }
    });
  });
});
