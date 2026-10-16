/**
 * Pure TypeScript color detection, parsing, conversion, WCAG contrast,
 * and harmony generation for Smart Object Cards.
 */

export interface ColorHarmony {
  name: string;
  hex: string;
  hsl: string;
  role: "primary" | "complementary" | "analogous" | "triadic" | "tint" | "shade";
}

export interface ColorAnalysis {
  original: string;
  hex: string;
  rgb: string;
  hsl: string;
  r: number;
  g: number;
  b: number;
  a: number;
  h: number;
  s: number;
  l: number;
  luminance: number;
  contrastOnWhite: number;
  contrastOnBlack: number;
  bestTextColor: "#ffffff" | "#000000";
  wcagWhiteRating: "AAA" | "AA" | "Fail";
  wcagBlackRating: "AAA" | "AA" | "Fail";
  harmonies: ColorHarmony[];
}

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_REGEX = /^rgba?\s*\(\s*(\d{1,3}%?)(?:[\s,]+)(\d{1,3}%?)(?:[\s,]+)(\d{1,3}%?)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i;
const HSL_REGEX = /^hsla?\s*\(\s*([0-9.]+)(?:deg)?(?:[\s,]+)([0-9.]+)%(?:[\s,]+)([0-9.]+)%(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i;
const OKLCH_REGEX = /^oklch\s*\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i;

export interface ParsedQuote {
  quote: string;
  author?: string;
}

export function parseQuoteString(text: string): ParsedQuote | null {
  if (!text) return null;
  const t = text.trim();
  // Matches "Quote..." - Author, "Quote..." — Author, “Quote...”, etc.
  const match = t.match(/^["“'](?<quote>[\s\S]+?)["”'](?:\s*[-—–]\s*(?<author>[^"”\n\r]+))?$/);
  if (match && match.groups?.quote) {
    const q = match.groups.quote.trim();
    if (q.length > 2) {
      return {
        quote: q,
        author: match.groups.author?.trim(),
      };
    }
  }
  return null;
}

export function isColorString(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return (
    HEX_REGEX.test(trimmed) ||
    RGB_REGEX.test(trimmed) ||
    HSL_REGEX.test(trimmed) ||
    OKLCH_REGEX.test(trimmed)
  );
}

export function parseColor(input: string): ColorAnalysis | null {
  const trimmed = input.trim();

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;

  // 1. HEX
  const hexMatch = trimmed.match(HEX_REGEX);
  if (hexMatch) {
    const raw = hexMatch[1];
    if (raw.length === 3 || raw.length === 4) {
      r = parseInt(raw[0] + raw[0], 16);
      g = parseInt(raw[1] + raw[1], 16);
      b = parseInt(raw[2] + raw[2], 16);
      if (raw.length === 4) a = parseInt(raw[3] + raw[3], 16) / 255;
    } else {
      r = parseInt(raw.slice(0, 2), 16);
      g = parseInt(raw.slice(2, 4), 16);
      b = parseInt(raw.slice(4, 6), 16);
      if (raw.length === 8) a = parseInt(raw.slice(6, 8), 16) / 255;
    }
  } else {
    // 2. RGB
    const rgbMatch = trimmed.match(RGB_REGEX);
    if (rgbMatch) {
      r = parseRgbChannel(rgbMatch[1]);
      g = parseRgbChannel(rgbMatch[2]);
      b = parseRgbChannel(rgbMatch[3]);
      if (rgbMatch[4]) {
        a = rgbMatch[4].endsWith("%")
          ? parseFloat(rgbMatch[4]) / 100
          : parseFloat(rgbMatch[4]);
      }
    } else {
      // 3. HSL
      const hslMatch = trimmed.match(HSL_REGEX);
      if (hslMatch) {
        const h = (parseFloat(hslMatch[1]) % 360 + 360) % 360;
        const s = Math.max(0, Math.min(100, parseFloat(hslMatch[2]))) / 100;
        const l = Math.max(0, Math.min(100, parseFloat(hslMatch[3]))) / 100;
        const rgb = hslToRgbValues(h, s, l);
        r = rgb.r;
        g = rgb.g;
        b = rgb.b;
        if (hslMatch[4]) {
          a = hslMatch[4].endsWith("%")
            ? parseFloat(hslMatch[4]) / 100
            : parseFloat(hslMatch[4]);
        }
      } else {
        // 4. OKLCH (approximate conversion to sRGB for display)
        const oklchMatch = trimmed.match(OKLCH_REGEX);
        if (oklchMatch) {
          const lRaw = oklchMatch[1].endsWith("%")
            ? parseFloat(oklchMatch[1]) / 100
            : parseFloat(oklchMatch[1]);
          const cRaw = parseFloat(oklchMatch[2]);
          const hRaw = parseFloat(oklchMatch[3]);
          const rgb = oklchToRgbValues(lRaw, cRaw, hRaw);
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          if (oklchMatch[4]) {
            a = oklchMatch[4].endsWith("%")
              ? parseFloat(oklchMatch[4]) / 100
              : parseFloat(oklchMatch[4]);
          }
        } else {
          return null;
        }
      }
    }
  }

  r = Math.max(0, Math.min(255, Math.round(r)));
  g = Math.max(0, Math.min(255, Math.round(g)));
  b = Math.max(0, Math.min(255, Math.round(b)));
  a = Math.max(0, Math.min(1, Math.round(a * 100) / 100));

  const hex = rgbToHex(r, g, b, a);
  const rgb = a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  const hslValues = rgbToHslValues(r, g, b);
  const h = hslValues.h;
  const s = hslValues.s;
  const l = hslValues.l;
  const hsl = a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)`;

  const luminance = getRelativeLuminance(r, g, b);
  const whiteLum = 1.0;
  const blackLum = 0.0;
  const contrastOnWhite = Math.round(((whiteLum + 0.05) / (luminance + 0.05)) * 10) / 10;
  const contrastOnBlack = Math.round(((luminance + 0.05) / (blackLum + 0.05)) * 10) / 10;

  const bestTextColor: "#ffffff" | "#000000" =
    contrastOnBlack > contrastOnWhite ? "#000000" : "#ffffff";

  const getWcag = (ratio: number): "AAA" | "AA" | "Fail" => {
    if (ratio >= 7) return "AAA";
    if (ratio >= 4.5) return "AA";
    return "Fail";
  };

  const harmonies: ColorHarmony[] = [
    {
      name: "Complementary",
      role: "complementary",
      ...makeHslColor((h + 180) % 360, s, l),
    },
    {
      name: "Analogous -30°",
      role: "analogous",
      ...makeHslColor((h - 30 + 360) % 360, s, l),
    },
    {
      name: "Analogous +30°",
      role: "analogous",
      ...makeHslColor((h + 30) % 360, s, l),
    },
    {
      name: "Triadic +120°",
      role: "triadic",
      ...makeHslColor((h + 120) % 360, s, l),
    },
    {
      name: "Tint (+20% L)",
      role: "tint",
      ...makeHslColor(h, s, Math.min(95, l + 20)),
    },
    {
      name: "Shade (-20% L)",
      role: "shade",
      ...makeHslColor(h, s, Math.max(5, l - 20)),
    },
  ];

  return {
    original: trimmed,
    hex,
    rgb,
    hsl,
    r,
    g,
    b,
    a,
    h,
    s,
    l,
    luminance: Math.round(luminance * 1000) / 1000,
    contrastOnWhite,
    contrastOnBlack,
    bestTextColor,
    wcagWhiteRating: getWcag(contrastOnWhite),
    wcagBlackRating: getWcag(contrastOnBlack),
    harmonies,
  };
}

function parseRgbChannel(val: string): number {
  if (val.endsWith("%")) {
    return (parseFloat(val) / 100) * 255;
  }
  return parseFloat(val);
}

function rgbToHex(r: number, g: number, b: number, a = 1): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  if (a < 1) {
    const alphaHex = Math.round(a * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`.toLowerCase();
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
}

function rgbToHslValues(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) * 60;
    } else if (max === gNorm) {
      h = ((bNorm - rNorm) / delta + 2) * 60;
    } else {
      h = ((rNorm - gNorm) / delta + 4) * 60;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgbValues(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c;
    gPrime = x;
    bPrime = 0;
  } else if (h >= 60 && h < 120) {
    rPrime = x;
    gPrime = c;
    bPrime = 0;
  } else if (h >= 120 && h < 180) {
    rPrime = 0;
    gPrime = c;
    bPrime = x;
  } else if (h >= 180 && h < 240) {
    rPrime = 0;
    gPrime = x;
    bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x;
    gPrime = 0;
    bPrime = c;
  } else {
    rPrime = c;
    gPrime = 0;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

function makeHslColor(h: number, s: number, l: number): { hex: string; hsl: string } {
  const rgb = hslToRgbValues(h, s / 100, l / 100);
  return {
    hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    hsl: `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`,
  };
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const sRgb = [r, g, b].map((v) => {
    const val = v / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRgb[0] + 0.7152 * sRgb[1] + 0.0722 * sRgb[2];
}

function oklchToRgbValues(l: number, c: number, h: number): { r: number; g: number; b: number } {
  // Approximate conversion from OKLCH to sRGB
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lCube = l_ * l_ * l_;
  const mCube = m_ * m_ * m_;
  const sCube = s_ * s_ * s_;

  const rLinear = +4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube;
  const gLinear = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube;
  const bLinear = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube;

  const toGamma = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  return {
    r: Math.round(toGamma(rLinear) * 255),
    g: Math.round(toGamma(gLinear) * 255),
    b: Math.round(toGamma(bLinear) * 255),
  };
}
