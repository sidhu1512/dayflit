// ===================================================================
// DAYFLIT BENTO GRID MASTERPIECE — CLIENT JAVASCRIPT
// Interactive spline wave, NLP parser, multi-engine soundscapes, and micro-interactions
// ===================================================================

import { SITE } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initDeviceCompanion();
  initSplineChart();
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

// 1. Interactive Device Card & Companion Mockup
function initDeviceCompanion() {
  // Live Clock in Phone Mockup
  const clockEl = document.getElementById("mockup-time");
  if (clockEl) {
    const update = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      clockEl.textContent = `${hours}:${minutes}`;
    };
    update();
    setInterval(update, 1000);
  }

  // Dynamic Island interactive expand
  const island = document.getElementById("dynamic-island");
  if (island) {
    island.addEventListener("click", () => {
      island.classList.toggle("expanded");
      const text = island.querySelector(".island-text");
      if (text) {
        text.textContent = island.classList.contains("expanded") 
          ? "Deep Work • 24:18 left" 
          : "25m Focus";
      }
      triggerMicroHaptic();
    });
  }

  // Interactive Task Checkbox in Mockup
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

// 2. Centerpiece Lilac Card Interactive Spline Wave Chart
function initSplineChart() {
  const container = document.getElementById("spline-chart-container");
  const svg = document.getElementById("spline-svg");
  const pathWave = document.getElementById("spline-wave-path");
  const pathArea = document.getElementById("spline-area-path");
  const pointCircle = document.getElementById("spline-active-dot");
  const pointHalo = document.getElementById("spline-active-halo");
  const tooltip = document.getElementById("spline-tooltip");
  const statVal = document.getElementById("spline-stat-val");
  const statChange = document.getElementById("spline-stat-change");
  const axisContainer = document.getElementById("spline-axis");
  const btnWeekly = document.getElementById("btn-spline-weekly");
  const btnMonthly = document.getElementById("btn-spline-monthly");

  if (!svg || !pathWave || !pathArea) return;

  // Data sets: weekly and monthly (matching reference image labels)
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
  let calculatedPoints = [];

  function renderChart(data) {
    const width = 600;
    const height = 110;
    const paddingX = 35;
    const paddingY = 22;

    const maxVal = Math.max(...data.map(d => d.hours)) * 1.15;
    const minVal = 0;

    calculatedPoints = data.map((d, i) => {
      const x = paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
      const y = height - paddingY - ((d.hours - minVal) / (maxVal - minVal)) * (height - paddingY * 2);
      return { x, y, ...d };
    });

    // Generate smooth cubic bezier curve
    let dLine = `M ${calculatedPoints[0].x} ${calculatedPoints[0].y}`;
    for (let i = 0; i < calculatedPoints.length - 1; i++) {
      const p0 = i > 0 ? calculatedPoints[i - 1] : calculatedPoints[i];
      const p1 = calculatedPoints[i];
      const p2 = calculatedPoints[i + 1];
      const p3 = i !== calculatedPoints.length - 2 ? calculatedPoints[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      dLine += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    pathWave.setAttribute("d", dLine);

    // Area fill path
    const lastP = calculatedPoints[calculatedPoints.length - 1];
    const firstP = calculatedPoints[0];
    const dArea = `${dLine} L ${lastP.x} ${height} L ${firstP.x} ${height} Z`;
    pathArea.setAttribute("d", dArea);

    // X Axis Labels
    if (axisContainer) {
      axisContainer.innerHTML = "";
      calculatedPoints.forEach((p, idx) => {
        const span = document.createElement("span");
        span.textContent = p.label;
        if (idx === activeIndex) span.classList.add("active");
        span.addEventListener("click", () => selectPoint(idx, calculatedPoints));
        axisContainer.appendChild(span);
      });
    }

    selectPoint(activeIndex, calculatedPoints);
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

    if (pointHalo) {
      pointHalo.setAttribute("cx", p.x);
      pointHalo.setAttribute("cy", p.y);
    }

    if (tooltip && container) {
      const rawPctX = (p.x / 600) * 100;
      // Clamp tooltip left between 10% and 90% so it never overflows off container sides
      const clampedPctX = Math.max(10, Math.min(90, rawPctX));
      const pctY = (p.y / 110) * 100;

      tooltip.style.left = `${clampedPctX}%`;
      tooltip.style.top = `${pctY}%`;
      tooltip.textContent = `${p.label}: ${p.str} Deep Work`;
      tooltip.style.opacity = "1";
    }

    if (statVal) {
      statVal.textContent = p.str;
    }
    if (statChange) {
      statChange.textContent = `${p.change} vs prev`;
      statChange.className = `lilac-change-pill ${p.change.startsWith("+") ? "positive" : ""}`;
    }

    if (axisContainer) {
      Array.from(axisContainer.children).forEach((child, i) => {
        child.classList.toggle("active", i === idx);
      });
    }
  }

  // Pointer event tracking (handles both mouse and touchscreens smoothly!)
  function handlePointer(e) {
    if (!container || calculatedPoints.length === 0) return;
    const rect = container.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 600;

    let closestIdx = 0;
    let closestDist = Infinity;
    calculatedPoints.forEach((p, idx) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });
    selectPoint(closestIdx, calculatedPoints);
  }

  if (container) {
    container.addEventListener("pointerdown", handlePointer);
    container.addEventListener("pointermove", handlePointer);
    container.addEventListener("mouseleave", () => {
      // Keep tooltip visible at activeIndex without jitter
      if (calculatedPoints.length > 0) {
        selectPoint(activeIndex, calculatedPoints);
      }
    });
  }

  renderChart(currentData);

  // Segmented controls: Weekly (Mon-Sun) vs Monthly (Jan-Sep)
  if (btnWeekly && btnMonthly) {
    btnWeekly.addEventListener("click", () => {
      btnWeekly.classList.add("active");
      btnWeekly.setAttribute("aria-selected", "true");
      btnMonthly.classList.remove("active");
      btnMonthly.setAttribute("aria-selected", "false");
      currentData = dataWeekly;
      activeIndex = 4;
      renderChart(currentData);
      triggerMicroHaptic();
    });

    btnMonthly.addEventListener("click", () => {
      btnMonthly.classList.add("active");
      btnMonthly.setAttribute("aria-selected", "true");
      btnWeekly.classList.remove("active");
      btnWeekly.setAttribute("aria-selected", "false");
      currentData = dataMonthly;
      activeIndex = 4;
      renderChart(currentData);
      triggerMicroHaptic();
    });
  }
}

// 3. Periwinkle Soundscape & Spotify Focus Sync (Multi-synthesizer audio engine)
function initSoundscapePlayer() {
  const playBtn = document.getElementById("sound-play-btn");
  const eq = document.getElementById("sound-equalizer");
  const chips = document.querySelectorAll(".sound-chip");
  const trackName = document.getElementById("sound-track-name");

  let isPlaying = false;
  let audioCtx = null;
  let activeNodes = [];
  let currentSoundType = "binaural";

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function stopCurrentAudio() {
    activeNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (_) {}
    });
    activeNodes = [];
  }

  function playSoundscape(type) {
    const ctx = getAudioContext();
    if (!ctx) return;
    stopCurrentAudio();

    try {
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 1.2);
      masterGain.connect(ctx.destination);
      activeNodes.push(masterGain);

      if (type === "binaural") {
        // True 40Hz Binaural Beat: Left Ear 216Hz, Right Ear 256Hz (difference = 40Hz)
        const merger = ctx.createChannelMerger(2);
        merger.connect(masterGain);

        const oscL = ctx.createOscillator();
        oscL.type = "sine";
        oscL.frequency.setValueAtTime(216, ctx.currentTime);
        oscL.connect(merger, 0, 0);

        const oscR = ctx.createOscillator();
        oscR.type = "sine";
        oscR.frequency.setValueAtTime(256, ctx.currentTime);
        oscR.connect(merger, 0, 1);

        // Soft sub-bass foundation
        const subOsc = ctx.createOscillator();
        subOsc.type = "triangle";
        subOsc.frequency.setValueAtTime(108, ctx.currentTime);
        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.015, ctx.currentTime);
        subOsc.connect(subGain);
        subGain.connect(masterGain);

        oscL.start();
        oscR.start();
        subOsc.start();
        activeNodes.push(oscL, oscR, subOsc, merger, subGain);

      } else if (type === "rain") {
        // Generative Rain: White noise with bandpass filtering and smooth envelope modulation
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(800, ctx.currentTime);
        filter.Q.setValueAtTime(0.7, ctx.currentTime);

        whiteNoise.connect(filter);
        filter.connect(masterGain);
        whiteNoise.start();
        activeNodes.push(whiteNoise, filter);

      } else if (type === "cafe") {
        // Cafe chatter ambience: Warm low-passed pink noise with subtle resonance
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          output[i] = (b0 + b1 + b2) * 0.15;
        }

        const pinkNoise = ctx.createBufferSource();
        pinkNoise.buffer = noiseBuffer;
        pinkNoise.loop = true;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(450, ctx.currentTime);

        pinkNoise.connect(lowpass);
        lowpass.connect(masterGain);
        pinkNoise.start();
        activeNodes.push(pinkNoise, lowpass);

      } else if (type === "lofi") {
        // Warm Lo-Fi Chord Drone: C minor 7 chord (C3 130.8Hz, Eb3 155.6Hz, G3 196.0Hz, Bb3 233.1Hz)
        const chordFreqs = [130.81, 155.56, 196.00, 233.08];
        const chordGain = ctx.createGain();
        chordGain.gain.setValueAtTime(0.015, ctx.currentTime);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(420, ctx.currentTime);

        chordGain.connect(filter);
        filter.connect(masterGain);

        chordFreqs.forEach(freq => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          osc.connect(chordGain);
          osc.start();
          activeNodes.push(osc);
        });

        activeNodes.push(chordGain, filter);
      }
    } catch (_) {
      // Audio autoplay policy fallback
    }
  }

  function togglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
      if (eq) eq.classList.add("playing");
      if (playBtn) playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      playSoundscape(currentSoundType);
      showToast(`Playing Soundscape: ${trackName ? trackName.textContent : "40Hz Binaural"}`);
    } else {
      if (eq) eq.classList.remove("playing");
      if (playBtn) playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      stopCurrentAudio();
    }
  }

  if (playBtn) playBtn.addEventListener("click", togglePlay);

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const title = chip.getAttribute("data-sound-title") || chip.textContent;
      currentSoundType = chip.getAttribute("data-sound-type") || "binaural";
      if (trackName) trackName.textContent = title;

      if (isPlaying) {
        playSoundscape(currentSoundType);
      }
      showToast(`Soundscape: ${title}`);
      triggerMicroHaptic();
    });
  });
}

// 4. Deep Forest Green Whisper Radar Voice Dictation Simulation
function initWhisperRadar() {
  const btn = document.getElementById("btn-whisper-demo");
  const btnLabel = document.getElementById("whisper-btn-label");
  const beam = document.getElementById("radar-sweep-beam");
  const promptText = document.getElementById("whisper-sample-prompt");

  const voiceDemos = [
    "“Review Q3 architecture plan and send summary to team”",
    "“Schedule deep focus block tomorrow 9am for rust release”",
    "“Brainstorm 5 marketing angles for dayflit bento launch”",
    "“Remind me in 30 minutes to stretch and drink water”"
  ];
  let demoIdx = 0;
  let isListening = false;
  let resetTimer = null;

  if (!btn) return;

  function startListening() {
    if (isListening) return;
    isListening = true;
    clearTimeout(resetTimer);

    if (beam) beam.style.animationDuration = "0.6s";
    if (btnLabel) btnLabel.textContent = "Listening (Whisper)...";
    btn.style.background = "#10b981";
    triggerMicroHaptic();
  }

  function finishTranscribing() {
    if (!isListening) return;
    isListening = false;

    if (btnLabel) btnLabel.textContent = "⚡ Processing Offline...";
    btn.style.background = "#059669";

    setTimeout(() => {
      demoIdx = (demoIdx + 1) % voiceDemos.length;
      if (promptText) {
        promptText.textContent = voiceDemos[demoIdx];
        promptText.style.color = "#a7f3d0";
      }
      if (btnLabel) btnLabel.textContent = "✓ Transcribed Offline";
      btn.style.background = "rgba(255, 255, 255, 0.2)";
      if (beam) beam.style.animationDuration = "4s";
      showToast("Whisper processed offline memo (0ms cloud latency)");

      // Auto-reset back to "Hold to Speak" after 2.8s
      resetTimer = setTimeout(() => {
        if (btnLabel) btnLabel.textContent = "Hold to Speak";
        btn.style.background = "rgba(255, 255, 255, 0.15)";
      }, 2800);
    }, 650);
  }

  // Pointerdown / Pointerup for true push-to-talk
  btn.addEventListener("pointerdown", startListening);
  btn.addEventListener("pointerup", finishTranscribing);
  btn.addEventListener("pointerleave", () => {
    if (isListening) finishTranscribing();
  });

  // Standard click fallback for keyboard/screen readers
  btn.addEventListener("click", () => {
    if (!isListening) {
      startListening();
      setTimeout(finishTranscribing, 1200);
    }
  });
}

// 5. Pale Cream Typography Card Swatches (Resilient HEX copy)
function initSwatches() {
  const swatches = document.querySelectorAll(".color-swatch-box");
  swatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const hex = swatch.getAttribute("data-hex");
      if (hex) {
        copyToClipboard(hex, `Copied swatch ${hex} to clipboard!`);
        triggerMicroHaptic();
      }
    });
  });
}

// 6. Interactive Chrono NLP Parser Studio (With robust compound date + time regex)
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
    const tagMatch = title.match(/#([a-zA-Z0-9_-]+)/);
    if (tagMatch) {
      tag = `#${tagMatch[1]}`;
      title = title.replace(tagMatch[0], " ");
    }

    // Detect priority: !high, !urgent, !p1, etc.
    const p1Match = title.match(/!(?:high|urgent|p1|critical)/i);
    const p2Match = title.match(/!(?:med|medium|p2)/i);
    const p3Match = title.match(/!(?:low|p3)/i);
    if (p1Match) {
      priority = "🔥 Urgent (P1)";
      title = title.replace(p1Match[0], " ");
    } else if (p2Match) {
      priority = "⚡ Medium (P2)";
      title = title.replace(p2Match[0], " ");
    } else if (p3Match) {
      priority = "🌱 Low (P3)";
      title = title.replace(p3Match[0], " ");
    }

    // Detect compound dates & times: e.g. "tomorrow at 5pm", "Friday at 10am", "tonight at 9pm", "in 2 hours"
    const timeRegex = /(?:(?:next\s+)?(?:tomorrow|today|tonight|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\bin\s+\d+\s*(?:hours?|hrs?|minutes?|mins?|days?|h|m)\b)/i;
    const timeMatch = title.match(timeRegex);
    if (timeMatch) {
      date = `📅 ${timeMatch[0].trim()}`;
      title = title.replace(timeMatch[0], " ");
    }

    // Clean up multiple spaces and trim
    title = title.replace(/\s+/g, " ").trim();

    if (tokenTitle) tokenTitle.textContent = title || "Untitled Task";
    if (tokenDate) tokenDate.textContent = date;
    if (tokenTag) tokenTag.textContent = tag;
    if (tokenPriority) tokenPriority.textContent = priority;
  }

  if (input) {
    input.addEventListener("input", (e) => parseString(e.target.value));
    // Initial parse of default input value
    parseString(input.value);
  }

  sampleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const text = chip.getAttribute("data-query") || chip.textContent.trim();
      if (input) {
        input.value = text;
        parseString(text);
      }
      triggerMicroHaptic();
    });
  });
}

// 7. Direct Download and Verified SHA-256 Checksum
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
      copyToClipboard(text, "SHA-256 Checksum copied to clipboard!");
      copyBtn.textContent = "✓ Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy SHA-256";
      }, 2500);
      triggerMicroHaptic();
    });
  }
}

// 8. Keyboard Shortcuts Simulation
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

// 9. Gallery Modal Lightbox
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

// Robust Clipboard Copy with fallback
function copyToClipboard(text, successMessage) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage);
    }).catch(() => {
      fallbackCopy(text, successMessage);
    });
  } else {
    fallbackCopy(text, successMessage);
  }
}

function fallbackCopy(text, successMessage) {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    textArea.remove();
    if (successful) {
      showToast(successMessage);
    } else {
      showToast(`Token: ${text}`);
    }
  } catch (_) {
    showToast(`Token: ${text}`);
  }
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
