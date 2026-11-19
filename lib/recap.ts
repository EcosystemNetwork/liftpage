import { byWeek, change } from "./stats";
import { addDays, dayKey, ptYMD, zonedISO } from "./time";
import type { ChangeRequest, Metric, Platform, Post } from "./types";

/*
 * The good-news layer of a client's account: wins pulled out of their numbers, what this
 * month delivered against the same days last month, and the next two weeks at a glance.
 * Pure, so tests can build the inputs by hand.
 */

/* ---------- Wins ---------- */

export type Win = { title: string; detail: string };

const MILESTONES = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

const short = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const n = (v: number) => short.format(v);

/** Milestones and records in the latest logged week. Nothing to celebrate means an empty list, not filler. */
export function wins(metrics: Metric[], limit = 4): Win[] {
  const weeks = byWeek(metrics);
  if (weeks.length < 2) return [];
  const latest = weeks.at(-1)!;
  const before = weeks.slice(0, -1);
  const prev = before.at(-1)!;
  const out: Win[] = [];

  const crossed = MILESTONES.filter((m) => prev.followers < m && latest.followers >= m).at(-1);
  if (crossed) out.push({ title: `${n(crossed)} followers`, detail: `You passed ${n(crossed)} followers across your networks.` });

  // A record needs some history behind it, or every second week is "best ever".
  if (before.length >= 3) {
    const record = (field: "impressions" | "clicks" | "leads", label: string) => {
      const best = Math.max(...before.map((w) => w[field]));
      if (latest[field] > 0 && latest[field] > best) out.push({ title: `Best week for ${label}`, detail: `${n(latest[field])} ${label}, up from a previous best of ${n(best)}.` });
    };
    record("leads", "leads");
    record("impressions", "reach");
    record("clicks", "link clicks");
  }

  let streak = 0;
  for (let i = weeks.length - 1; i > 0 && weeks[i].impressions > weeks[i - 1].impressions; i -= 1) streak += 1;
  if (streak >= 3) out.push({ title: `${streak} weeks of growth`, detail: `Your reach has gone up ${streak} weeks in a row.` });

  if (latest.leads > 0 && before.every((w) => w.leads === 0)) out.push({ title: "First leads", detail: `${latest.leads} ${latest.leads === 1 ? "person" : "people"} reached out from your posts.` });

  const lift = change(latest.engagements, prev.engagements);
  if (lift !== null && lift >= 0.5 && latest.engagements >= 20) out.push({ title: "Engagement jump", detail: `${Math.round(lift * 100)}% more likes, replies and shares than the week before.` });

  return out.slice(0, limit);
}

/* ---------- Month recap ---------- */

export type RecapLine = { label: string; value: number; before: number | null };
export type Recap = { month: string; lines: RecapLine[] };

/**
 * This month so far against the same number of days last month (Pacific). Weekly numbers
 * count toward the month their Monday falls in.
 */
export function monthRecap(input: {
  posts: Pick<Post, "publishState" | "publishedAt" | "notes">[];
  changes: Pick<ChangeRequest, "status" | "doneAt">[];
  metrics: Metric[];
  now: Date;
}): Recap {
  const { y, m } = ptYMD(input.now);
  const start = Date.parse(zonedISO(y, m, 1, 0, 0));
  const prevMonth = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const prevStart = Date.parse(zonedISO(prevMonth.y, prevMonth.m, 1, 0, 0));
  const elapsed = input.now.getTime() - start;
  const prevEnd = Math.min(start, prevStart + elapsed);
  const inThis = (iso?: string) => Boolean(iso) && Date.parse(iso!) >= start && Date.parse(iso!) <= input.now.getTime();
  const inPrev = (iso?: string) => Boolean(iso) && Date.parse(iso!) >= prevStart && Date.parse(iso!) < prevEnd;

  const count = <T>(rows: T[], at: (row: T) => string | undefined) => [rows.filter((r) => inThis(at(r))).length, rows.filter((r) => inPrev(at(r))).length] as const;
  const published = count(
    input.posts.filter((p) => p.publishState === "published"),
    (p) => p.publishedAt,
  );
  const approvals = input.posts.flatMap((p) => p.notes.filter((note) => note.kind === "approved" && note.role === "client"));
  const approved = count(approvals, (note) => note.at);
  const done = count(
    input.changes.filter((c) => c.status === "done"),
    (c) => c.doneAt,
  );
  const weeks = byWeek(input.metrics);
  const sum = (field: "impressions" | "leads", test: (iso: string) => boolean) => weeks.filter((w) => test(`${w.week}T12:00:00Z`)).reduce((t, w) => t + w[field], 0);
  // Without any numbers last month, "vs 0" isn't a comparison.
  const hadPrev = weeks.some((w) => inPrev(`${w.week}T12:00:00Z`));

  const month = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "long" }).format(input.now);
  return {
    month,
    lines: [
      { label: "Posts published", value: published[0], before: published[1] },
      { label: "People reached", value: sum("impressions", inThis), before: hadPrev ? sum("impressions", inPrev) : null },
      { label: "Leads", value: sum("leads", inThis), before: hadPrev ? sum("leads", inPrev) : null },
      { label: "Posts you approved", value: approved[0], before: approved[1] },
      { label: "Requests done", value: done[0], before: done[1] },
    ],
  };
}

/* ---------- Two weeks at a glance ---------- */

export type CalendarEntry = { platform: Platform; state: "waiting" | "ready" | "out" | "failed" };
export type CalendarDay = { key: string; weekday: string; day: number; today: boolean; entries: CalendarEntry[] };

/** Today and the next `days - 1` days in Pacific, each with what's planned on it. */
export function calendar(posts: Pick<Post, "platform" | "slot" | "status" | "publishState">[], now: Date, days = 14): CalendarDay[] {
  const today = ptYMD(now);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const post of [...posts].sort((a, b) => a.slot.localeCompare(b.slot))) {
    const state: CalendarEntry["state"] =
      post.publishState === "published" || post.publishState === "publishing"
        ? "out"
        : post.publishState === "failed"
          ? "failed"
          : post.status === "draft"
            ? "waiting"
            : "ready";
    const key = dayKey(post.slot);
    byDay.set(key, [...(byDay.get(key) ?? []), { platform: post.platform, state }]);
  }
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today.y, today.m, today.d, i);
    const key = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    const weekday = new Date(Date.UTC(d.y, d.m - 1, d.d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    return { key, weekday, day: d.d, today: i === 0, entries: byDay.get(key) ?? [] };
  });
}
