import { SITE } from "./config.js";

// Helper utilities
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Global theme: Strict Light Theme
const currentTheme = "light";

// ==========================================================================
// 1. CONFIG & METADATA BINDINGS
// ==========================================================================
$$("[data-version]").forEach((el) => (el.textContent = SITE.version));
$$("[data-size]").forEach((el) => (el.textContent = SITE.installerSize));
$$("[data-year]").forEach((el) => (el.textContent = String(new Date().getFullYear())));
if (SITE.sha256) $$("[data-sha]").forEach((el) => (el.textContent = SITE.sha256));
if (SITE.releaseDate) $$("[data-date]").forEach((el) => (el.textContent = SITE.releaseDate));

const bindLink = (attr, url) => {
  $$(`[${attr}]`).forEach((linkEl) => {
    if (url) {
      linkEl.href = url;
      linkEl.removeAttribute("aria-disabled");
    } else {
      linkEl.setAttribute("aria-disabled", "true");
      linkEl.addEventListener("click", (e) => {
        e.preventDefault();
        showToast("Feature coming in upcoming release");
      });
    }
  });
};

bindLink("data-download", SITE.downloadUrl);
bindLink("data-releases", SITE.releasesUrl);
bindLink("data-beta", SITE.betaUrl);
bindLink("data-docs", SITE.docsUrl);
bindLink("data-support", SITE.supportUrl);
bindLink("data-contact", SITE.contactUrl);
bindLink("data-privacy", SITE.privacyUrl);
bindLink("data-source", SITE.sourceUrl);

// Toast Notification
export function showToast(message) {
  let toastEl = $(".site-toast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "site-toast";
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>${message}</span>`;
  toastEl.classList.add("active");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("active"), 2600);
}

// Subtle Mechanical Keyboard Audio Click (Web Audio API)
let audioCtx = null;
function playKeyClick() {
  if (prefersReducedMotion) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(650, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.038);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.038);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
  } catch (e) {
    // AudioContext blocked or not supported, ignore silently
  }
}



// ==========================================================================
// 3. FLOATING NAVBAR & SCROLL BEHAVIOR
// ==========================================================================
const navbar = $("#navbar");
const mobileToggle = $("#mobile-toggle");
const mobileDrawer = $("#mobile-drawer");

window.addEventListener(
  "scroll",
  () => {
    if (navbar) {
      navbar.classList.toggle("scrolled", window.scrollY > 20);
    }
  },
  { passive: true }
);

mobileToggle?.addEventListener("click", () => {
  const isOpen = mobileDrawer.classList.toggle("open");
  mobileToggle.setAttribute("aria-expanded", String(isOpen));
  mobileToggle.classList.toggle("open", isOpen);
});

$$("#mobile-drawer a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileDrawer.classList.remove("open");
    mobileToggle.setAttribute("aria-expanded", "false");
    mobileToggle.classList.remove("open");
  });
});

// Scroll Reveal Observer
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08 }
);
$$(".reveal-item").forEach((el) => {
  if (prefersReducedMotion) el.classList.add("revealed");
  else revealObserver.observe(el);
});

// Click on mini bubble summons companion
const heroBubble = $("#hero-bubble");
heroBubble?.addEventListener("click", () => {
  selectShortcut("alt-space");
  playKeyClick();
  showToast("Companion orb clicked — summoned to foreground!");
});

// ==========================================================================
// 4. ACETERNITY SPOTLIGHT CARDS DYNAMIC CURSOR
// ==========================================================================
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

// ==========================================================================
// 5. BENTO GRID INTERACTIVE WIDGETS
// ==========================================================================

// --- Widget 1: Robust NLP Parser
const nlpInput = $("#nlp-input");
const nlpClearBtn = $("#nlp-clear-btn");
const nlpChips = $("#nlp-chips");

function parseNaturalLanguage(text) {
  const chips = [];
  if (!text || !text.trim()) return chips;
  const lower = text.toLowerCase();

  // Date parsing
  if (lower.includes("tomorrow")) {
    const timeMatch = text.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    chips.push({ type: "date", label: `Tomorrow ${timeMatch ? timeMatch[1] : "9:00 AM"}` });
  } else if (lower.includes("friday")) {
    chips.push({ type: "date", label: "Friday 10:00 AM" });
  } else if (lower.includes("monday")) {
    chips.push({ type: "date", label: "Every Monday 9:00 AM" });
  } else if (lower.includes("today")) {
    chips.push({ type: "date", label: "Today 5:00 PM" });
  } else if (lower.includes("in 2 hours")) {
    chips.push({ type: "date", label: "In 2 Hours" });
  }

  // Duration
  const durMatch = text.match(/(?:for\s+)?(\d+\s*(?:m|min|mins|h|hr|hours?))\b/i);
  if (durMatch) {
    chips.push({ type: "duration", label: `${durMatch[1]} duration` });
  }

  // Tags (#word)
  const tagMatches = text.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach((t) => chips.push({ type: "tag", label: `#${t}` }));
  }

  // Priorities
  if (lower.includes("!urgent")) {
    chips.push({ type: "priority", label: "Urgent" });
  } else if (lower.includes("!high")) {
    chips.push({ type: "priority", label: "High Priority" });
  } else if (lower.includes("!med")) {
    chips.push({ type: "priority", label: "Medium Priority" });
  } else if (lower.includes("!low")) {
    chips.push({ type: "priority", label: "Low Priority" });
  }

  return chips;
}

function renderNlpChips(chips) {
  if (!nlpChips) return;
  if (!chips.length) {
    nlpChips.innerHTML = `<span style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">Type dates (tomorrow 3pm), tags (#eng), durations (45m), or priorities (!urgent)...</span>`;
    return;
  }
  nlpChips.innerHTML = chips
    .map((c) => `<span class="nlp-chip ${c.type}">${c.label}</span>`)
    .join("");
}

if (nlpInput) {
  renderNlpChips(parseNaturalLanguage(nlpInput.value));
  nlpInput.addEventListener("input", (e) => {
    renderNlpChips(parseNaturalLanguage(e.target.value));
  });
}

nlpClearBtn?.addEventListener("click", () => {
  if (nlpInput) {
    nlpInput.value = "";
    nlpInput.focus();
    renderNlpChips([]);
  }
});

$$(".nlp-preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.preset;
    if (nlpInput) nlpInput.value = val;
    renderNlpChips(parseNaturalLanguage(val));
    showToast(`Loaded preset: ${btn.textContent}`);
  });
});

// --- Widget 2: Focus Timer Simulator with SVG Progress Ring
const focusClock = $("#focus-sim-clock");
const focusToggleBtn = $("#focus-sim-toggle");
const focusResetBtn = $("#focus-sim-reset");
const focusRingCircle = $("#focus-ring-circle");
const spotifyEq = $("#spotify-eq");
const spotifyStatusTag = $("#spotify-status-tag");

const TOTAL_FOCUS_SECONDS = 25 * 60;
let focusSeconds = TOTAL_FOCUS_SECONDS;
let focusInterval = null;
let focusRunning = false;
const CIRCLE_CIRCUMFERENCE = 226.2; // 2 * PI * 36

function updateFocusDisplay() {
  if (!focusClock) return;
  const m = String(Math.floor(focusSeconds / 60)).padStart(2, "0");
  const s = String(focusSeconds % 60).padStart(2, "0");
  focusClock.textContent = `${m}:${s}`;

  if (focusRingCircle) {
    const progress = (TOTAL_FOCUS_SECONDS - focusSeconds) / TOTAL_FOCUS_SECONDS;
    const offset = CIRCLE_CIRCUMFERENCE * (1 - progress);
    focusRingCircle.style.strokeDashoffset = String(offset);
  }
}

function toggleFocusTimer() {
  if (focusRunning) {
    clearInterval(focusInterval);
    focusRunning = false;
    if (focusToggleBtn) focusToggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
    spotifyEq?.classList.remove("active");
    if (spotifyStatusTag) {
      spotifyStatusTag.textContent = "Paused";
      spotifyStatusTag.classList.remove("active");
    }
    showToast("Focus session paused");
  } else {
    focusRunning = true;
    if (focusToggleBtn) focusToggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    spotifyEq?.classList.add("active");
    if (spotifyStatusTag) {
      spotifyStatusTag.textContent = "Playing";
      spotifyStatusTag.classList.add("active");
    }
    focusInterval = setInterval(() => {
      if (focusSeconds > 0) {
        focusSeconds--;
        updateFocusDisplay();
      } else {
        clearInterval(focusInterval);
        focusRunning = false;
        focusSeconds = TOTAL_FOCUS_SECONDS;
        updateFocusDisplay();
        spotifyEq?.classList.remove("active");
        if (spotifyStatusTag) spotifyStatusTag.textContent = "Completed";
        showToast("Focus block completed! Great work.");
      }
    }, 1000);
    showToast("Focus session running with Spotify");
  }
}

focusToggleBtn?.addEventListener("click", toggleFocusTimer);
focusResetBtn?.addEventListener("click", () => {
  clearInterval(focusInterval);
  focusRunning = false;
  focusSeconds = TOTAL_FOCUS_SECONDS;
  if (focusToggleBtn) focusToggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  spotifyEq?.classList.remove("active");
  if (spotifyStatusTag) {
    spotifyStatusTag.textContent = "Ready";
    spotifyStatusTag.classList.remove("active");
  }
  updateFocusDisplay();
  showToast("Focus timer reset to 25:00");
});
updateFocusDisplay();

// --- Widget 3: Whisper Voice Dictation Simulator
const whisperMic = $("#whisper-mic");
const whisperWaveBars = $$("#whisper-wave i");
const whisperText = $("#whisper-text");
let isRecording = false;
let waveTimer = null;
let typeStreamTimer = null;

const demoVoicePhrases = [
  "Remind me to review the quarterly product roadmap with Sam tomorrow at 3pm.",
  "Write follow-up email to design team regarding the Windows 11 Acrylic blur tokens.",
  "Ship the release binary with verified SHA-256 cryptographic hash before midnight.",
  "Journal entry: Great velocity on Dayflit redesign, keyboard shortcuts feel surgical.",
];

whisperMic?.addEventListener("click", () => {
  if (isRecording) {
    clearInterval(waveTimer);
    clearInterval(typeStreamTimer);
    isRecording = false;
    whisperMic.classList.remove("recording");
    whisperWaveBars.forEach((b) => (b.style.height = "6px"));
    showToast("Offline Whisper audio transcribed!");
  } else {
    isRecording = true;
    whisperMic.classList.add("recording");
    showToast("Dictating memo via offline Whisper AI...");

    // Animate speech sound waves
    waveTimer = setInterval(() => {
      whisperWaveBars.forEach((bar) => {
        bar.style.height = `${4 + Math.random() * 18}px`;
      });
    }, 120);

    const phrase = demoVoicePhrases[Math.floor(Math.random() * demoVoicePhrases.length)];
    if (whisperText) whisperText.textContent = '"';
    let charIdx = 0;

    // Simulate streaming letter-by-letter transcription
    typeStreamTimer = setInterval(() => {
      if (charIdx < phrase.length) {
        if (whisperText) whisperText.textContent += phrase[charIdx];
        charIdx++;
      } else {
        clearInterval(typeStreamTimer);
        clearInterval(waveTimer);
        isRecording = false;
        whisperMic.classList.remove("recording");
        whisperWaveBars.forEach((b) => (b.style.height = "6px"));
        if (whisperText) whisperText.textContent += '"';
        showToast("Transcription complete (100% on-device)");
      }
    }, 45);
  }
});

// --- Widget 4: Calendar Meeting Join
$("#calendar-join-btn")?.addEventListener("click", () => {
  showToast("Launching Daily Standup in Google Meet...");
});

// --- Widget 5: 52-Week Contribution Heatmap with Dates
function buildHeatmap() {
  const container = $("#heatmap-grid");
  if (!container) return;

  const totalWeeks = 38;
  const daysPerWeek = 7;
  let html = "";
  const now = new Date();

  for (let w = 0; w < totalWeeks; w++) {
    html += '<div class="heatmap-col">';
    for (let d = 0; d < daysPerWeek; d++) {
      const daysAgo = (totalWeeks - 1 - w) * 7 + (6 - d);
      const cellDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      const dateStr = cellDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      // Realistic activity density pattern
      let level = 0;
      const seed = (w * 7 + d * 13) % 100;
      if (w > totalWeeks - 8) {
        if (seed > 20) level = (seed % 4) + 1;
      } else if (w > totalWeeks - 20) {
        if (seed > 40) level = (seed % 3) + 1;
      } else {
        if (seed > 60) level = (seed % 2) + 1;
      }

      const tasksCount = level === 0 ? 0 : level * 2 + (seed % 3);
      const tooltip = `${dateStr} · ${tasksCount} tasks completed`;
      html += `<div class="heatmap-cell" data-level="${level}" title="${tooltip}"></div>`;
    }
    html += "</div>";
  }
  container.innerHTML = html;
}
buildHeatmap();

// Bento Tab Switch (Heatmap vs Obsidian)
$$(".bento-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".bento-tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.bentoTab;

    $$(".bento-tab-content").forEach((c) => {
      c.classList.toggle("active", c.id === `tab-${target}`);
    });
  });
});

// ==========================================================================
// 6. ACETERNITY INTERACTIVE SCREEN RECORDING VIDEO PLAYER STUDIO
// ==========================================================================
const videoChapters = [
  {
    name: "Architectural Tour",
    time: "00:00 · 01",
    badge: "Chapter 1 of 5 · Full Tour",
    heading: "DayFlit Spatial Desktop Tour",
    desc: "Glide across the Today Briefing, Infinite Canvas with Frame dragging and Bézier connectors, the interactive Life Wheel Time-Machine Scrubber, and the Raycast-Grade Command Palette with instant natural-language math calculation.",
    features: [
      "Smooth 60fps pan, cursor-centered zoom, and frame containment",
      "Interactive Wheel of Life with historical time-machine scrubbing",
      "Raycast-grade command palette with instant math calculator",
    ],
    webm: "./showcase/demo_hero_tour.webm",
    gif: "./showcase/demo_hero_tour.gif",
    shot: "today",
    label: "3.94 MB Native Rust Core",
    hotkey: "<kbd>Ctrl</kbd> + <kbd>K</kbd>",
    actionPill: "Architectural Tour",
    cursorX: "48%",
    cursorY: "38%",
  },
  {
    name: "Doc ↔ Edgeless Canvas",
    time: "00:06 · 02",
    badge: "Chapter 2 of 5 · AFFiNE Spatial",
    heading: "Bidirectional Docs & Infinite Canvas",
    desc: "Write linear Markdown notes with checklists, syntax highlighting, and callout blocks, then click Edgeless Canvas to watch blocks transform into spatial cards on an infinite dot-grid whiteboard with magnetic 4-port Bézier connectors.",
    features: [
      "Two-way live task & note cards: edits sync bidirectionally",
      "Magnetic 4-port Bézier connectors and group frame containment",
      "Full Obsidian JSON Canvas 1.0 (.canvas) compatibility",
    ],
    webm: "./showcase/demo_doc_to_edgeless_canvas.webm",
    gif: "./showcase/demo_doc_to_edgeless_canvas.gif",
    shot: "tasks",
    label: "Edgeless Canvas Active",
    hotkey: "<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>",
    actionPill: "Doc Mode Transformed",
    cursorX: "52%",
    cursorY: "40%",
  },
  {
    name: "3-Mode Life Architecture",
    time: "00:12 · 03",
    badge: "Chapter 3 of 5 · Holistic Vision",
    heading: "Editorial Studio, Wheel & 234-Wire Map",
    desc: "Connect daily execution to overarching purpose. Switch effortlessly between the Editorial Life Studio, interactive Wheel of Life SVG radar with historical Time-Machine scrubbing, and the 234-wire cubic-bezier spatial life map.",
    features: [
      "Editorial Pillar Studio with goals, projects, and principles",
      "Direct-manipulation SVG radar wheel with past quarter ghost scrubbing",
      "234-wire cubic-bezier network with full lineage illumination",
    ],
    webm: "./showcase/demo_life_architecture.webm",
    gif: "./showcase/demo_life_architecture.gif",
    shot: "insights",
    label: "Life Architecture Engine",
    hotkey: "<kbd>8</kbd> (Life View)",
    actionPill: "Wheel Time-Machine Scrub",
    cursorX: "50%",
    cursorY: "50%",
  },
  {
    name: "Planned vs. Actual Reality",
    time: "00:18 · 04",
    badge: "Chapter 4 of 5 · Win32 Tracker",
    heading: "Automated OS Reality Timeline & Smart Clips",
    desc: "A native Rust Win32 foreground process tracker automatically compares your planned calendar blocks against real application usage (VS Code, Chrome, Terminal), paired with MyMind-style auto-detected Color Swatches and OpenGraph bookmark cards.",
    features: [
      "Automated foreground window tracking without cloud telemetry",
      "15-minute magnetic timeboxing alongside actual usage timeline",
      "Auto-detected color swatches, harmonic palettes, and OG bookmarks",
    ],
    webm: "./showcase/demo_reality_timeline_and_clips.webm",
    gif: "./showcase/demo_reality_timeline_and_clips.gif",
    shot: "calendar",
    label: "Win32 Foreground Hook",
    hotkey: "<kbd>5</kbd> (Calendar Timeline)",
    actionPill: "Reality Timeline Synced",
    cursorX: "55%",
    cursorY: "45%",
  },
  {
    name: "iOS Dynamic Island",
    time: "00:24 · 05",
    badge: "Chapter 5 of 5 · Living Notch",
    heading: "iOS Dynamic Island & Dropover Stash Shelf",
    desc: "Anchored top-center to your desktop, the Dynamic Island morphs bilaterally from a compact 48px capsule into an expansive Hover Peek Strip, and springs open into a full Spatial Bento Deck with Dropover magnetic stash tray and rolling odometer digits.",
    features: [
      "Top-center notch anchoring with Win32 symmetrical math",
      "Dropover magnetic shelf for dragging images, files, and links",
      "Rolling odometer digits with sub-millisecond precision",
    ],
    webm: "./showcase/demo_dynamic_island.webm",
    gif: "./showcase/demo_dynamic_island.gif",
    shot: "pip",
    label: "Living Dynamic Island",
    hotkey: "<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>",
    actionPill: "Dynamic Island Morphed",
    cursorX: "50%",
    cursorY: "25%",
  },
];

const TOTAL_VIDEO_SECONDS = 30;
let currentVideoChapter = 0;
let videoCurrentSec = 0;
let videoPlaying = true;
let videoSpeed = 1.0;
let videoTimer = null;

const scrubberBar = $("#video-scrubber-bar");
const scrubberProgress = $("#video-scrubber-progress");
const scrubberHead = $("#video-scrubber-head");
const timeCur = $("#video-time-cur");
const videoPlayBtn = $("#video-play-btn");
const videoPlayIcon = $("#video-play-icon");
const videoPlayLabel = $("#video-play-label");
const videoSpeedBtn = $("#video-speed-btn");
const screencastCursor = $("#screencast-cursor");
const screencastRipple = $("#screencast-ripple");
const screencastHotkeyHud = $("#screencast-hotkey-hud");
const screencastActionPill = $("#screencast-action-pill");

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

function updateVideoTourStage(idx) {
  currentVideoChapter = idx;
  const data = videoChapters[idx];
  if (!data) return;

  const badge = $("#video-chapter-badge");
  const heading = $("#video-chapter-heading");
  const desc = $("#video-chapter-desc");
  const features = $("#video-chapter-features");
  const video = $("#video-screen-player");
  const img = $("#video-screen-img");
  const liveLabel = $("#video-live-label");

  if (badge) badge.textContent = data.badge;
  if (heading) heading.textContent = data.heading;
  if (desc) desc.innerHTML = data.desc;
  if (features) {
    features.innerHTML = data.features
      .map(
        (f) =>
          `<li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg><span>${f}</span></li>`
      )
      .join("");
  }
  if (video) {
    video.onerror = () => {
      video.style.display = "none";
      if (img) {
        img.style.display = "block";
        img.src = data.gif;
      }
    };
    const currentSrc = video.getAttribute("src") || "";
    if (!currentSrc.includes(data.webm.replace("./", ""))) {
      video.src = data.webm;
      video.playbackRate = videoSpeed;
      video.load();
      if (videoPlaying) {
        video.play().catch(() => {
          // If autoplay fails or video playback is blocked, fallback to GIF
          video.style.display = "none";
          if (img) {
            img.style.display = "block";
            img.src = data.gif;
          }
        });
      }
    }
  }
  if (img && video && video.style.display === "none") {
    img.alt = data.heading;
    img.src = data.gif;
  }
  if (liveLabel) liveLabel.textContent = data.label;

  // Animate screencast virtual cursor & HUD
  if (screencastCursor) {
    screencastCursor.style.left = data.cursorX;
    screencastCursor.style.top = data.cursorY;
  }
  if (screencastRipple) {
    screencastRipple.classList.remove("pulse");
    void screencastRipple.offsetWidth;
    screencastRipple.classList.add("pulse");
  }
  if (screencastHotkeyHud) {
    screencastHotkeyHud.innerHTML = data.hotkey;
    screencastHotkeyHud.classList.add("visible");
    setTimeout(() => screencastHotkeyHud.classList.remove("visible"), 1800);
  }
  if (screencastActionPill) {
    screencastActionPill.innerHTML = `<span class="action-pill-dot"></span><span>${data.actionPill}</span>`;
  }

  // Update chapter tabs
  $$(".video-chapter-tab").forEach((tab, i) => {
    const isActive = i === idx;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}


function updateTimelineUI() {
  const percent = (videoCurrentSec / TOTAL_VIDEO_SECONDS) * 100;
  if (scrubberProgress) scrubberProgress.style.width = `${percent}%`;
  if (scrubberHead) scrubberHead.style.left = `${percent}%`;
  if (timeCur) timeCur.textContent = formatTime(videoCurrentSec);

  // Sync active chapter based on time
  const targetChapter = Math.min(
    Math.floor((videoCurrentSec / TOTAL_VIDEO_SECONDS) * videoChapters.length),
    videoChapters.length - 1
  );
  if (targetChapter !== currentVideoChapter) {
    updateVideoTourStage(targetChapter);
  }
}

function startVideoEngine() {
  if (prefersReducedMotion) return;
  clearInterval(videoTimer);
  videoTimer = setInterval(() => {
    if (!videoPlaying) return;
    videoCurrentSec += 0.25 * videoSpeed;
    if (videoCurrentSec >= TOTAL_VIDEO_SECONDS) {
      videoCurrentSec = 0;
    }
    updateTimelineUI();
  }, 250);
}

function seekToTime(sec) {
  videoCurrentSec = Math.max(0, Math.min(sec, TOTAL_VIDEO_SECONDS));
  updateTimelineUI();
}

// Scrubber Click & Drag
scrubberBar?.addEventListener("click", (e) => {
  const rect = scrubberBar.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  seekToTime(ratio * TOTAL_VIDEO_SECONDS);
});

$$(".video-chapter-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const idx = parseInt(tab.dataset.chapter, 10);
    seekToTime(idx * 6);
    updateVideoTourStage(idx);
    videoPlaying = true;
    updateVideoControlsUI();
  });
});

function updateVideoControlsUI() {
  if (!videoPlayBtn) return;
  if (videoPlaying) {
    if (videoPlayIcon) videoPlayIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    if (videoPlayLabel) videoPlayLabel.textContent = "Pause";
  } else {
    if (videoPlayIcon) videoPlayIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
    if (videoPlayLabel) videoPlayLabel.textContent = "Play";
  }
}

videoPlayBtn?.addEventListener("click", () => {
  videoPlaying = !videoPlaying;
  updateVideoControlsUI();
  const v = $("#video-screen-player");
  if (v) {
    if (videoPlaying) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }
  if (videoPlaying) startVideoEngine();
});

videoSpeedBtn?.addEventListener("click", () => {
  if (videoSpeed === 1.0) videoSpeed = 1.5;
  else if (videoSpeed === 1.5) videoSpeed = 2.0;
  else videoSpeed = 1.0;
  videoSpeedBtn.textContent = `${videoSpeed.toFixed(1)}x`;
  const v = $("#video-screen-player");
  if (v) v.playbackRate = videoSpeed;
  showToast(`Screencast speed: ${videoSpeed.toFixed(1)}x`);
});

$("#video-next-btn")?.addEventListener("click", () => {
  const next = (currentVideoChapter + 1) % videoChapters.length;
  seekToTime(next * 6);
  updateVideoTourStage(next);
});

$("#video-fullscreen-btn")?.addEventListener("click", () => {
  const box = $("#video-tour-box");
  if (!box) return;
  if (!document.fullscreenElement) {
    box.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

updateVideoTourStage(0);

const tourBox = $("#video-tour-box");
if (tourBox && "IntersectionObserver" in window) {
  const tourObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (videoPlaying) {
            const v = $("#video-screen-player");
            v?.play().catch(() => {});
            startVideoEngine();
          }
        } else {
          clearInterval(videoTimer);
          const v = $("#video-screen-player");
          v?.pause();
        }
      });
    },
    { threshold: 0.15 }
  );
  tourObserver.observe(tourBox);
} else {
  startVideoEngine();
}

// ==========================================================================
// 7. 3D MECHANICAL KEYBOARD SHORTCUT STATION
// ==========================================================================
const shortcutConfig = {
  "alt-space": {
    action: "Summon Dayflit Window",
    latency: "< 8ms response",
    desc: "Brings floating companion to front from any application with fluid Acrylic glass blur.",
    shot: "today",
    badge: "Alt + Space",
  },
  "alt-shift-t": {
    action: "Natural Language Task Prompt",
    latency: "< 10ms response",
    desc: "Opens instant task capture prompt with intelligent date, priority, and project parsing.",
    shot: "tasks",
    badge: "Alt + Shift + T",
  },
  "alt-shift-v": {
    action: "Offline Local Transcription",
    latency: "< 14ms response",
    desc: "Hold to dictate voice notes; on-device Whisper transcribes without cloud servers.",
    shot: "voice-recording",
    badge: "Alt + Shift + V",
  },
  "alt-shift-space": {
    action: "Deep Focus Pomodoro",
    latency: "< 6ms response",
    desc: "Starts a 25-minute Pomodoro, syncs with Spotify, and displays an Acrylic PIP timer.",
    shot: "focus-running",
    badge: "Alt + Shift + Space",
  },
  "alt-shift-n": {
    action: "Encrypted Journal Scratchpad",
    latency: "< 9ms response",
    desc: "Opens today's journal prompt with Markdown support, tags, and biometric/PIN lock.",
    shot: "journal",
    badge: "Alt + Shift + N",
  },
  "alt-shift-c": {
    action: "Mini Floating Acrylic Orb",
    latency: "< 7ms response",
    desc: "Collapses Dayflit into an ambient floating desktop bubble displaying active timer.",
    shot: "bubble",
    badge: "Alt + Shift + C",
  },
};

function selectShortcut(key) {
  const info = shortcutConfig[key];
  if (!info) return;

  $$(".shortcut-row-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.shortcut === key);
  });

  const titleEl = $("#shortcut-action-title");
  const latencyEl = $("#shortcut-latency");
  const descEl = $("#shortcut-desc");
  const badgeEl = $("#shortcut-badge");
  const imgEl = $("#shortcut-preview-img");

  if (titleEl) titleEl.textContent = info.action;
  if (latencyEl) latencyEl.textContent = info.latency;
  if (descEl) descEl.textContent = info.desc;
  if (badgeEl) badgeEl.textContent = info.badge;
  if (imgEl) {
    const filename =
      info.shot.includes("voice") || info.shot.includes("bubble")
        ? `${info.shot}.png`
        : `${info.shot}-light.png`;
    imgEl.src = `./shots/${filename}`;
  }
}

$$(".shortcut-row-card").forEach((card) => {
  card.addEventListener("click", () => {
    const key = card.dataset.shortcut;
    selectShortcut(key);
    playKeyClick();
    const keys = $$(".key-3d", card);
    keys.forEach((k) => k.classList.add("depressed"));
    setTimeout(() => keys.forEach((k) => k.classList.remove("depressed")), 220);
  });
});

// Physical Keyboard Event Listener
window.addEventListener("keydown", (e) => {
  const isAlt = e.altKey;
  const isShift = e.shiftKey;
  const keyUpper = e.key.toUpperCase();
  const code = e.code;

  let matched = null;
  if (isAlt && !isShift && (code === "Space" || e.key === " ")) {
    matched = "alt-space";
  } else if (isAlt && isShift && keyUpper === "T") {
    matched = "alt-shift-t";
  } else if (isAlt && isShift && keyUpper === "V") {
    matched = "alt-shift-v";
  } else if (isAlt && isShift && (code === "Space" || e.key === " ")) {
    matched = "alt-shift-space";
  } else if (isAlt && isShift && keyUpper === "N") {
    matched = "alt-shift-n";
  } else if (isAlt && isShift && keyUpper === "C") {
    matched = "alt-shift-c";
  }

  if (matched) {
    e.preventDefault();
    selectShortcut(matched);
    playKeyClick();
    const card = $(`[data-shortcut="${matched}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const keys = $$(".key-3d", card);
      keys.forEach((k) => k.classList.add("depressed"));
      setTimeout(() => keys.forEach((k) => k.classList.remove("depressed")), 300);
    }
    showToast(`Hotkey triggered: ${shortcutConfig[matched].badge}`);
  }
});

// ==========================================================================
// 8. GALLERY CONTROLS & MULTI-IMAGE LIGHTBOX
// ==========================================================================
$$(".filter-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".filter-chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter;

    $$("#gallery-grid .gallery-card").forEach((card) => {
      const cat = card.dataset.category;
      card.style.display = filter === "all" || cat === filter ? "" : "none";
    });
  });
});

// Multi-Image Lightbox Modal
const lightbox = $("#lightbox");
const lbImage = $("#lb-image");
const lbCaption = $("#lb-caption");
const lbPrev = $("#lb-prev");
const lbNext = $("#lb-next");

const galleryItems = [
  { shot: "today", caption: "Today View — Dashboard & Agenda" },
  { shot: "tasks", caption: "Tasks & Tags — Subtasks & Natural Syntax" },
  { shot: "calendar", caption: "Calendar — Timeboxing Timeline" },
  { shot: "focus", caption: "Focus Session — Pomodoro Configuration" },
  { shot: "focus-running", caption: "Running Session — Progress Ring & Audio" },
  { shot: "journal", caption: "Encrypted Journal — Daily Prompts & PIN" },
  { shot: "habits", caption: "Habit Tracker — Streak Matrix" },
  { shot: "insights", caption: "Insights — Consistency Heatmap" },
];

let currentLbIndex = 0;

function openLightbox(index) {
  if (!lightbox || !lbImage) return;
  currentLbIndex = (index + galleryItems.length) % galleryItems.length;
  const item = galleryItems[currentLbIndex];
  lbImage.src = `./shots/${item.shot}-light.png`;
  lbImage.alt = item.caption;
  if (lbCaption) lbCaption.textContent = item.caption;
  lightbox.hidden = false;
}

function closeLightbox() {
  if (lightbox) lightbox.hidden = true;
}

$$("#gallery-grid .gallery-card").forEach((card) => {
  card.addEventListener("click", () => {
    const idx = parseInt(card.dataset.idx, 10);
    openLightbox(isNaN(idx) ? 0 : idx);
  });
});

$$(".video-display-frame img, .shortcut-preview-img-wrap img, #hero-app-image").forEach((img) => {
  img.addEventListener("click", () => {
    openLightbox(0);
  });
});

lbPrev?.addEventListener("click", () => openLightbox(currentLbIndex - 1));
lbNext?.addEventListener("click", () => openLightbox(currentLbIndex + 1));
$(".lightbox-close-btn", lightbox)?.addEventListener("click", closeLightbox);

lightbox?.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

window.addEventListener("keydown", (e) => {
  if (!lightbox || lightbox.hidden) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") openLightbox(currentLbIndex - 1);
  if (e.key === "ArrowRight") openLightbox(currentLbIndex + 1);
});

// ==========================================================================
// 9. COPYABLE SHA-256 CHECKSUM & POWERSHELL VERIFICATION
// ==========================================================================
const copyShaBtn = $("#copy-sha-btn");
const shaTarget = $("#sha-target");
const psCmd = $("#ps-cmd");

async function copyChecksum() {
  const hash = shaTarget?.textContent?.trim() || SITE.sha256;
  try {
    await navigator.clipboard.writeText(hash);
    if (copyShaBtn) {
      copyShaBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Copied!</span>`;
      setTimeout(() => {
        copyShaBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>`;
      }, 2000);
    }
    showToast("SHA-256 Checksum copied to clipboard!");
  } catch (err) {
    showToast("Unable to copy hash to clipboard");
  }
}

copyShaBtn?.addEventListener("click", copyChecksum);
shaTarget?.addEventListener("click", copyChecksum);

psCmd?.addEventListener("click", async () => {
  const cmd = psCmd.textContent.trim();
  try {
    await navigator.clipboard.writeText(cmd);
    showToast("PowerShell verify command copied!");
  } catch (e) {
    showToast("Command copied");
  }
});

// ==========================================================================
// 10. FAQ ACCORDION CATEGORY FILTER
// ==========================================================================
$$(".faq-filter-btn").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$(".faq-filter-btn").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    const filter = chip.dataset.faqFilter;

    $$(".faq-entry").forEach((item) => {
      const cat = item.dataset.faqCat;
      item.style.display = filter === "all" || cat === filter ? "" : "none";
    });
  });
});
