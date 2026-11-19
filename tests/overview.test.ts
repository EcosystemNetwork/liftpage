import { describe, expect, it } from "vitest";
import { overview } from "@/lib/overview";
import type { Connection, Metric, Platform, Post } from "@/lib/types";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const DAY = 86_400_000;
const iso = (days: number) => new Date(NOW + days * DAY).toISOString();

let n = 0;
const m = (week: string, platform: Platform, patch: Partial<Metric> = {}): Metric => ({
  id: `m${n++}`,
  userId: "u1",
  week,
  platform,
  followers: 0,
  impressions: 0,
  engagements: 0,
  clicks: 0,
  leads: 0,
  at: "2026-11-01T00:00:00Z",
  by: "u1",
  ...patch,
});

type P = Parameters<typeof overview>[0]["posts"][number];
const post = (patch: Partial<Post>): P => ({
  platform: "x",
  slot: iso(1),
  hook: "hook",
  status: "draft",
  publishState: "idle",
  ...patch,
});

const base = { posts: [], connections: [], platforms: [] as Platform[], now: NOW };

describe("overview numbers", () => {
  it("is empty without numbers", () => {
    const o = overview({ ...base, metrics: [] });
    expect(o.to).toBeNull();
    expect(o.impressions).toEqual({ total: 0, change: null, spark: [] });
    expect(o.rate).toBeNull();
  });

  it("sums the four weeks ending at the latest logged week and compares with the four before", () => {
    const weeks = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"];
    const metrics = weeks.flatMap((week, i) => [
      m(week, "x", { impressions: i < 4 ? 100 : 150, engagements: i < 4 ? 0 : 15, clicks: 2, followers: 1000 + i * 10 }),
      m(week, "linkedin", { impressions: 50, followers: 500 }),
    ]);
    const o = overview({ ...base, metrics });
    expect(o.from).toBe("2026-10-12");
    expect(o.to).toBe("2026-11-02");
    expect(o.impressions.total).toBe(4 * 150 + 4 * 50);
    expect(o.impressions.change).toBeCloseTo(800 / 600 - 1);
    expect(o.rate).toBeCloseTo(60 / 800);
    expect(o.clicks).toEqual({ total: 8, change: 0 });
    // Followers: the latest week, against the week four back.
    expect(o.followers.total).toBe(1070 + 500);
    expect(o.followers.change).toBeCloseTo(1570 / 1530 - 1);
    // The sparkline starts at the first week with numbers.
    expect(o.impressions.spark).toHaveLength(8);
  });

  it("has no change with nothing before the window", () => {
    const o = overview({ ...base, metrics: [m("2026-11-02", "x", { impressions: 10, followers: 5 })] });
    expect(o.impressions.change).toBeNull();
    expect(o.followers.change).toBeNull();
  });

  it("reports the latest sync", () => {
    const o = overview({
      ...base,
      metrics: [m("2026-11-02", "x", { source: "sync", at: "2026-11-17T03:00:00Z" }), m("2026-11-02", "linkedin", { source: "manual", at: "2026-11-18T00:00:00Z" })],
    });
    expect(o.lastSync).toBe("2026-11-17T03:00:00Z");
  });
});

describe("overview accounts", () => {
  const conn = (platform: Platform, patch: Partial<Connection> = {}): Connection => ({ platform, accountName: `@${platform}`, connectedAt: iso(-60), ...patch });

  it("lists the board's networks and connections in order, with their state", () => {
    const o = overview({
      ...base,
      metrics: [m("2026-11-02", "instagram", { followers: 300, impressions: 900 })],
      platforms: ["linkedin", "instagram"],
      connections: [conn("instagram", { expiresAt: iso(30) }), conn("x", { expiresAt: iso(-1) })],
    });
    expect(o.accounts.map((a) => [a.platform, a.state])).toEqual([
      ["x", "reconnect"],
      ["instagram", "connected"],
      ["linkedin", "missing"],
    ]);
    expect(o.accounts[1]).toMatchObject({ name: "@instagram", followers: 300, impressions: 900 });
    expect(o.accounts[2]).toMatchObject({ followers: null, impressions: null });
  });
});

describe("overview posts", () => {
  it("counts the last 30 days, finds the next and the latest", () => {
    const o = overview({
      ...base,
      metrics: [],
      posts: [
        post({ publishState: "published", publishedAt: iso(-2), publishedUrl: "https://x.com/1", hook: "newest" }),
        post({ publishState: "published", publishedAt: iso(-40), hook: "old" }),
        post({ status: "cued", publishState: "scheduled", slot: iso(3), hook: "later" }),
        post({ status: "cued", publishState: "scheduled", slot: iso(1), hook: "soon" }),
        post({ status: "cued", publishState: "failed", slot: iso(0.5), hook: "failed" }),
        post({ status: "draft", slot: iso(0.2) }),
      ],
    });
    expect(o.posts.published30).toBe(1);
    expect(o.posts.scheduled).toBe(2);
    expect(o.posts.next?.hook).toBe("soon");
    expect(o.posts.last).toMatchObject({ hook: "newest", publishedUrl: "https://x.com/1" });
  });
});
