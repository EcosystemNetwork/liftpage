import { HOLD_STATUSES, METRIC_FIELDS, type AccountsFile, type DeskFile, type HoldStatus, type Metric, type MetricField, type Platform } from "./types";

/** Monday of the week holding `value`, as YYYY-MM-DD (UTC). Null if it isn't a date. */
export function weekOf(value: string | Date): string | null {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export type WeekTotals = { week: string } & Record<MetricField, number>;

function empty(week: string): WeekTotals {
  return { week, followers: 0, impressions: 0, engagements: 0, clicks: 0, leads: 0 };
}

/** One row per week, summed across platforms, oldest first. */
export function byWeek(metrics: Metric[]): WeekTotals[] {
  const map = new Map<string, WeekTotals>();
  for (const metric of metrics) {
    const row = map.get(metric.week) ?? empty(metric.week);
    for (const field of METRIC_FIELDS) row[field] += metric[field];
    map.set(metric.week, row);
  }
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export type Summary = {
  latest: WeekTotals | null;
  previous: WeekTotals | null;
  weeks: WeekTotals[];
  /** engagements / impressions for the latest week, 0–1. */
  rate: number | null;
  platforms: { platform: Platform; followers: number; impressions: number }[];
};

export function summarize(metrics: Metric[]): Summary {
  const weeks = byWeek(metrics);
  const latest = weeks.at(-1) ?? null;
  const previous = weeks.at(-2) ?? null;
  const rate = latest && latest.impressions > 0 ? latest.engagements / latest.impressions : null;
  const platforms = latest
    ? metrics
        .filter((metric) => metric.week === latest.week)
        .map((metric) => ({ platform: metric.platform, followers: metric.followers, impressions: metric.impressions }))
        .sort((a, b) => b.impressions - a.impressions)
    : [];
  return { latest, previous, weeks, rate, platforms };
}

/** Relative change, or null when there is no base to compare against. */
export function change(now: number | undefined, before: number | undefined): number | null {
  if (now === undefined || before === undefined || before === 0) return null;
  return (now - before) / before;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fmt = {
  compact: (n: number) => (Math.abs(n) < 10_000 ? whole.format(n) : compact.format(n)),
  whole: (n: number) => whole.format(n),
  money: (n: number) => money.format(n),
  pct: (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`,
  delta: (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n * 100).toFixed(1)}%`,
  week: (week: string) =>
    new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
};

const DAY = 24 * 60 * 60 * 1000;

/** Everything the admin overview shows, from the two files. */
export function bookStats(accounts: AccountsFile, desk: DeskFile, now = Date.now()) {
  const clients = accounts.users.filter((user) => user.role === "client");
  const active = clients.filter((user) => user.lastLoginAt && now - Date.parse(user.lastLoginAt) < 7 * DAY).length;

  const byStatus = Object.fromEntries(
    HOLD_STATUSES.map((status) => {
      const list = desk.holds.filter((hold) => hold.status === status);
      return [status, { count: list.length, amount: list.reduce((sum, hold) => sum + hold.amount, 0) }];
    }),
  ) as Record<HoldStatus, { count: number; amount: number }>;

  const customers = clients
    .map((user) => ({ user, s: summarize(accounts.metrics.filter((m) => m.userId === user.id)) }))
    .sort((a, b) => (b.s.latest?.impressions ?? -1) - (a.s.latest?.impressions ?? -1));

  return {
    clients,
    active,
    byStatus,
    pipeline: byStatus.requested.amount + byStatus.contacted.amount,
    closed: byStatus.won.count + byStatus.lost.count,
    recent: desk.holds.filter((hold) => now - Date.parse(hold.at) < 30 * DAY).length,
    board: {
      draft: desk.posts.filter((post) => post.status === "draft").length,
      approved: desk.posts.filter((post) => post.status === "approved").length,
      cued: desk.posts.filter((post) => post.status === "cued").length,
    },
    customers,
  };
}

/* ---------- Ranges ---------- */

export const RANGES = [
  ["4w", "4 weeks", 4],
  ["12w", "12 weeks", 12],
  ["26w", "6 months", 26],
  ["52w", "1 year", 52],
  ["all", "All", null],
] as const;

export type RangeKey = (typeof RANGES)[number][0];

export function rangeFrom(value: unknown): RangeKey {
  return RANGES.some(([key]) => key === value) ? (value as RangeKey) : "12w";
}

/** First Monday inside the range, or null for all time. */
export function rangeStart(range: RangeKey, now = new Date()): string | null {
  const weeks = RANGES.find(([key]) => key === range)?.[2] ?? null;
  if (weeks === null) return null;
  const monday = new Date(`${weekOf(now)}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (weeks - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

export function inRange<T extends { week: string }>(rows: T[], range: RangeKey, now = new Date()): T[] {
  const start = rangeStart(range, now);
  return start ? rows.filter((row) => row.week >= start) : rows;
}
