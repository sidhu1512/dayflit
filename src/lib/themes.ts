import type { Settings } from "./types";

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  accent: string;
  accentFg: string;
  glow: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  light: Palette;
  dark: Palette;
}

const p = (o: Palette) => o;

export const THEMES: Theme[] = [
  {
    id: "graphite",
    name: "Graphite",
    description: "Neutral glass with a cool blue accent",
    dark: p({ bg: "16 17 22", surface: "26 27 34", surface2: "36 38 47", surface3: "48 50 62", text: "236 238 244", textMuted: "160 165 180", textFaint: "110 115 130", border: "255 255 255", accent: "96 150 255", accentFg: "255 255 255", glow: "96 150 255" }),
    light: p({ bg: "246 247 250", surface: "255 255 255", surface2: "241 243 248", surface3: "229 232 240", text: "24 26 33", textMuted: "88 94 110", textFaint: "140 146 162", border: "20 24 40", accent: "48 112 235", accentFg: "255 255 255", glow: "48 112 235" }),
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic blues and calm frost tones",
    dark: p({ bg: "36 41 51", surface: "46 52 64", surface2: "59 66 82", surface3: "67 76 94", text: "236 239 244", textMuted: "170 180 195", textFaint: "120 130 150", border: "255 255 255", accent: "136 192 208", accentFg: "24 30 40", glow: "136 192 208" }),
    light: p({ bg: "236 239 244", surface: "248 249 251", surface2: "229 233 240", surface3: "216 222 233", text: "46 52 64", textMuted: "90 100 120", textFaint: "140 150 170", border: "46 52 64", accent: "94 129 172", accentFg: "255 255 255", glow: "94 129 172" }),
  },
  {
    id: "rose",
    name: "Rosé",
    description: "Soft pinks and mauves inspired by dusk",
    dark: p({ bg: "25 23 36", surface: "31 29 46", surface2: "38 35 58", surface3: "50 46 74", text: "224 222 244", textMuted: "160 154 190", textFaint: "110 106 140", border: "255 255 255", accent: "235 111 146", accentFg: "255 255 255", glow: "235 111 146" }),
    light: p({ bg: "250 244 237", surface: "255 250 243", surface2: "242 233 225", surface3: "230 218 208", text: "87 82 121", textMuted: "121 117 147", textFaint: "152 147 165", border: "87 82 121", accent: "180 99 122", accentFg: "255 255 255", glow: "180 99 122" }),
  },
  {
    id: "forest",
    name: "Forest",
    description: "Deep greens with a warm moss accent",
    dark: p({ bg: "16 24 20", surface: "23 33 28", surface2: "31 44 38", surface3: "42 58 50", text: "230 240 234", textMuted: "150 175 160", textFaint: "100 125 110", border: "255 255 255", accent: "94 200 140", accentFg: "10 25 16", glow: "94 200 140" }),
    light: p({ bg: "240 246 241", surface: "252 255 252", surface2: "230 240 232", surface3: "212 228 216", text: "22 40 30", textMuted: "70 100 82", textFaint: "120 150 132", border: "22 40 30", accent: "34 140 84", accentFg: "255 255 255", glow: "34 140 84" }),
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Midnight navy with teal highlights",
    dark: p({ bg: "9 17 30", surface: "14 25 42", surface2: "20 34 56", surface3: "30 48 76", text: "226 236 250", textMuted: "150 172 200", textFaint: "100 122 150", border: "255 255 255", accent: "56 200 220", accentFg: "6 20 30", glow: "56 200 220" }),
    light: p({ bg: "238 245 250", surface: "252 254 255", surface2: "226 238 246", surface3: "206 224 236", text: "18 36 56", textMuted: "70 96 120", textFaint: "120 146 170", border: "18 36 56", accent: "0 140 170", accentFg: "255 255 255", glow: "0 140 170" }),
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm amber and coral glow",
    dark: p({ bg: "26 18 20", surface: "36 24 26", surface2: "50 32 34", surface3: "66 42 44", text: "248 236 230", textMuted: "196 170 160", textFaint: "140 116 108", border: "255 255 255", accent: "255 150 90", accentFg: "40 16 8", glow: "255 130 80" }),
    light: p({ bg: "253 246 240", surface: "255 252 248", surface2: "250 238 228", surface3: "240 222 208", text: "52 32 26", textMuted: "120 92 80", textFaint: "170 140 128", border: "52 32 26", accent: "226 98 52", accentFg: "255 255 255", glow: "226 98 52" }),
  },
  {
    id: "mono",
    name: "Mono",
    description: "Pure monochrome, high contrast",
    dark: p({ bg: "8 8 8", surface: "18 18 18", surface2: "30 30 30", surface3: "44 44 44", text: "245 245 245", textMuted: "170 170 170", textFaint: "110 110 110", border: "255 255 255", accent: "255 255 255", accentFg: "0 0 0", glow: "255 255 255" }),
    light: p({ bg: "255 255 255", surface: "255 255 255", surface2: "243 243 243", surface3: "226 226 226", text: "10 10 10", textMuted: "90 90 90", textFaint: "150 150 150", border: "0 0 0", accent: "0 0 0", accentFg: "255 255 255", glow: "0 0 0" }),
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Violet haze with an electric accent",
    dark: p({ bg: "19 16 32", surface: "28 24 46", surface2: "38 33 62", surface3: "52 46 84", text: "236 232 250", textMuted: "170 162 205", textFaint: "118 110 150", border: "255 255 255", accent: "160 120 255", accentFg: "255 255 255", glow: "160 120 255" }),
    light: p({ bg: "246 243 252", surface: "255 255 255", surface2: "238 233 250", surface3: "224 216 244", text: "40 32 70", textMuted: "100 90 140", textFaint: "150 140 180", border: "40 32 70", accent: "118 76 230", accentFg: "255 255 255", glow: "118 76 230" }),
  },
];

export const ACCENT_PRESETS = ["#6096ff", "#38c8dc", "#5ec88c", "#f5b942", "#ff9660", "#eb6f92", "#a078ff", "#ffffff"];

export function hexToRgbTriplet(hex: string): string | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function luminance(triplet: string): number {
  const [r, g, b] = triplet.split(" ").map((x) => parseInt(x, 10) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function resolveDark(mode: Settings["appearance"]["mode"]): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

export function applyTheme(a: Settings["appearance"], root?: HTMLElement) {
  if (typeof document === "undefined" && !root) return;
  const target = root ?? document.documentElement;
  const theme = THEMES.find((t) => t.id === a.themeId) ?? THEMES[0];
  const dark = resolveDark(a.mode);
  const pal = dark ? theme.dark : theme.light;
  const accent = (a.accent && hexToRgbTriplet(a.accent)) || pal.accent;
  const accentFg = luminance(accent) > 0.5 ? "10 10 14" : "255 255 255";
  const s = target.style;
  s.setProperty("--bg", pal.bg);
  s.setProperty("--surface", pal.surface);
  s.setProperty("--surface-2", pal.surface2);
  s.setProperty("--surface-3", pal.surface3);
  s.setProperty("--text", pal.text);
  s.setProperty("--text-muted", pal.textMuted);
  s.setProperty("--text-faint", pal.textFaint);
  s.setProperty("--border", pal.border);
  s.setProperty("--accent", accent);
  s.setProperty("--accent-fg", accentFg);
  s.setProperty("--glow", a.accent ? accent : pal.glow);
  s.setProperty("--opacity", String(Math.min(1, Math.max(0.35, a.opacity))));
  s.setProperty("--radius", `${a.radius}px`);
  let adjustedFontSize = a.fontSize;
  let lineHeight = "1.4";
  if (a.fontFamily === "sacramento") {
    adjustedFontSize = Math.round(a.fontSize * 1.22);
    lineHeight = "1.35";
  } else if (a.fontFamily === "pacifico") {
    adjustedFontSize = Math.max(11, Math.round(a.fontSize * 0.91));
    lineHeight = "1.25";
  } else if (a.fontFamily === "caveat") {
    adjustedFontSize = Math.round(a.fontSize * 1.08);
    lineHeight = "1.32";
  }
  s.setProperty("--font-size", `${adjustedFontSize}px`);
  s.setProperty("--line-height", lineHeight);
  s.setProperty("--density", a.density === "compact" ? "0.82" : a.density === "spacious" ? "1.18" : "1");
  const fonts: Record<string, string> = {
    system: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif',
    inter: 'Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    sacramento: 'Sacramento, "Segoe UI Variable Text", cursive, sans-serif',
    pacifico: 'Pacifico, "Segoe UI Variable Text", cursive, sans-serif',
    caveat: 'Caveat, "Segoe UI Variable Text", cursive, sans-serif',
  };
  s.setProperty("--font", fonts[a.fontFamily] ?? fonts.system);
  target.dataset.theme = theme.id;
  target.dataset.font = a.fontFamily;
  target.dataset.mode = dark ? "dark" : "light";
  target.dataset.material = a.material;
  target.dataset.motion = a.reduceMotion ? "reduce" : "full";
  target.dataset.glow = a.showBackgroundGlow ? "on" : "off";
  target.style.colorScheme = dark ? "dark" : "light";
  return { dark, theme };
}
