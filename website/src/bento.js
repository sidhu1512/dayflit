// ===================================================================
// DAYFLIT BENTO GRID MASTERPIECE — CLIENT JAVASCRIPT
// Interactive spline wave, NLP parser, soundscapes, and micro-interactions
// ===================================================================

import { SITE } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initClock();
  initSplineChart();
  initCompanionTasks();
  initSoundscapePlayer();
  initWhisperRadar();
  initSwatches();
  initNlpParser();
  initDownloadAndChecksum();
  initShortcuts();
  initGalleryModal();
});

// Mobile Drawer Toggle
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

// 1. Live Real-Time Clock in Companion Mockup
function initClock() {
  const clockEl = document.getElementById("mockup-time");
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    clockEl.textContent = `${hours}:${minutes}`;
  };
  update();
  setInterval(update, 1000);
}

// 2. Centerpiece Lilac Card Interactive Spline Wave Chart
function initSplineChart() {
  const container = document.getElementById("spline-chart-container");
  const svg = document.getElementById("spline-svg");
  const pathWave = document.getElementById("spline-wave-path");
  const pathArea = document.getElementById("spline-area-path");
  const pointCircle = document.getElementById("spline-active-dot");
  const tooltip = document.getElementById("spline-tooltip");
  const statVal = document.getElementById("spline-stat-val");
  const statChange = document.getElementById("spline-stat-change");
  const axisContainer = document.getElementById("spline-axis");

  if (!svg || !pathWave || !pathArea) return;

  // Data sets: weekly and monthly
  const dataWeekly = [
    { label: "Mon", hours: 4.2, str: "4h 12m", change: "+12%" },
    { label: "Tue", hours: 5.8, str: "5h 48m", change: "+25%" },
    { label: "Wed", hours: 3.5, str: "3h 30m", change: "-8%" },
    { label: "Thu", hours: 6.4, str: "6h 24m", change: "+34%" },
    { label: "Fri", hours: 7.2, str: "7h 12m", change: "+45%" },
    { label: "Sat", hours: 5.1, str: "5h 06m", change: "+18%" },
    { label: "Sun", hours: 6.3, str: "6h 18m", change: "+22%" },
  ];

  const dataMonthly = [
    { label: "Jan", hours: 3.2, str: "28h / mo", change: "+8%" },
    { label: "Feb", hours: 4.5, str: "36h / mo", change: "+14%" },
    { label: "Mar", hours: 4.0, str: "32h / mo", change: "+2%" },
    { label: "Apr", hours: 5.6, str: "44h / mo", change: "+28%" },
    { label: "May", hours: 6.8, str: "54h / mo", change: "+41%" },
    { label: "Jun", hours: 5.2, str: "41h / mo", change: "+15%" },
    { label: "Jul", hours: 6.0, str: "48h / mo", change: "+20%" },
    { label: "Aug", hours: 7.5, str: "60h / mo", change: "+52%" },
    { label: "Sep", hours: 8.2, str: "65h / mo", change: "+64%" },
  ];

  let currentData = dataWeekly;
  let activeIndex = 4; // Default to Friday

  function renderChart(data) {
    const width = 600;
    const height = 110;
    const paddingX = 30;
    const paddingY = 20;

    const maxVal = Math.max(...data.map(d => d.hours)) * 1.15;
    const minVal = 0;

    const points = data.map((d, i) => {
      const x = paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
      const y = height - paddingY - ((d.hours - minVal) / (maxVal - minVal)) * (height - paddingY * 2);
      return { x, y, ...d };
    });

    // Generate smooth bezier curve path
    let dLine = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i !== points.length - 2 ? points[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      dLine += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    pathWave.setAttribute("d", dLine);

    // Generate area path
    const lastP = points[points.length - 1];
    const firstP = points[0];
    const dArea = `${dLine} L ${lastP.x} ${height} L ${firstP.x} ${height} Z`;
    pathArea.setAttribute("d", dArea);

    // Build X axis labels
    if (axisContainer) {
      axisContainer.innerHTML = "";
      points.forEach((p, idx) => {
        const span = document.createElement("span");
        span.textContent = p.label;
        if (idx === activeIndex) span.classList.add("active");
        span.addEventListener("click", () => selectPoint(idx, points));
        axisContainer.appendChild(span);
      });
    }

    selectPoint(activeIndex, points);

    // Mouse / touch tracking across the container
    if (container) {
      container.onmousemove = (e) => {
        const rect = container.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * width;
        let closestIdx = 0;
        let closestDist = Infinity;
        points.forEach((p, idx) => {
          const dist = Math.abs(p.x - mouseX);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = idx;
          }
        });
        selectPoint(closestIdx, points);
      };
    }
  }

  function selectPoint(idx, points) {
    if (idx < 0 || idx >= points.length) return;
    activeIndex = idx;
    const p = points[idx];

    if (pointCircle) {
      pointCircle.setAttribute("cx", p.x);
      pointCircle.setAttribute("cy", p.y);
      pointCircle.setAttribute("r", "5.5");
    }

    if (tooltip && container) {
      const rect = container.getBoundingClientRect();
      const pctX = (p.x / 600) * 100;
      const pctY = (p.y / 110) * 100;
      tooltip.style.left = `${pctX}%`;
      tooltip.style.top = `${pctY}%`;
      tooltip.textContent = `${p.label}: ${p.str} Deep Work`;
      tooltip.style.opacity = "1";
    }

    if (statVal) {
      statVal.textContent = p.str;
    }
    if (statChange) {
      statChange.textContent = `${p.change} vs prev`;
    }

    if (axisContainer) {
      Array.from(axisContainer.children).forEach((child, i) => {
        child.classList.toggle("active", i === idx);
      });
    }
  }

  renderChart(currentData);

  // View toggle pill (Week vs Month)
  const toggleBtn = document.getElementById("spline-view-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (currentData === dataWeekly) {
        currentData = dataMonthly;
        toggleBtn.textContent = "Switch to Weekly";
        activeIndex = 4;
      } else {
        currentData = dataWeekly;
        toggleBtn.textContent = "Switch to Monthly";
        activeIndex = 4;
      }
      renderChart(currentData);
    });
  }
}

// 3. Interactive Task Checkbox in Phone Mockup
function initCompanionTasks() {
  const taskItems = document.querySelectorAll(".task-item");
  const remainingEl = document.getElementById("mockup-remaining-count");

  taskItems.forEach((item) => {
    item.addEventListener("click", () => {
      item.classList.toggle("completed");
      updateCount();
      triggerMicroHaptic();
    });
  });

  function updateCount() {
    if (!remainingEl) return;
    const total = taskItems.length;
    const done = document.querySelectorAll(".task-item.completed").length;
    remainingEl.textContent = `${total - done} tasks left`;
  }
}

// 4. Periwinkle Soundscape & Lo-Fi Player (with gentle Web Audio synth)
function initSoundscapePlayer() {
  const playBtn = document.getElementById("sound-play-btn");
  const eq = document.getElementById("sound-equalizer");
  const chips = document.querySelectorAll(".sound-chip");
  const trackName = document.getElementById("sound-track-name");

  let isPlaying = false;
  let audioCtx = null;
  let oscillator = null;
  let gainNode = null;

  function togglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
      if (eq) eq.classList.add("playing");
      if (playBtn) playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      startAmbientAudio();
    } else {
      if (eq) eq.classList.remove("playing");
      if (playBtn) playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      stopAmbientAudio();
    }
  }

  function startAmbientAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") audioCtx.resume();

      oscillator = audioCtx.createOscillator();
      gainNode = audioCtx.createGain();

      // Soft 432Hz sine wave with low volume
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(432, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.04, audioCtx.currentTime + 1.5);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
    } catch (_) {
      // Audio context policy fallback
    }
  }

  function stopAmbientAudio() {
    if (gainNode && audioCtx) {
      try {
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        setTimeout(() => {
          if (oscillator) oscillator.stop();
        }, 500);
      } catch (_) {}
    }
  }

  if (playBtn) playBtn.addEventListener("click", togglePlay);

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const title = chip.getAttribute("data-sound-title") || chip.textContent;
      if (trackName) trackName.textContent = title;
      showToast(`Selected Soundscape: ${title}`);
    });
  });
}

// 5. Deep Forest Green Whisper Radar Voice Dictation Simulation
function initWhisperRadar() {
  const btn = document.getElementById("btn-whisper-demo");
  const beam = document.getElementById("radar-sweep-beam");
  const promptText = document.getElementById("whisper-sample-prompt");

  const voiceDemos = [
    "“Review Q3 architecture plan and send summary to team”",
    "“Schedule deep focus block tomorrow 9am for rust release”",
    "“Brainstorm 5 marketing angles for dayflit bento launch”",
    "“Remind me in 30 minutes to stretch and drink water”"
  ];
  let demoIdx = 0;

  if (!btn) return;

  btn.addEventListener("click", () => {
    if (beam) {
      beam.style.animationDuration = "0.8s";
    }
    btn.textContent = "Listening (Local Whisper)...";
    btn.style.background = "#10b981";

    setTimeout(() => {
      demoIdx = (demoIdx + 1) % voiceDemos.length;
      if (promptText) {
        promptText.textContent = voiceDemos[demoIdx];
        promptText.style.color = "#a7f3d0";
      }
      btn.textContent = "✓ Transcribed 100% Offline";
      btn.style.background = "rgba(255, 255, 255, 0.2)";
      if (beam) beam.style.animationDuration = "4s";
      showToast("Whisper processed offline memo (0ms cloud latency)");
    }, 1200);
  });
}

// 6. Pale Cream Typography Card Swatches (1-click HEX copy)
function initSwatches() {
  const swatches = document.querySelectorAll(".color-swatch-box");
  swatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const hex = swatch.getAttribute("data-hex");
      if (hex) {
        navigator.clipboard.writeText(hex).then(() => {
          showToast(`Copied swatch ${hex} to clipboard!`);
        });
      }
    });
  });
}

// 7. Interactive NLP Parser Studio
function initNlpParser() {
  const input = document.getElementById("nlp-input");
  const sampleChips = document.querySelectorAll(".sample-chip");
  const tokenTitle = document.getElementById("token-title");
  const tokenDate = document.getElementById("token-date");
  const tokenTag = document.getElementById("token-tag");
  const tokenPriority = document.getElementById("token-priority");

  function parseString(str) {
    if (!str.trim()) {
      if (tokenTitle) tokenTitle.textContent = "—";
      if (tokenDate) tokenDate.textContent = "—";
      if (tokenTag) tokenTag.textContent = "—";
      if (tokenPriority) tokenPriority.textContent = "—";
      return;
    }

    let title = str;
    let date = "Today";
    let tag = "#inbox";
    let priority = "Normal (P3)";

    // Detect tags: #tag
    const tagMatch = str.match(/#(\w+)/);
    if (tagMatch) {
      tag = `#${tagMatch[1]}`;
      title = title.replace(tagMatch[0], "");
    }

    // Detect priority: !high, !urgent, !p1
    const p1Match = str.match(/!(?:high|urgent|p1|critical)/i);
    const p2Match = str.match(/!(?:med|medium|p2)/i);
    if (p1Match) {
      priority = "🔥 Urgent (P1)";
      title = title.replace(p1Match[0], "");
    } else if (p2Match) {
      priority = "⚡ Medium (P2)";
      title = title.replace(p2Match[0], "");
    }

    // Detect dates/times: tomorrow, Friday, at 3pm, in 2h
    const timeMatch = str.match(/(?:tomorrow|today|friday|monday|tonight|next week|at \d{1,2}(?::\d{2})?\s*(?:am|pm)?|in \d+\s*(?:h|hours|mins))/i);
    if (timeMatch) {
      date = `📅 ${timeMatch[0]}`;
      title = title.replace(timeMatch[0], "");
    }

    title = title.trim();

    if (tokenTitle) tokenTitle.textContent = title || "Untitled Task";
    if (tokenDate) tokenDate.textContent = date;
    if (tokenTag) tokenTag.textContent = tag;
    if (tokenPriority) tokenPriority.textContent = priority;
  }

  if (input) {
    input.addEventListener("input", (e) => parseString(e.target.value));
  }

  sampleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const text = chip.getAttribute("data-query") || chip.textContent;
      if (input) {
        input.value = text;
        parseString(text);
      }
    });
  });
}

// 8. Direct Download and Verified SHA-256 Checksum
function initDownloadAndChecksum() {
  const copyBtn = document.getElementById("btn-copy-sha256");
  const shaVal = document.getElementById("sha256-hash");
  const downloadBtns = document.querySelectorAll("[data-download-url]");

  downloadBtns.forEach((btn) => {
    btn.setAttribute("href", SITE.downloadUrl);
  });

  if (copyBtn && shaVal) {
    copyBtn.addEventListener("click", () => {
      const text = shaVal.textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "✓ Copied!";
        showToast("SHA-256 Checksum copied to clipboard!");
        setTimeout(() => {
          copyBtn.textContent = "Copy SHA-256";
        }, 2500);
      });
    });
  }
}

// 9. Keyboard Shortcuts Simulation
function initShortcuts() {
  const shortcutRows = document.querySelectorAll(".shortcut-row");
  shortcutRows.forEach((row) => {
    row.addEventListener("click", () => {
      const desc = row.querySelector(".shortcut-desc")?.textContent || "Shortcut activated";
      showToast(`Triggered: ${desc}`);
      triggerMicroHaptic();
    });
  });
}

// 10. Gallery Modal Lightbox
function initGalleryModal() {
  const cards = document.querySelectorAll(".gallery-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const img = card.querySelector("img");
      if (!img) return;
      openImageLightbox(img.src, img.alt);
    });
  });
}

function openImageLightbox(src, alt) {
  const existing = document.getElementById("lightbox-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "lightbox-modal";
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background = "rgba(0,0,0,0.85)";
  modal.style.backdropFilter = "blur(12px)";
  modal.style.zIndex = "10000";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.padding = "24px";
  modal.style.cursor = "zoom-out";

  modal.innerHTML = `
    <div style="max-width: 95vw; max-height: 90vh; text-align: center;">
      <img src="${src}" alt="${alt}" style="max-width: 100%; max-height: 85vh; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);" />
      <p style="color: #ffffff; margin-top: 12px; font-weight: 600; font-size: 0.95rem;">${alt}</p>
    </div>
  `;

  modal.addEventListener("click", () => modal.remove());
  document.body.appendChild(modal);
}

// Reusable Toast Function
let toastTimeout;
function showToast(msg) {
  let toast = document.getElementById("bento-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "bento-toast";
    toast.className = "bento-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("active");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("active");
  }, 2600);
}

function triggerMicroHaptic() {
  if (navigator.vibrate) {
    navigator.vibrate(8);
  }
}
