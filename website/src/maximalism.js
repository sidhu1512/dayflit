// ===================================================================
// DAYFLIT MAXIMALISM EDITION — CLIENT JAVASCRIPT & MICRO-INTERACTIONS
// Interactive Phone Companion, Real Web Audio Synthesizer,
// Dynamic Island, Habit Punch-Cards, Live NLP Parser & Whisper Simulator
// ===================================================================

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initLiveClock();
  initDynamicIsland();
  initCalendarPills();
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

// Toast Notification Helper
function showToast(message) {
  let toast = document.getElementById("max-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "max-toast";
    toast.className = "max-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
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

// 3. Dynamic Island Expand & Live Seconds Countdown
function initDynamicIsland() {
  const island = document.getElementById("phone-island");
  if (!island) return;

  let currentMode = 0; // 0: 25m Focus, 1: Spotify Lo-Fi, 2: Offline Whisper
  let secondsLeft = 1458; // 24m 18s

  const modes = [
    { title: "25m Focus", baseSeconds: 1458, toast: "Focus session active" },
    { title: "Deep Focus • Spotify Lo-Fi", baseSeconds: 1122, toast: "Spotify background integration running" },
    { title: "Offline Whisper Memo", baseSeconds: 252, toast: "Local Whisper transcription active" },
  ];

  const updateDisplay = () => {
    const titleEl = island.querySelector(".island-title");
    const timerEl = island.querySelector(".island-timer");
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    const timeStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    if (titleEl) titleEl.textContent = modes[currentMode].title;
    if (timerEl) timerEl.textContent = timeStr;
  };

  island.addEventListener("click", () => {
    currentMode = (currentMode + 1) % modes.length;
    secondsLeft = modes[currentMode].baseSeconds;
    updateDisplay();
    showToast(`⚡ Dynamic Island: ${modes[currentMode].toast}`);
  });

  // Tick seconds downward live
  setInterval(() => {
    if (secondsLeft > 0) {
      secondsLeft--;
      updateDisplay();
    }
  }, 1000);
}

// 4. Companion Calendar Date Pills (Direct reference reel match: 16, 23, 31)
function initCalendarPills() {
  const pills = document.querySelectorAll(".cal-date-pill");
  const checklistBox = document.querySelector(".companion-checklist-box");
  if (!pills.length || !checklistBox) return;

  const dayTasks = {
    today: [
      { text: "Ship v1.0.0 Windows binary", tag: "Rust", tagCls: "tag-rust", done: true },
      { text: "Record offline Whisper memo", tag: "Voice", tagCls: "tag-audio", done: false },
      { text: "Focus session: binaural 40Hz", tag: "Focus", tagCls: "tag-work", done: false },
    ],
    review: [
      { text: "Verify SQLite to JSON storage", tag: "Audit", tagCls: "tag-rust", done: true },
      { text: "Profile 3.7MB memory footprint", tag: "Perf", tagCls: "tag-audio", done: true },
      { text: "Multimonitor acrylic snapping", tag: "WinUI", tagCls: "tag-work", done: false },
    ],
    launch: [
      { text: "Production release announcement", tag: "Launch", tagCls: "tag-rust", done: false },
      { text: "Publish SHA-256 hash manifest", tag: "Security", tagCls: "tag-audio", done: true },
      { text: "Community feedback triage", tag: "Support", tagCls: "tag-work", done: false },
    ],
  };

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const filter = pill.getAttribute("data-filter") || "today";
      const tasks = dayTasks[filter] || dayTasks.today;

      // Re-render checklist items
      const existingItems = checklistBox.querySelectorAll(".max-task-item");
      existingItems.forEach((it) => it.remove());

      tasks.forEach((t) => {
        const item = document.createElement("div");
        item.className = `max-task-item ${t.done ? "completed" : ""}`;
        item.innerHTML = `
          <span class="max-task-check">${t.done ? "✓" : ""}</span>
          <span>${t.text}</span>
          <span class="task-tag-pill ${t.tagCls}">${t.tag}</span>
        `;
        item.addEventListener("click", () => {
          item.classList.toggle("completed");
          const check = item.querySelector(".max-task-check");
          if (check) check.textContent = item.classList.contains("completed") ? "✓" : "";
          updateChecklistRemaining();
          showToast(item.classList.contains("completed") ? `✓ Completed: "${t.text}"` : `Task pending: "${t.text}"`);
        });
        checklistBox.appendChild(item);
      });

      updateChecklistRemaining();
      const dayNum = pill.querySelector(".cal-day-num")?.textContent;
      showToast(`📅 Sprint Day ${dayNum} tasks active`);
    });
  });
}

// 5. Interactive Companion Task Checklist
function updateChecklistRemaining() {
  const items = document.querySelectorAll(".max-task-item");
  const countBadge = document.getElementById("checklist-remaining-count");
  if (!countBadge || !items.length) return;
  const remaining = Array.from(items).filter((it) => !it.classList.contains("completed")).length;
  countBadge.textContent = `${remaining} left`;
}

function initChecklist() {
  const items = document.querySelectorAll(".max-task-item");
  if (!items.length) return;

  items.forEach((item) => {
    item.addEventListener("click", () => {
      item.classList.toggle("completed");
      const check = item.querySelector(".max-task-check");
      if (check) {
        check.textContent = item.classList.contains("completed") ? "✓" : "";
      }
      updateChecklistRemaining();
      const title = item.querySelector("span:nth-child(2)")?.textContent || "Task";
      if (item.classList.contains("completed")) {
        showToast(`✓ Completed: "${title}"`);
      }
    });
  });

  updateChecklistRemaining();
}

// 6. Sparkline Timeline Tabs & Data Update
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

// 7. Currency / Metric Switcher on Balance Card
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

// 8. Multi-Colored Segmented Meter Interaction & Savings Scaling
function initSegmentedMeter() {
  const segments = document.querySelectorAll(".meter-segment");
  const countEl = document.getElementById("meter-active-count");
  const savingsNumberEl = document.querySelector(".savings-number");
  const savingsHoursBadge = document.querySelector(".card-savings .tactile-sticker.emerald");

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
      const activeUnits = idx + 1;
      if (countEl) countEl.textContent = `${activeUnits} / ${segments.length} Units`;

      // Scale focus savings value dynamically with active units
      if (savingsNumberEl) {
        const scaledVal = 2100 + activeUnits * 105;
        savingsNumberEl.textContent = `$${scaledVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      if (savingsHoursBadge) {
        const hrs = (activeUnits * 0.95).toFixed(1);
        savingsHoursBadge.textContent = `${hrs} hrs/wk`;
      }
    });
  });
}

// 9. Tactile Habit Streaks & Punch-Card with Dynamic Counters
function initPunchCards() {
  const dots = document.querySelectorAll(".punch-dot");
  const h1CountEl = document.getElementById("habit-1-count");
  const h2CountEl = document.getElementById("habit-2-count");
  const streakPtsEl = document.getElementById("habit-streak-pts");
  const streakTitleEl = document.getElementById("habit-streak-title");

  if (!dots.length) return;

  const updatePunchState = () => {
    const row1 = document.getElementById("punch-row-1");
    const row2 = document.getElementById("punch-row-2");

    let count1 = 0;
    let count2 = 0;

    if (row1) {
      count1 = row1.querySelectorAll(".punch-dot.punched").length;
      if (h1CountEl) h1CountEl.textContent = `${count1}/7 Days`;
    }

    if (row2) {
      count2 = row2.querySelectorAll(".punch-dot.punched-green").length;
      if (h2CountEl) h2CountEl.textContent = `${count2}/7 Days`;
    }

    const totalActive = count1 + count2;
    const pts = 120 + totalActive * 10;
    if (streakPtsEl) streakPtsEl.textContent = `+${pts} pts`;

    if (count1 === 7 && count2 === 7) {
      if (streakTitleEl) streakTitleEl.textContent = "🏆 Perfect 7/7 Week Completed!";
    } else {
      if (streakTitleEl) streakTitleEl.textContent = "18-Day Focus Streak Active";
    }
  };

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const isGreen = dot.classList.contains("punch-dot-green");
      const isAlreadyPunched = dot.classList.contains("punched") || dot.classList.contains("punched-green");

      if (isAlreadyPunched) {
        dot.classList.remove("punched", "punched-green");
        dot.textContent = dot.getAttribute("data-day") || "•";
      } else {
        if (isGreen) {
          dot.classList.add("punched-green");
        } else {
          dot.classList.add("punched");
        }
        dot.textContent = "✓";
      }

      updatePunchState();

      if (!isAlreadyPunched) {
        showToast("🎯 Habit punched! Keep the momentum!");
      }
    });
  });

  updatePunchState();
}

// 10. Ambient Focus Soundscape Studio (Web Audio API Synthesizer with Zero-Click Fades)
function initSoundscapeStudio() {
  const playBtn = document.getElementById("sound-play-toggle");
  const eqBars = document.querySelectorAll(".eq-bar");
  const soundTiles = document.querySelectorAll(".sound-tile");
  const volumeSlider = document.getElementById("sound-volume-slider");

  let audioCtx = null;
  let isPlaying = false;
  let activeNodes = [];
  let masterGain = null;
  let activeType = "rain"; // rain, coffee, lofi, binaural

  const ensureAudio = () => {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(volumeSlider ? Number(volumeSlider.value) / 100 : 0.45, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  };

  const stopActiveNodes = () => {
    if (!activeNodes.length) return;
    const now = audioCtx ? audioCtx.currentTime : 0;
    activeNodes.forEach((node) => {
      try {
        if (node.gain) {
          // Smooth 40ms fade-out to completely prevent audio clicks
          node.gain.setValueAtTime(node.gain.value, now);
          node.gain.linearRampToValueAtTime(0.0001, now + 0.04);
        }
        setTimeout(() => {
          try {
            if (node.stop) node.stop();
            if (node.disconnect) node.disconnect();
          } catch (_) {}
        }, 50);
      } catch (_) {}
    });
    activeNodes = [];
  };

  const startSound = (type) => {
    ensureAudio();
    if (!audioCtx || !masterGain) return;
    stopActiveNodes();

    const now = audioCtx.currentTime;

    if (type === "binaural") {
      // True Stereo 40Hz Gamma Binaural Beats (210 Hz Left ear, 250 Hz Right ear)
      const oscL = audioCtx.createOscillator();
      const oscR = audioCtx.createOscillator();
      const gainL = audioCtx.createGain();
      const gainR = audioCtx.createGain();

      gainL.gain.setValueAtTime(0.001, now);
      gainL.gain.linearRampToValueAtTime(0.2, now + 0.06);

      gainR.gain.setValueAtTime(0.001, now);
      gainR.gain.linearRampToValueAtTime(0.2, now + 0.06);

      oscL.frequency.value = 210; // Left channel: 210 Hz
      oscR.frequency.value = 250; // Right channel: 250 Hz -> 40 Hz gamma difference

      // Check for StereoPannerNode support
      if (audioCtx.createStereoPanner) {
        const panL = audioCtx.createStereoPanner();
        const panR = audioCtx.createStereoPanner();
        panL.pan.value = -0.9;
        panR.pan.value = 0.9;

        oscL.connect(gainL).connect(panL).connect(masterGain);
        oscR.connect(gainR).connect(panR).connect(masterGain);
      } else {
        oscL.connect(gainL).connect(masterGain);
        oscR.connect(gainR).connect(masterGain);
      }

      oscL.start(now);
      oscR.start(now);

      activeNodes.push({
        gain: gainL.gain,
        stop: () => {
          oscL.stop();
          oscR.stop();
        },
        disconnect: () => {
          oscL.disconnect();
          oscR.disconnect();
        },
      });
    } else if (type === "lofi") {
      // Warm Analog Tape Drone: Mellow Triad Drone (C3, Eb3, G3) with subtle tape flutter
      const freqs = [130.81, 155.56, 196.0]; // C minor warm triad
      const lofiGain = audioCtx.createGain();
      lofiGain.gain.setValueAtTime(0.001, now);
      lofiGain.gain.linearRampToValueAtTime(0.18, now + 0.06);

      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 420;

      const oscList = freqs.map((f, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f + (i === 1 ? 0.3 : -0.2); // subtle analog detune
        osc.connect(filter);
        osc.start(now);
        return osc;
      });

      filter.connect(lofiGain).connect(masterGain);

      activeNodes.push({
        gain: lofiGain.gain,
        stop: () => oscList.forEach((o) => o.stop()),
        disconnect: () => {
          oscList.forEach((o) => o.disconnect());
          filter.disconnect();
        },
      });
    } else {
      // Noise-based generators: Rain (gentle lowpass brown noise) or Coffee Shop (resonant dual-band murmur)
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Warm brown noise integration
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 2.8;
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const sourceGain = audioCtx.createGain();
      sourceGain.gain.setValueAtTime(0.001, now);
      sourceGain.gain.linearRampToValueAtTime(0.38, now + 0.06);

      const filter1 = audioCtx.createBiquadFilter();
      if (type === "rain") {
        filter1.type = "lowpass";
        filter1.frequency.value = 680;
      } else {
        // Coffee Shop: warm dual-band acoustic murmur
        filter1.type = "bandpass";
        filter1.frequency.value = 420;
        filter1.Q.value = 1.2;
      }

      whiteNoise.connect(filter1).connect(sourceGain).connect(masterGain);
      whiteNoise.start(now);

      activeNodes.push({
        gain: sourceGain.gain,
        stop: () => whiteNoise.stop(),
        disconnect: () => {
          whiteNoise.disconnect();
          filter1.disconnect();
        },
      });
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
        stopActiveNodes();
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
      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(val, audioCtx.currentTime);
      }
    });
  }
}

// 11. Natural Language Parser Live Demo (Full Day & Duration Support)
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

    // 1. Extract tags (#work, @marketing, ~journal)
    const tagMatch = text.match(/[#@~]([a-zA-Z0-9_-]+)/);
    if (tagMatch) {
      tag = tagMatch[1];
      text = text.replace(tagMatch[0], "").trim();
    }

    // 2. Extract priority (!urgent, !high, !p1, !p2)
    if (/!(urgent|high|p1)/i.test(text)) {
      priority = "⚡ Urgent / High";
      text = text.replace(/!(urgent|high|p1)/i, "").trim();
    } else if (/!(med|medium|p2)/i.test(text)) {
      priority = "Medium";
      text = text.replace(/!(med|medium|p2)/i, "").trim();
    }

    // 3. Extract duration (e.g. 90m, 45m, 2h, 25 mins)
    const durMatch = text.match(/\b(\d{1,3}\s*(?:m|min|mins|minutes|h|hr|hours))\b/i);
    let durText = "";
    if (durMatch) {
      durText = ` (${durMatch[1]})`;
      text = text.replace(durMatch[0], "").trim();
    }

    // 4. Extract recurring patterns
    if (/every day|daily/i.test(text)) {
      date = "Recurring Daily";
      text = text.replace(/every day|daily/i, "").trim();
    } else if (/every week|weekly/i.test(text)) {
      date = "Recurring Weekly";
      text = text.replace(/every week|weekly/i, "").trim();
    }

    // 5. Extract days of week (monday through sunday)
    const dayOfWeekMatch = text.match(/\b(?:next\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dayOfWeekMatch) {
      const dayName = dayOfWeekMatch[1].charAt(0).toUpperCase() + dayOfWeekMatch[1].slice(1).toLowerCase();
      date = `This ${dayName}`;
      text = text.replace(dayOfWeekMatch[0], "").trim();
    }

    // 6. Extract relative dates (tomorrow, today)
    if (/\btomorrow\b/i.test(text)) {
      date = "Tomorrow";
      text = text.replace(/\btomorrow\b/i, "").trim();
    } else if (/\btoday\b/i.test(text)) {
      date = "Today";
      text = text.replace(/\btoday\b/i, "").trim();
    }

    // 7. Extract time of day (e.g. at 3pm, 4:30pm, 10am)
    const timeMatch = text.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (timeMatch) {
      date += ` • ${timeMatch[1].toUpperCase()}`;
      text = text.replace(timeMatch[0], "").trim();
    }

    // Clean up residual prepositions like trailing "at" or leading commas
    text = text.replace(/\s+at\s*$/i, "").replace(/^,\s*/, "").trim();

    if (titleOut) titleOut.textContent = (text || raw) + durText;
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

// 12. Offline Whisper Tester Simulator
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

// 13. Verified SHA-256 Copy Button & Code Click
function initSha256Copy() {
  const btn = document.getElementById("btn-copy-sha256");
  const hashEl = document.getElementById("sha256-val");
  const hashText = "955a2f3ade41f34584e5cd463cd37042d24d9440e6dd8967ad3d715837622053";

  const copyAction = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(hashText);
      } else {
        const temp = document.createElement("textarea");
        temp.value = hashText;
        temp.setAttribute("readonly", "");
        temp.style.position = "absolute";
        temp.style.left = "-9999px";
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      if (btn) btn.textContent = "✓ Copied!";
      showToast("✓ Verified SHA-256 copied to clipboard!");
      setTimeout(() => {
        if (btn) btn.textContent = "Copy SHA-256";
      }, 2400);
    } catch (_) {
      showToast("Hash: " + hashText.slice(0, 16) + "...");
    }
  };

  if (btn) btn.addEventListener("click", copyAction);
  if (hashEl) {
    hashEl.style.cursor = "pointer";
    hashEl.title = "Click to copy verified SHA-256 hash";
    hashEl.addEventListener("click", copyAction);
  }
}

// 14. Visual Gallery Lightbox Modal with Caption & Keyboard Accessibility
function initGalleryModal() {
  const modal = document.getElementById("gallery-modal");
  const modalImg = document.getElementById("modal-img");
  const modalCaption = document.getElementById("modal-caption");
  const closeBtn = document.getElementById("modal-close");
  const items = document.querySelectorAll(".gallery-item");

  if (!modal || !modalImg) return;

  const openLightbox = (item) => {
    const img = item.querySelector("img");
    const captionText = item.querySelector(".gallery-caption span:first-child")?.textContent || "Windows Interface";
    if (img) {
      modalImg.src = img.src;
      if (modalCaption) modalCaption.textContent = captionText;
      modal.classList.add("active");
    }
  };

  items.forEach((item) => {
    item.addEventListener("click", () => openLightbox(item));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(item);
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
