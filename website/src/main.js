import { SITE } from "./config.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- config → DOM
$$("[data-version]").forEach((e) => (e.textContent = SITE.version));
$$("[data-size]").forEach((e) => (e.textContent = SITE.installerSize));
$$("[data-year]").forEach((e) => (e.textContent = String(new Date().getFullYear())));
if (SITE.sha256) $$("[data-sha]").forEach((e) => (e.textContent = SITE.sha256));
if (SITE.releaseDate) $$("[data-date]").forEach((e) => (e.textContent = SITE.releaseDate));
const link = (attr, url) => $$(`[${attr}]`).forEach((a) => { if (url) { a.href = url; a.removeAttribute("aria-disabled"); } else { a.setAttribute("aria-disabled", "true"); a.addEventListener("click", (ev) => { ev.preventDefault(); toast("Link not configured yet"); }); } });
link("data-download", SITE.downloadUrl);
link("data-releases", SITE.releasesUrl);
link("data-beta", SITE.betaUrl);
link("data-docs", SITE.docsUrl);
link("data-support", SITE.supportUrl);
link("data-contact", SITE.contactUrl);
link("data-privacy", SITE.privacyUrl);
link("data-source", SITE.sourceUrl);
if (SITE.analytics.plausibleDomain) {
  const s = document.createElement("script");
  s.defer = true;
  s.dataset.domain = SITE.analytics.plausibleDomain;
  s.src = "https://plausible.io/js/script.js";
  document.head.appendChild(s);
}
// demo video
const video = $("[data-video-placeholder]");
if (video && SITE.demoVideoUrl) {
  video.innerHTML = /youtube|vimeo/.test(SITE.demoVideoUrl)
    ? `<iframe src="${SITE.demoVideoUrl}" title="Sid demo video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
    : `<video controls preload="metadata" poster="./shots/today-dark.png" src="${SITE.demoVideoUrl}"></video>`;
}

function toast(msg) {
  let t = $(".site-toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "site-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("on"), 2200);
}

// ---------- mobile nav
const menuBtn = $(".menu-btn");
const mobileNav = $("#mobile-nav");
menuBtn?.addEventListener("click", () => {
  const open = mobileNav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.classList.toggle("open", open);
});
$$("#mobile-nav a").forEach((a) => a.addEventListener("click", () => { mobileNav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.classList.remove("open"); }));

// ---------- scroll reveal
const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
$$(".reveal").forEach((el) => (reduce ? el.classList.add("in") : io.observe(el)));

// ---------- header shadow
const top = $(".top");
addEventListener("scroll", () => top.classList.toggle("scrolled", scrollY > 8), { passive: true });

// ---------- hero typing demo
const phrases = [
  { text: "Call Sam tomorrow 3pm #work !high", chips: ["Tomorrow · 3 PM", "high", "#work"], add: "Call Sam" },
  { text: "Pay rent every 1st !urgent", chips: ["Monthly on the 1st", "urgent"], add: "Pay rent" },
  { text: "Draft launch notes for 45m next monday", chips: ["Monday", "45m"], add: "Draft launch notes" },
];
const typed = $("#fw-typed");
const chips = $("#fw-chips");
const list = $("#fw-list");
const count = $("#fw-count");
async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function typeLoop() {
  if (reduce || !typed) return;
  let i = 0;
  for (;;) {
    const p = phrases[i % phrases.length];
    typed.textContent = "";
    chips.innerHTML = "";
    for (const ch of p.text) {
      typed.textContent += ch;
      if (typed.textContent.length === Math.floor(p.text.length * 0.6)) chips.innerHTML = p.chips.slice(0, 1).map((c) => `<span>${c}</span>`).join("");
      await wait(38 + Math.random() * 40);
    }
    chips.innerHTML = p.chips.map((c) => `<span>${c}</span>`).join("");
    await wait(900);
    const li = document.createElement("li");
    li.innerHTML = `<span class="fw-check"></span><span>${p.add}</span><em>${p.chips[0]}</em>`;
    li.classList.add("new");
    list.prepend(li);
    count.textContent = String(list.children.length);
    typed.textContent = "";
    chips.innerHTML = "";
    await wait(1600);
    if (list.children.length > 4) list.lastElementChild.remove();
    count.textContent = String(list.children.length);
    i++;
    await wait(600);
  }
}
typeLoop();

// hero timer tick
const fwTimer = $("#fw-timer");
const pipTime = $("#pip-time");
let secs = 25 * 60;
setInterval(() => {
  if (reduce) return;
  secs = secs <= 0 ? 25 * 60 : secs - 1;
  const t = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  if (fwTimer) fwTimer.textContent = t;
  if (pipTime) pipTime.textContent = t;
}, 1000);

// ---------- voice demo
const bars = $("#dv-bars");
if (bars) {
  for (let i = 0; i < 22; i++) bars.appendChild(document.createElement("i"));
  const items = $$("i", bars);
  setInterval(() => { if (!reduce) items.forEach((b) => (b.style.height = `${20 + Math.random() * 80}%`)); }, 120);
}
const transcript = $("#dv-transcript");
if (transcript && !reduce) {
  const full = transcript.textContent;
  let k = 0;
  setInterval(() => {
    k = (k + 1) % (full.length + 25);
    transcript.textContent = full.slice(0, Math.min(full.length, k));
  }, 55);
}

// ---------- heatmap demo
const heat = $("#demo-heat");
if (heat) {
  const weeks = 30;
  for (let w = 0; w < weeks; w++) {
    const col = document.createElement("div");
    for (let d = 0; d < 7; d++) {
      const c = document.createElement("i");
      const r = Math.random();
      const lvl = w > weeks - 14 ? (r < 0.15 ? 0 : r < 0.4 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : 4) : r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : r < 0.95 ? 3 : 4;
      c.dataset.l = String(lvl);
      c.style.animationDelay = `${(w * 7 + d) * 12}ms`;
      col.appendChild(c);
    }
    heat.appendChild(col);
  }
}

// ---------- gallery theme toggle + lightbox
$$("[data-theme-pick]").forEach((b) =>
  b.addEventListener("click", () => {
    $$("[data-theme-pick]").forEach((x) => x.classList.toggle("on", x === b));
    const mode = b.dataset.themePick;
    $$("#gallery-grid img").forEach((img) => (img.src = `./shots/${img.dataset.shot}-${mode}.png`));
  }),
);
const lb = $("#lightbox");
const lbImg = $("img", lb);
$$("#gallery-grid img, .shot img").forEach((img) =>
  img.addEventListener("click", () => {
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lb.hidden = false;
    $(".lb-close", lb).focus();
  }),
);
const closeLb = () => (lb.hidden = true);
$(".lb-close", lb).addEventListener("click", closeLb);
lb.addEventListener("click", (e) => e.target === lb && closeLb());
addEventListener("keydown", (e) => e.key === "Escape" && !lb.hidden && closeLb());
