import { describe, expect, it } from "vitest";
import { autopilotBrief, defaultSettings, feedbackLines, isDue, pendingDrafts, performanceLines, ptWeekday } from "@/lib/autopilot-plan";
import type { Brand, Metric, Post, PostNote } from "@/lib/types";

const NOW = new Date("2026-11-18T23:00:00Z"); // Wednesday afternoon in Los Angeles
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();

const brand: Brand = { id: "b1", clientId: "u1", name: "Acme", handle: "@acme", voice: "plain", offers: "Rockets by the pound", platforms: ["x", "linkedin"] };

const note = (kind: PostNote["kind"], text = "", at = iso(-2), role: PostNote["role"] = "client"): PostNote => ({ id: `n${Math.random()}`, postId: "p", authorName: "Cam", role, kind, text, at });

const post = (patch: Partial<Post> = {}): Post => ({
  id: `p${Math.random()}`,
  platform: "x",
  slot: iso(-3),
  hook: "A hook",
  caption: "",
  visual: "",
  reply: "",
  status: "draft",
  publishState: "idle",
  notes: [],
  ...patch,
});

const metric = (week: string, platform: Metric["platform"], impressions: number, engagements: number): Metric => ({
  id: `${week}${platform}`,
  userId: "u1",
  week,
  platform,
  followers: 0,
  impressions,
  engagements,
  clicks: 10,
  leads: 1,
  at: week,
  by: "",
});

describe("autopilot schedule", () => {
  it("reads the weekday in Pacific time", () => {
    expect(ptWeekday(NOW)).toBe(3);
    // 02:00 UTC Thursday is still Wednesday evening in LA.
    expect(ptWeekday(new Date("2026-11-19T02:00:00Z"))).toBe(3);
  });

  it("is due only when on, on its day, and not run in the last 20 hours", () => {
    const on = { ...defaultSettings("u1"), enabled: true, weekday: 3 };
    expect(isDue(on, NOW)).toBe(true);
    expect(isDue({ ...on, enabled: false }, NOW)).toBe(false);
    expect(isDue({ ...on, weekday: 4 }, NOW)).toBe(false);
    expect(isDue({ ...on, lastRunAt: iso(-0.5) }, NOW)).toBe(false);
    expect(isDue({ ...on, lastRunAt: iso(-7) }, NOW)).toBe(true);
  });

  it("counts drafts waiting on the client, not lines they sent back", () => {
    const posts = [post(), post(), post({ notes: [note("changes", "too salesy")] }), post({ status: "approved" })];
    expect(pendingDrafts(posts)).toBe(2);
  });
});

describe("autopilot learning", () => {
  it("collects sent-back notes, approvals, and used hooks", () => {
    const posts = [
      post({ hook: "Buy now", notes: [note("changes", "Too pushy, softer please")] }),
      post({ hook: "Behind the build", platform: "linkedin", status: "approved", notes: [note("approved")] }),
      post({ hook: "Old news", slot: iso(-60), notes: [note("changes", "ancient", iso(-60))] }),
      post({ hook: "Admin poke", notes: [note("changes", "admin note", iso(-1), "admin")] }),
    ];
    const got = feedbackLines(posts, NOW);
    expect(got.sentBack).toEqual(['X "Buy now": client said "Too pushy, softer please"']);
    expect(got.approved).toEqual(['LinkedIn "Behind the build"']);
    expect(got.used).toContain('"Buy now"');
    expect(got.used).not.toContain('"Old news"');
  });

  it("ranks networks by engagement rate and shows the trend", () => {
    const lines = performanceLines([
      metric("2026-11-02", "x", 1000, 10),
      metric("2026-11-09", "x", 1000, 30),
      metric("2026-11-09", "linkedin", 1000, 50),
    ]);
    expect(lines[0]).toMatch(/^LinkedIn week of 2026-11-09: 1,000 impressions, 5\.0% engaged/);
    expect(lines[1]).toContain("3.0% engaged, up from 1.0%");
    expect(performanceLines([])).toEqual([]);
  });

  it("builds a brief that puts the admin's instructions first and stays under 4000 chars", () => {
    const brief = autopilotBrief({
      brand,
      guidance: "Mention the Dec 3 launch. No discounts.",
      posts: [post({ hook: "Buy now", notes: [note("changes", "Too pushy")] })],
      metrics: [metric("2026-11-09", "x", 500, 25)],
      now: NOW,
    });
    expect(brief).toContain("Rockets by the pound");
    expect(brief.indexOf("Dec 3 launch")).toBeLessThan(brief.indexOf("sent these back"));
    expect(brief).toContain("Too pushy");
    expect(brief).toContain("5.0% engaged");
    const long = autopilotBrief({ brand, guidance: "x".repeat(2000), posts: Array.from({ length: 40 }, (_, i) => post({ hook: `h${i} ${"y".repeat(80)}` })), metrics: [], now: NOW });
    expect(long.length).toBeLessThanOrEqual(4000);
  });
});
