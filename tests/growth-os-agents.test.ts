import { describe, expect, it } from "vitest";
import { baselineLines } from "@/lib/agents/analyst";
import { campaignTag, planDistribution, tagLinks, utmLink } from "@/lib/agents/distribute";
import { parseAnalysis, parseCommunity } from "@/lib/agents/parse";
import { AGENT_ROSTER } from "@/lib/agents/roster";
import { CAPTION_LIMIT } from "@/lib/cut";
import type { Metric } from "@/lib/types";

describe("roster", () => {
  it("has all six agents wired in", () => {
    expect(AGENT_ROSTER.map((a) => a.id)).toEqual(["research", "strategy", "content", "distribution", "community", "analyst"]);
    expect(AGENT_ROSTER.every((a) => a.ready)).toBe(true);
  });
});

describe("campaignTag", () => {
  it("is stable and doesn't leak the campaign id", () => {
    const tag = campaignTag("cmp_abcdef1234567890abcd", "2026-11-19T10:00:00Z");
    expect(tag).toMatch(/^lp-20261119-[0-9a-f]{6}$/);
    expect(tag).toBe(campaignTag("cmp_abcdef1234567890abcd", "2026-11-19T23:00:00Z"));
    expect(tag).not.toContain("abcdef");
  });
});

describe("utmLink", () => {
  it("keeps real params and replaces old utm tags", () => {
    const link = new URL(utmLink("https://acme.test/pricing?plan=pro&utm_source=old", { source: "x", medium: "social", campaign: "lp-1", content: "x-d1-1" }));
    expect(link.searchParams.get("plan")).toBe("pro");
    expect(link.searchParams.get("utm_source")).toBe("x");
    expect(link.searchParams.get("utm_content")).toBe("x-d1-1");
    expect(link.searchParams.getAll("utm_source")).toHaveLength(1);
  });
});

describe("tagLinks", () => {
  const tracked = "https://acme.test/?utm_source=x";
  it.each([
    ["Try it: https://acme.test", `Try it: ${tracked}`],
    ["Try it at acme.test.", `Try it at ${tracked}.`],
    ["See www.acme.test/ today", `See ${tracked} today`],
    ["(https://acme.test/?ref=a)", `(${tracked})`],
  ])("tags %s", (input, want) => expect(tagLinks(input, "https://acme.test/", tracked)).toBe(want));
  it.each(["https://acme.test/blog", "https://sub.acme.test", "acme.testing.com", "https://evil.test/acme.test", "no link here"])("leaves %s alone", (input) => {
    expect(tagLinks(input, "https://acme.test/", tracked)).toBeNull();
  });
  it("is idempotent on an already tagged caption", () => {
    const once = tagLinks("Go: acme.test", "https://acme.test/", tracked)!;
    expect(tagLinks(once, "https://acme.test/", tracked)).toBe(once);
  });
});

describe("planDistribution", () => {
  const now = new Date("2026-11-19T18:00:00Z");
  const posts = [
    { id: "p1", platform: "x" as const, slot: "2026-11-20T16:00:00Z", caption: "Ship faster: acme.test" },
    { id: "p2", platform: "x" as const, slot: "2026-11-20T17:00:00Z", caption: "No link" },
    { id: "p3", platform: "instagram" as const, slot: "2026-11-21T17:00:00Z", caption: "acme.test" },
    { id: "p4", platform: "linkedin" as const, slot: "2026-11-22T17:00:00Z", caption: "Read more at acme.test" },
  ];
  const plan = planDistribution({ posts, landing: "https://acme.test/", campaign: "lp-t", days: 7, limits: CAPTION_LIMIT, now });

  it("spreads posts over the week, in the future, without two posts on one network at once", () => {
    expect(plan.map((p) => p.day)).toEqual([1, 2, 4, 6]);
    expect(plan.every((p) => Date.parse(p.slot) > now.getTime())).toBe(true);
    const keys = plan.map((p) => `${p.platform}|${p.slot}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("tags caption links where they're clickable and uses the bio elsewhere", () => {
    expect(plan[0].linkPlacement).toBe("caption");
    expect(plan[0].caption).toContain("utm_campaign=lp-t");
    expect(plan[1].linkPlacement).toBe("manual");
    expect(plan[1].caption).toBe("No link");
    expect(plan[2].linkPlacement).toBe("bio");
    expect(plan[2].caption).toBe("acme.test");
  });
  it("gives each post its own utm_content", () => {
    expect(new Set(plan.map((p) => p.content)).size).toBe(plan.length);
  });
  it("won't push a caption past the network's limit", () => {
    const long = { id: "p5", platform: "x" as const, slot: "2026-11-20T16:00:00Z", caption: `${"a".repeat(265)} acme.test` };
    const [placed] = planDistribution({ posts: [long], landing: "https://acme.test/", campaign: "lp-t", days: 7, limits: CAPTION_LIMIT, now });
    expect(placed.caption).toBe(long.caption);
    expect(placed.linkPlacement).toBe("manual");
  });
});

describe("parseCommunity", () => {
  it("keeps known networks, drops named-person pitches without a placeholder, and adds one", () => {
    const parsed = parseCommunity(
      JSON.stringify({
        communities: [{ name: "r/devops", where: "Reddit", why: "CTOs", etiquette: "No promo" }, { name: "" }],
        creatorSearches: [
          { platform: "LinkedIn", query: "#platformengineering", fit: "Writes for CTOs" },
          { platform: "myspace", query: "x", fit: "" },
        ],
        outreach: [
          { to: "creator", channel: "DM", subject: "", message: "Loved your thread on deploys. Would a free seat for your readers help?" },
          { to: "mod", channel: "Reddit", subject: "", message: "Hi [NAME], would an AMA on release tooling fit the sub's rules?" },
          { to: "x", message: "short" },
        ],
      }),
    )!;
    expect(parsed.communities).toHaveLength(1);
    expect(parsed.creatorSearches.map((c) => c.platform)).toEqual(["linkedin"]);
    expect(parsed.outreach).toHaveLength(2);
    expect(parsed.outreach[0].message.startsWith("Hi [NAME],")).toBe(true);
    expect(parsed.outreach[1].message.startsWith("Hi [NAME], would")).toBe(true);
  });
  it("rejects an empty answer", () => expect(parseCommunity('{"communities":[]}')).toBeNull());
});

describe("parseAnalysis", () => {
  it("needs a readout and a measurable experiment, and bounds the length", () => {
    const parsed = parseAnalysis(
      JSON.stringify({
        readout: "No numbers yet.",
        experiments: [
          { name: "Morning vs evening", hypothesis: "Mornings win", change: "Time", metric: "Clicks", successBar: "+20%", days: 400 },
          { name: "No metric", hypothesis: "x" },
        ],
      }),
    )!;
    expect(parsed.experiments).toHaveLength(1);
    expect(parsed.experiments[0].days).toBe(7);
    expect(parseAnalysis('{"readout":"x","experiments":[]}')).toBeNull();
  });
});

describe("baselineLines", () => {
  const metric = (week: string, impressions: number): Metric =>
    ({ id: week, userId: "u", week, platform: "x", followers: 10, impressions, engagements: 5, clicks: 2, leads: 1, at: "", by: "", source: "manual" }) as unknown as Metric;
  it("summarizes weeks from real numbers only", () => {
    const lines = baselineLines([metric("2026-11-02", 100), metric("2026-11-09", 200)]);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("200 impressions");
    expect(lines[1]).toContain("2.5% engaged");
  });
  it("is empty without numbers", () => expect(baselineLines([])).toEqual([]));
});
