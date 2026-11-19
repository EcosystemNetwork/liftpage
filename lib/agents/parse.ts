import type { Platform } from "../types";
import { PLATFORMS } from "../types";

/*
 * Pure shapes and parsers for the agents' JSON. A model answer that doesn't fit is treated
 * as no answer, so `complete` moves on to the next backend instead of saving junk.
 */

export type Research = {
  product: string;
  oneLiner: string;
  audience: string[];
  painPoints: string[];
  valueProps: string[];
  proofOnSite: string[];
  competitors: { name: string; url?: string; angle: string; source: "provided" | "inferred" }[];
  gaps: string[];
};

export type Strategy = {
  positioning: string;
  pillars: string[];
  channels: { platform: Platform; why: string; cadence: string }[];
  days: { day: number; theme: string; objective: string; cta: string }[];
  kpis: string[];
};

/** The shared rule every agent prompt ends with. */
export const NO_INVENTION =
  'Never invent numbers, customers, quotes, prices, results, or names. If something is not in the input, write "unknown" or use a [BRACKETED PLACEHOLDER].';

/** The first {...} block in a model answer, parsed. */
export function jsonObject(text: string): Record<string, unknown> | null {
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

function str(value: unknown, max = 400): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown, max = 8, each = 240): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => str(item, each)).filter(Boolean).slice(0, max);
}

function records(value: unknown, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").slice(0, max);
}

export function parseResearch(text: string, providedUrls: string[] = []): Research | null {
  const raw = jsonObject(text);
  if (!raw) return null;
  const product = str(raw.product, 200);
  const oneLiner = str(raw.oneLiner, 300);
  if (!product || !oneLiner) return null;
  const provided = new Set(providedUrls.map((url) => url.replace(/\/+$/, "").toLowerCase()));
  return {
    product,
    oneLiner,
    audience: list(raw.audience),
    painPoints: list(raw.painPoints),
    valueProps: list(raw.valueProps),
    proofOnSite: list(raw.proofOnSite),
    competitors: records(raw.competitors, 6)
      .map((item) => {
        const url = str(item.url, 300) || undefined;
        // Only a competitor whose page we actually read counts as provided; the model's word isn't enough.
        const source: "provided" | "inferred" = url && provided.has(url.replace(/\/+$/, "").toLowerCase()) ? "provided" : "inferred";
        return { name: str(item.name, 120), url, angle: str(item.angle, 300), source };
      })
      .filter((item) => item.name),
    gaps: list(raw.gaps),
  };
}

const PLATFORM_SET = new Set<string>(PLATFORMS);

export function parseStrategy(text: string): Strategy | null {
  const raw = jsonObject(text);
  if (!raw) return null;
  const positioning = str(raw.positioning, 500);
  const days = records(raw.days, 7)
    .map((item, index) => ({
      day: Number.isInteger(item.day) ? (item.day as number) : index + 1,
      theme: str(item.theme, 200),
      objective: str(item.objective, 200),
      cta: str(item.cta, 160),
    }))
    .filter((item) => item.theme);
  if (!positioning || days.length < 3) return null;
  return {
    positioning,
    pillars: list(raw.pillars, 3, 200),
    channels: records(raw.channels, 5)
      .map((item) => ({ platform: str(item.platform, 20).toLowerCase() as Platform, why: str(item.why, 240), cadence: str(item.cadence, 80) }))
      .filter((item) => PLATFORM_SET.has(item.platform)),
    days,
    kpis: list(raw.kpis, 6, 160),
  };
}

/** Turns research + strategy into the brief the existing week cutter already understands. */
export function campaignBrief(research: Research, strategy: Strategy, goal: string): string {
  const lines = [
    `Product: ${research.product}. ${research.oneLiner}`,
    goal ? `Campaign goal: ${goal}` : "",
    `Positioning: ${strategy.positioning}`,
    strategy.pillars.length ? `Pillars: ${strategy.pillars.join(" | ")}` : "",
    research.audience.length ? `Audience: ${research.audience.join("; ")}` : "",
    research.painPoints.length ? `Pain points: ${research.painPoints.join("; ")}` : "",
    research.proofOnSite.length ? `Proof from the site (use only these facts): ${research.proofOnSite.join("; ")}` : "Proof from the site: none found. Do not claim results.",
    "The week:",
    ...strategy.days.map((day) => `Day ${day.day}: ${day.theme}. Goal: ${day.objective}. Ask: ${day.cta}`),
  ].filter(Boolean);
  return lines.join("\n").slice(0, 3800);
}
