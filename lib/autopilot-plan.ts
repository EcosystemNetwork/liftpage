import type { Brand, Metric, Platform, Post } from "./types";
import { PLATFORM_NAME } from "./types";

/*
 * The content autopilot's thinking, kept pure so tests can build its inputs by hand.
 * lib/autopilot.ts does the reading, writing and model call.
 */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type AutopilotSettings = {
  clientId: string;
  enabled: boolean;
  /** 0 = Sunday, Pacific time. */
  weekday: number;
  guidance: string;
  notify: boolean;
  lastRunAt?: string;
  lastResult: string;
};

export const GUIDANCE_MAX = 2000;

/** Past this many drafts waiting on review, autopilot holds off instead of piling on more. */
export const PENDING_LIMIT = 4;

const DAY = 86_400_000;
const LOOKBACK = 45 * DAY;

export function defaultSettings(clientId: string): AutopilotSettings {
  return { clientId, enabled: false, weekday: 0, guidance: "", notify: true, lastResult: "" };
}

/** Day of the week in Pacific time, 0 = Sunday. */
export function ptWeekday(now: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long" }).format(now);
  return Math.max(0, WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]));
}

/** On, today is its day, and it hasn't already run in the last 20 hours. */
export function isDue(settings: AutopilotSettings, now: Date): boolean {
  if (!settings.enabled) return false;
  if (ptWeekday(now) !== settings.weekday) return false;
  if (settings.lastRunAt && now.getTime() - Date.parse(settings.lastRunAt) < 20 * 3_600_000) return false;
  return true;
}

/** Drafts still waiting on the client. Lines they sent back are the admin's to rework, so they don't count. */
export function pendingDrafts(posts: Pick<Post, "status" | "notes">[]): number {
  return posts.filter((p) => p.status === "draft" && p.notes.at(-1)?.kind !== "changes").length;
}

const quote = (value: string, max = 140) => {
  const text = value.replace(/\s+/g, " ").trim();
  return `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;
};

/** What the client said about recent lines: what they sent back (and why), what they said yes to, what's already been used. */
export function feedbackLines(posts: Post[], now: Date) {
  const since = now.getTime() - LOOKBACK;
  const recent = (iso: string) => Date.parse(iso) >= since;
  const sentBack: string[] = [];
  const approved: string[] = [];
  for (const post of posts) {
    const change = post.notes.filter((n) => n.kind === "changes" && n.role === "client" && recent(n.at)).at(-1);
    if (change) sentBack.push(`${PLATFORM_NAME[post.platform]} ${quote(post.hook)}: client said ${quote(change.text, 220)}`);
    else if (post.notes.some((n) => n.kind === "approved" && recent(n.at)) || (post.publishState === "published" && post.publishedAt && recent(post.publishedAt))) {
      approved.push(`${PLATFORM_NAME[post.platform]} ${quote(post.hook)}`);
    }
  }
  const used = posts
    .filter((p) => Date.parse(p.slot) >= now.getTime() - 21 * DAY)
    .map((p) => quote(p.hook, 90));
  return { sentBack: sentBack.slice(-6), approved: approved.slice(-6), used: [...new Set(used)].slice(-14) };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString("en-US");

/**
 * Last week's numbers per network against the week before, best engagement rate first.
 * Weekly network totals are all LiftPage measures, so this is about channels, not single posts.
 */
export function performanceLines(metrics: Metric[]): string[] {
  const weeks = [...new Set(metrics.map((m) => m.week))].sort();
  const last = weeks.at(-1);
  if (!last) return [];
  const prev = weeks.at(-2);
  const rate = (m?: Metric) => (m && m.impressions > 0 ? m.engagements / m.impressions : null);
  const rows = metrics
    .filter((m) => m.week === last)
    .map((m) => {
      const before = prev ? metrics.find((p) => p.week === prev && p.platform === m.platform) : undefined;
      return { m, now: rate(m), before: rate(before) };
    })
    .sort((a, b) => (b.now ?? -1) - (a.now ?? -1));
  return rows.map(({ m, now, before }) => {
    const trend = now !== null && before !== null ? (now > before * 1.1 ? `, up from ${pct(before)}` : now < before * 0.9 ? `, down from ${pct(before)}` : ", flat") : "";
    const engaged = now !== null ? `${pct(now)} engaged${trend}` : "no impressions logged";
    return `${PLATFORM_NAME[m.platform as Platform]} week of ${last}: ${num(m.impressions)} impressions, ${engaged}, ${num(m.clicks)} clicks, ${num(m.leads)} leads.`;
  });
}

/** The brief the week cutter gets. The cutter already knows the brand's voice, offers and networks. */
export function autopilotBrief(input: { brand: Brand; guidance: string; posts: Post[]; metrics: Metric[]; now: Date }): string {
  const { sentBack, approved, used } = feedbackLines(input.posts, input.now);
  const numbers = performanceLines(input.metrics);
  const parts: string[] = [`Next week of posts for ${input.brand.name}. Lead with what they sell: ${input.brand.offers || "their core offer"}.`];
  const guidance = input.guidance.trim();
  if (guidance) parts.push(`Standing instructions from LiftPage (follow these first):\n${guidance}`);
  if (sentBack.length) parts.push(`The client sent these back. Fix what they asked for and do not reuse these angles:\n- ${sentBack.join("\n- ")}`);
  if (approved.length) parts.push(`The client approved or published these. More in this direction:\n- ${approved.join("\n- ")}`);
  if (numbers.length) parts.push(`Numbers by network, best first. Put the strongest ideas on the networks that are working:\n- ${numbers.join("\n- ")}`);
  if (used.length) parts.push(`Hooks already on the board. Do not repeat them:\n- ${used.join("\n- ")}`);
  return parts.join("\n\n").slice(0, 4000);
}
