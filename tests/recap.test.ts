import { describe, expect, it } from "vitest";
import { calendar, monthRecap, wins } from "@/lib/recap";
import type { Metric, PostNote } from "@/lib/types";

const NOW = new Date("2026-11-18T20:00:00Z"); // Wednesday, noon Pacific

let id = 0;
const metric = (week: string, v: Partial<Metric>): Metric => ({
  id: String(id++),
  userId: "u",
  week,
  platform: "x",
  followers: 0,
  impressions: 0,
  engagements: 0,
  clicks: 0,
  leads: 0,
  at: `${week}T12:00:00Z`,
  by: "sync:x",
  ...v,
});

const titles = (ms: Metric[]) => wins(ms, 10).map((w) => w.title);

describe("wins", () => {
  it("needs two weeks to say anything", () => {
    expect(wins([metric("2026-11-09", { followers: 5000, impressions: 900 })])).toEqual([]);
  });

  it("celebrates the highest follower milestone crossed, once", () => {
    expect(titles([metric("2026-11-02", { followers: 900 }), metric("2026-11-09", { followers: 2600 })])).toContain("2.5K followers");
    expect(titles([metric("2026-11-02", { followers: 1100 }), metric("2026-11-09", { followers: 1200 })])).not.toContain("1K followers");
  });

  it("calls a record and a growth streak only with history behind them", () => {
    const weeks = ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map((w, i) => metric(w, { impressions: 100 * (i + 1) }));
    expect(titles(weeks)).toEqual(expect.arrayContaining(["Best week for reach", "3 weeks of growth"]));
    expect(titles(weeks.slice(-2))).not.toContain("Best week for reach");
  });

  it("first leads ever is a win", () => {
    expect(titles([metric("2026-11-02", {}), metric("2026-11-09", { leads: 2 })])).toContain("First leads");
  });
});

describe("month recap", () => {
  const note = (at: string, role: PostNote["role"]): PostNote => ({ id: at, postId: "p", authorName: "A", role, kind: "approved", text: "", at });

  it("compares this month so far with the same days last month", () => {
    const recap = monthRecap({
      now: NOW,
      posts: [
        { publishState: "published", publishedAt: "2026-11-10T18:00:00Z", notes: [note("2026-11-05T18:00:00Z", "client"), note("2026-11-06T18:00:00Z", "admin")] },
        { publishState: "published", publishedAt: "2026-10-10T18:00:00Z", notes: [] },
        // Late October is past the same-days window, so it doesn't count.
        { publishState: "published", publishedAt: "2026-10-28T18:00:00Z", notes: [] },
      ],
      changes: [{ status: "done", doneAt: "2026-11-12T18:00:00Z" }],
      metrics: [metric("2026-11-02", { impressions: 500, leads: 3 }), metric("2026-10-05", { impressions: 250 })],
    });
    expect(recap.month).toBe("November");
    const line = Object.fromEntries(recap.lines.map((l) => [l.label, l]));
    expect(line["Posts published"]).toMatchObject({ value: 1, before: 1 });
    expect(line["People reached"]).toMatchObject({ value: 500, before: 250 });
    expect(line["Posts you approved"]).toMatchObject({ value: 1, before: 0 });
    expect(line["Requests done"]).toMatchObject({ value: 1, before: 0 });
  });

  it("has no comparison for numbers without a month before", () => {
    const recap = monthRecap({ now: NOW, posts: [], changes: [], metrics: [metric("2026-11-02", { impressions: 10 })] });
    expect(recap.lines.find((l) => l.label === "People reached")?.before).toBeNull();
  });
});

describe("calendar", () => {
  it("lays out 14 Pacific days from today with each post's state", () => {
    const days = calendar(
      [
        { platform: "x", slot: "2026-11-18T23:00:00Z", status: "draft", publishState: "idle" },
        { platform: "linkedin", slot: "2026-11-20T17:00:00Z", status: "cued", publishState: "scheduled" },
        { platform: "x", slot: "2026-12-30T17:00:00Z", status: "cued", publishState: "scheduled" },
      ],
      NOW,
    );
    expect(days).toHaveLength(14);
    expect(days[0]).toMatchObject({ key: "2026-11-18", weekday: "Wed", today: true, entries: [{ platform: "x", state: "waiting" }] });
    expect(days[2].entries).toEqual([{ platform: "linkedin", state: "ready" }]);
    expect(days.flatMap((d) => d.entries)).toHaveLength(2);
  });
});
