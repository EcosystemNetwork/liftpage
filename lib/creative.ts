/*
 * Creative Studio, pure part: the brand kit, the shapes a model returns for carousels and
 * short-form video scripts, and a renderer that draws a carousel slide as a branded SVG.
 * No image model: slides are drawn from the kit, so they're on-brand, repeatable, and free.
 * Safe to import from client components (the desk turns the SVG into a PNG).
 */

export type BrandKit = {
  background: string;
  text: string;
  accent: string;
  font: "sans" | "serif" | "mono";
  /** Shown on every slide's footer, e.g. "@acme" or "acme.com". */
  signature: string;
};

export const DEFAULT_KIT: BrandKit = { background: "#0f172a", text: "#f8fafc", accent: "#f59e0b", font: "sans", signature: "" };

export const FONT_STACK: Record<BrandKit["font"], string> = {
  sans: "Inter, 'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', Menlo, Consolas, monospace",
};

const HEX = /^#[0-9a-f]{6}$/i;

function hexOr(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (HEX.test(text)) return text;
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${[...text.slice(1)].map((c) => c + c).join("")}`;
  return fallback;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Cleans a kit from a form or the database. If the text colour would be hard to read on the
 * background (under 4.5:1), it's swapped for black or white, whichever reads better.
 */
export function cleanKit(raw: unknown): BrandKit {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const background = hexOr(input.background, DEFAULT_KIT.background);
  let text = hexOr(input.text, DEFAULT_KIT.text);
  if (contrast(text, background) < 4.5) text = contrast("#ffffff", background) >= contrast("#000000", background) ? "#ffffff" : "#000000";
  const font = input.font === "serif" || input.font === "mono" ? input.font : "sans";
  const signature = typeof input.signature === "string" ? input.signature.trim().slice(0, 40) : "";
  return { background, text, accent: hexOr(input.accent, DEFAULT_KIT.accent), font, signature };
}

/* ---------- Model output ---------- */

export type Slide = { heading: string; body: string };
export type Carousel = { title: string; slides: Slide[]; caption: string };

export type Beat = { at: string; say: string; onScreen: string; shot: string };
export type VideoScript = { title: string; hook: string; beats: Beat[]; caption: string; seconds: number };

function json(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const items = (value: unknown, max: number) =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object").slice(0, max) : [];

/** 4–10 slides, each with a short heading; the first is the cover, the last the ask. */
export function parseCarousel(text: string): Carousel | null {
  const raw = json(text);
  if (!raw) return null;
  const slides = items(raw.slides, 10)
    .map((slide) => ({ heading: str(slide.heading, 90), body: str(slide.body, 260) }))
    .filter((slide) => slide.heading);
  if (slides.length < 4) return null;
  return { title: str(raw.title, 120) || slides[0].heading, slides, caption: str(raw.caption, 2000) };
}

export function parseVideoScript(text: string): VideoScript | null {
  const raw = json(text);
  if (!raw) return null;
  const hook = str(raw.hook, 200);
  const beats = items(raw.beats, 12)
    .map((beat) => ({ at: str(beat.at, 20), say: str(beat.say, 400), onScreen: str(beat.onScreen, 120), shot: str(beat.shot, 240) }))
    .filter((beat) => beat.say || beat.onScreen);
  if (!hook || beats.length < 3) return null;
  const seconds = Number(raw.seconds);
  return {
    title: str(raw.title, 120) || hook,
    hook,
    beats,
    caption: str(raw.caption, 2200),
    seconds: Number.isFinite(seconds) && seconds >= 10 && seconds <= 180 ? Math.round(seconds) : 45,
  };
}

/* ---------- Rendering ---------- */

export const SLIDE = { width: 1080, height: 1350, pad: 96 } as const;

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/**
 * Greedy word wrap by an average glyph width. Good enough for slides; words longer than a
 * line are hard-broken so nothing runs off the canvas. Lines past `maxLines` end in "…".
 */
export function wrap(text: string, fontSize: number, width: number, maxLines: number, glyph = 0.55): string[] {
  const perLine = Math.max(4, Math.floor(width / (fontSize * glyph)));
  const words = text.split(/\s+/).filter(Boolean).flatMap((word) => (word.length > perLine ? word.match(new RegExp(`.{1,${perLine}}`, "g"))! : [word]));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= perLine) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(0, perLine - 1)).trimEnd()}…`;
    return kept;
  }
  return lines;
}

function textBlock(lines: string[], x: number, y: number, size: number, leading: number, attrs: string): string {
  const spans = lines.map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : Math.round(size * leading)}">${escapeXml(line)}</tspan>`).join("");
  return `<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${spans}</text>`;
}

/** One slide as a standalone SVG string, 1080×1350 (the 4:5 feed size). */
export function renderSlide(kit: BrandKit, slide: Slide, index: number, total: number): string {
  const { width, height, pad } = SLIDE;
  const inner = width - pad * 2;
  const cover = index === 0;
  const last = index === total - 1 && total > 1;
  const headSize = cover ? 92 : 72;
  const heading = wrap(slide.heading, headSize, inner, cover ? 6 : 4);
  const headTop = cover ? 360 : 300;
  const bodySize = 44;
  const bodyTop = headTop + heading.length * Math.round(headSize * 1.12) + 56;
  const body = slide.body ? wrap(slide.body, bodySize, inner, Math.max(1, Math.floor((height - 220 - bodyTop) / (bodySize * 1.35)))) : [];
  const font = escapeXml(FONT_STACK[kit.font]);
  const counter = `${index + 1}/${total}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}">`,
    `<rect width="${width}" height="${height}" fill="${kit.background}"/>`,
    `<rect x="${pad}" y="${pad}" width="${cover ? 160 : 96}" height="12" rx="6" fill="${kit.accent}"/>`,
    `<text x="${width - pad}" y="${pad + 14}" font-size="32" text-anchor="end" fill="${kit.text}" opacity="0.6">${counter}</text>`,
    textBlock(heading, pad, headTop, headSize, 1.12, `font-weight="800" fill="${kit.text}"`),
    body.length ? textBlock(body, pad, bodyTop, bodySize, 1.35, `fill="${kit.text}" opacity="0.85"`) : "",
    kit.signature ? `<text x="${pad}" y="${height - pad}" font-size="34" font-weight="700" fill="${kit.accent}">${escapeXml(kit.signature)}</text>` : "",
    !last ? `<text x="${width - pad}" y="${height - pad}" font-size="34" text-anchor="end" fill="${kit.text}" opacity="0.6">Swipe →</text>` : "",
    `</svg>`,
  ].join("");
}
