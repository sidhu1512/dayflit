// ===================================================================
// DAYFLIT MAXIMALISM EDITION — CLIENT JAVASCRIPT & MICRO-INTERACTIONS
// Interactive Phone Companion, Real Web Audio Synthesizer,
// Dynamic Island, Habit Punch-Cards, Live NLP Parser & Whisper Simulator
// ===================================================================

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initLiveClock();
  initDynamicIsland();
  initChecklist();
  initSparklineTabs();
  initCurrencySwitcher();
  initSegmentedMeter();
  initPunchCards();
  initSoundscapeStudio();
  initNlpStudio();
  initWhisperTester();
  initSha256Copy();
  initGalleryModal();
});

// Toast Helper
function showToast(message) {
  let toast = document.getElementById("max-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "max-toast";
    toast.className = "max-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// 1. Mobile Drawer Navigation
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

// 2. Live Clock in Companion Header
function initLiveClock() {
  const clockEl = document.getElementById("phone-live-clock");
  if (!clockEl) return;
  const update = () => {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    clockEl.textContent = `${h}:${m}`;
  };
  update();
  setInterval(update, 1000);
}

// 3. Dynamic Island Expand & Focus Status
function initDynamicIsland() {
  const island = document.getElementById("phone-island");
  if (!island) return;
  let expanded = false;

  island.addEventListener("click", () => {
    expanded = !expanded;
    const title = island.querySelector(".island-title");
    const timer = island.querySelector(".island-timer");
    if (expanded) {
      if (title) title.textContent = "Deep Focus • Spotify Lo-Fi";
      if (timer) timer.textContent = "18:42 left";
      showToast("⚡ Dynamic Island: Focused session active");
    } else {
      if (title) title.textContent = "25m Focus";
      if (timer) timer.textContent = "24:18";
    }
  });
}

// 4. Interactive Companion Task Checklist
function initChecklist() {
  const items = document.querySelectorAll(".max-task-item");
  const countBadge = document.getElementById("checklist-remaining-count");
  if (!items.length) return;

  const updateCount = () => {
    if (!countBadge) return;
    const remaining = Array.from(items).filter((it) => !it.classList.contains("completed")).length;
    countBadge.textContent = `${remaining} left`;
  };

  items.forEach((item) => {
    item.addEventListener("click", () => {
      item.classList.toggle("completed");
      updateCount();
      const title = item.querySelector("span:nth-child(2)")?.textContent || "Task";
      if (item.classList.contains("completed")) {
        showToast(`✓ Completed: "${title}"`);
      }
    });
  });

  updateCount();
}

// 5. Sparkline Timeline Tabs & Data Update
function initSparklineTabs() {
  const tabs = document.querySelectorAll(".time-tab");
  const metricVal = document.getElementById("sparkline-metric-val");
  const metricChange = document.getElementById("sparkline-metric-change");
  const wavePath = document.getElementById("sparkline-wave");
  const areaPath = document.getElementById("sparkline-area");

  if (!tabs.length) return;

  const dataMap = {
    "24h": {
      val: "8.4 hrs",
      change: "+12.3%",
      dWave: "M 0 52 Q 40 18, 80 40 T 160 22 T 240 38 T 300 12",
      dArea: "M 0 52 Q 40 18, 80 40 T 160 22 T 240 38 T 300 12 L 300 70 L 0 70 Z",
    },
    "Week": {
      val: "42.8 hrs",
      change: "+18.7%",
      dWave: "M 0 46 Q 50 12, 100 32 T 180 16 T 250 26 T 300 8",
      dArea: "M 0 46 Q 50 12, 100 32 T 180 16 T 250 26 T 300 8 L 300 70 L 0 70 Z",
    },
    "Month": {
      val: "168.2 hrs",
      change: "+24.1%",
      dWave: "M 0 58 Q 60 26, 110 44 T 190 20 T 260 30 T 300 10",
      dArea: "M 0 58 Q 60 26, 110 44 T 190 20 T 260 30 T 300 10 L 300 70 L 0 70 Z",
    },
    "6 Month": {
      val: "982.5 hrs",
      change: "+31.0%",
      dWave: "M 0 62 Q 70 30, 130 50 T 210 18 T 270 24 T 300 6",
      dArea: "M 0 62 Q 70 30, 130 50 T 210 18 T 270 24 T 300 6 L 300 70 L 0 70 Z",
    },
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const key = tab.textContent.trim();
      const conf = dataMap[key];
      if (conf) {
        if (metricVal) metricVal.textContent = conf.val;
        if (metricChange) metricChange.textContent = conf.change;
        if (wavePath) wavePath.setAttribute("d", conf.dWave);
        if (areaPath) areaPath.setAttribute("d", conf.dArea);
      }
    });
  });
}

// 6. Currency / Metric Switcher on Balance Card
function initCurrencySwitcher() {
  const pills = document.querySelectorAll(".cur-pill");
  const balanceEl = document.getElementById("balance-val-text");
  const subStatEl = document.getElementById("sub-stat-text");

  if (!pills.length) return;

  const curValues = {
    USD: { balance: "$1,222.00", sub: "$582.00" },
    EUR: { balance: "€1,130.00", sub: "€538.00" },
    GBP: { balance: "£975.00", sub: "£465.00" },
    AUD: { balance: "A$1,840.00", sub: "A$875.00" },
  };

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const code = pill.textContent.trim();
      const item = curValues[code];
      if (item) {
        if (balanceEl) balanceEl.textContent = item.balance;
        if (subStatEl) subStatEl.textContent = item.sub;
        showToast(`Currency set to ${code}`);
      }
    });
  });
}

// 7. Multi-Colored Segmented Meter Interaction
function initSegmentedMeter() {
  const segments = document.querySelectorAll(".meter-segment");
  const countEl = document.getElementById("meter-active-count");
  if (!segments.length) return;

  segments.forEach((seg, idx) => {
    seg.addEventListener("click", () => {
      segments.forEach((s, i) => {
        if (i <= idx) {
          s.style.opacity = "1";
        } else {
          s.style.opacity = "0.22";
        }
      });
      if (countEl) countEl.textContent = `${idx + 1} / ${segments.length} Units`;
    });
  });
}

// 8. Tactile Habit Streaks & Punch-Card
function initPunchCards() {
  const dots = document.querySelectorAll(".punch-dot");
  if (!dots.length) return;

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const isGreen = dot.classList.contains("punch-dot-green");
      if (dot.classList.contains("punched") || dot.classList.contains("punched-green")) {
        dot.classList.remove("punched", "punched-green");
        dot.textContent = dot.getAttribute("data-day") || "•";
      } else {
        if (isGreen) {
          dot.classList.add("punched-green");
        } else {
          dot.classList.add("punched");
        }
        dot.textContent = "✓";
        showToast("🎯 Habit punched! Keep the momentum!");
      }
    });
  });
}

// 9. Ambient Focus Soundscape Studio (Web Audio API Synthesizer)
function initSoundscapeStudio() {
  const playBtn = document.getElementById("sound-play-toggle");
  const eqBars = document.querySelectorAll(".eq-bar");
  const soundTiles = document.querySelectorAll(".sound-tile");
  const volumeSlider = document.getElementById("sound-volume-slider");

  let audioCtx = null;
  let isPlaying = false;
  let activeNoiseNode = null;
  let masterGain = null;
  let activeType = "rain"; // rain, coffee, lofi, binaural

  const ensureAudio = () => {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = volumeSlider ? Number(volumeSlider.value) / 100 : 0.4;
        masterGain.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  };

  const startSound = (type) => {
    ensureAudio();
    if (!audioCtx || !masterGain) return;
    stopSound();

    if (type === "binaural") {
      // 40Hz binaural beats simulation
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const subGain = audioCtx.createGain();
      subGain.gain.value = 0.25;

      osc1.frequency.value = 200; // 200 Hz
      osc2.frequency.value = 240; // 240 Hz -> 40 Hz gamma binaural beat difference

      osc1.connect(subGain);
      osc2.connect(subGain);
      subGain.connect(masterGain);

      osc1.start();
      osc2.start();
      activeNoiseNode = {
        stop: () => {
          try {
            osc1.stop();
            osc2.stop();
          } catch (_) {}
        },
      };
    } else {
      // Warm filtered noise generator (rain / coffee / lofi)
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Brown noise filter for gentle soothing sound
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 2.8;
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Filter
      const filter = audioCtx.createBiquadFilter();
      if (type === "rain") {
        filter.type = "lowpass";
        filter.frequency.value = 650;
      } else if (type === "coffee") {
        filter.type = "bandpass";
        filter.frequency.value = 850;
      } else {
        // lo-fi
        filter.type = "lowpass";
        filter.frequency.value = 450;
      }

      whiteNoise.connect(filter);
      filter.connect(masterGain);
      whiteNoise.start();

      activeNoiseNode = {
        stop: () => {
          try {
            whiteNoise.stop();
          } catch (_) {}
        },
      };
    }
  };

  const stopSound = () => {
    if (activeNoiseNode) {
      try {
        activeNoiseNode.stop();
      } catch (_) {}
      activeNoiseNode = null;
    }
  };

  soundTiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      soundTiles.forEach((t) => t.classList.remove("active"));
      tile.classList.add("active");
      activeType = tile.getAttribute("data-sound") || "rain";
      if (isPlaying) {
        startSound(activeType);
        showToast(`Now playing: ${tile.querySelector(".sound-tile-name")?.textContent}`);
      }
    });
  });

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      isPlaying = !isPlaying;
      if (isPlaying) {
        startSound(activeType);
        playBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          <span>Pause Studio</span>
        `;
        eqBars.forEach((bar) => bar.classList.add("playing"));
        showToast("🎧 Soundscape Studio: Playing ambient audio");
      } else {
        stopSound();
        playBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Play Soundscape</span>
        `;
        eqBars.forEach((bar) => bar.classList.remove("playing"));
        showToast("Audio paused");
      }
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener("input", (e) => {
      const val = Number(e.target.value) / 100;
      if (masterGain) {
        masterGain.gain.value = val;
      }
    });
  }
}

// 10. Natural Language Parser Live Demo
function initNlpStudio() {
  const input = document.getElementById("nlp-input");
  const pills = document.querySelectorAll(".nlp-pill-preset");
  const titleOut = document.getElementById("nlp-out-title");
  const dateOut = document.getElementById("nlp-out-date");
  const tagOut = document.getElementById("nlp-out-tag");
  const priorityOut = document.getElementById("nlp-out-priority");

  if (!input) return;

  const parseText = (raw) => {
    if (!raw.trim()) {
      if (titleOut) titleOut.textContent = "—";
      if (dateOut) dateOut.textContent = "—";
      if (tagOut) tagOut.textContent = "—";
      if (priorityOut) priorityOut.textContent = "—";
      return;
    }

    let text = raw;
    let tag = "general";
    let priority = "Normal";
    let date = "Today";

    // Extract tags (#work, @deep-work, ~habits)
    const tagMatch = text.match(/[#@~]([a-zA-Z0-9_-]+)/);
    if (tagMatch) {
      tag = tagMatch[1];
      text = text.replace(tagMatch[0], "").trim();
    }

    // Extract priority (!urgent, !high, !p1)
    if (/!(urgent|high|p1)/i.test(text)) {
      priority = "⚡ Urgent / High";
      text = text.replace(/!(urgent|high|p1)/i, "").trim();
    }

    // Extract dates
    if (/tomorrow/i.test(text)) {
      date = "Tomorrow";
      text = text.replace(/tomorrow/i, "").trim();
    } else if (/friday/i.test(text)) {
      date = "This Friday";
      text = text.replace(/friday/i, "").trim();
    } else if (/every day/i.test(text)) {
      date = "Recurring Daily";
      text = text.replace(/every day/i, "").trim();
    }

    // Extract time (e.g. at 3pm, 4pm, 10am)
    const timeMatch = text.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (timeMatch) {
      date += ` • ${timeMatch[1].toUpperCase()}`;
      text = text.replace(timeMatch[0], "").trim();
    }

    if (titleOut) titleOut.textContent = text || raw;
    if (dateOut) dateOut.textContent = date;
    if (tagOut) tagOut.textContent = `#${tag}`;
    if (priorityOut) priorityOut.textContent = priority;
  };

  input.addEventListener("input", (e) => {
    parseText(e.target.value);
  });

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const sample = pill.getAttribute("data-query") || pill.textContent;
      input.value = sample;
      parseText(sample);
      showToast("Applied natural language example");
    });
  });

  // Run initial parse on default value
  parseText(input.value);
}

// 11. Offline Whisper Tester Simulator
function initWhisperTester() {
  const btn = document.getElementById("btn-whisper-test");
  const transcriptEl = document.getElementById("whisper-transcript-text");
  if (!btn || !transcriptEl) return;

  let recording = false;
  const samples = [
    "“Capture sprint wrap-up meeting notes with Sarah tomorrow at 10am”",
    "“Deep focus session 45 minutes on Dayflit native packaging”",
    "“Review verified SHA-256 installer hash before releasing to Oracle VM”",
    "“Refactor floating acrylic window position memory for multimonitor Windows”",
  ];
  let sampleIndex = 0;

  btn.addEventListener("click", () => {
    recording = !recording;
    if (recording) {
      btn.innerHTML = `
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;animation:pulse-green 1s infinite;"></span>
        <span>Listening (Offline Whisper)...</span>
      `;
      transcriptEl.textContent = "Listening via local GGML model...";
      setTimeout(() => {
        if (!recording) return;
        recording = false;
        transcriptEl.textContent = samples[sampleIndex % samples.length];
        sampleIndex++;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
          <span>Push to Talk (Whisper)</span>
        `;
        showToast("🎙️ 100% Offline Whisper transcript generated!");
      }, 1400);
    }
  });
}

// 12. Verified SHA-256 Copy Button
function initSha256Copy() {
  const btn = document.getElementById("btn-copy-sha256");
  const hashText = "955a2f3ade41f34584e5cd463cd37042d24d9440e6dd8967ad3d715837622053";
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(hashText);
      } else {
        const temp = document.createElement("input");
        temp.value = hashText;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      btn.textContent = "✓ Copied!";
      showToast("✓ Verified SHA-256 copied to clipboard!");
      setTimeout(() => {
        btn.textContent = "Copy SHA-256";
      }, 2400);
    } catch (_) {
      showToast("Hash: " + hashText.slice(0, 16) + "...");
    }
  });
}

// 13. Visual Gallery Lightbox Modal
function initGalleryModal() {
  const modal = document.getElementById("gallery-modal");
  const modalImg = document.getElementById("modal-img");
  const closeBtn = document.getElementById("modal-close");
  const items = document.querySelectorAll(".gallery-item");

  if (!modal || !modalImg) return;

  items.forEach((item) => {
    item.addEventListener("click", () => {
      const img = item.querySelector("img");
      if (img) {
        modalImg.src = img.src;
        modal.classList.add("active");
      }
    });
  });

  const closeModal = () => modal.classList.remove("active");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}
