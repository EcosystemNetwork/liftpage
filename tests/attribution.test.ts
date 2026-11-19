import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { funnelLines } from "@/lib/agents/analyst";
import { campaignTag } from "@/lib/agents/distribute";
import { byContent, cleanEmail, formatMoney, funnelOf, isOurCampaign, parseTrack, rates, revenue } from "@/lib/attribution";

const KEY = "lpk_abcdefghijklmnopqrstuvwxyz012345";
const TAG = campaignTag("cmp_x", "2026-11-19T00:00:00Z");

describe("isOurCampaign", () => {
  it("accepts the tags distribution makes, nothing else", () => {
    expect(isOurCampaign(TAG)).toBe(true);
    expect(isOurCampaign("spring-sale")).toBe(false);
    expect(isOurCampaign("lp-2026-x")).toBe(false);
  });
});

describe("parseTrack", () => {
  const touch = { campaign: TAG, source: "LinkedIn", medium: "social", content: "linkedin-d1-1", junk: "x" };

  it("takes a tagged visit and lower-cases source", () => {
    const event = parseTrack({ key: KEY, kind: "visit", touch, path: "/pricing" });
    expect(event).toEqual({ key: KEY, kind: "visit", touch: { campaign: TAG, source: "linkedin", medium: "social", content: "linkedin-d1-1" }, path: "/pricing" });
  });
  it("refuses visits that aren't from our links", () => {
    expect(parseTrack({ key: KEY, kind: "visit", touch: { campaign: "spring" } })).toEqual({ error: "Not a LiftPage landing." });
  });
  it("needs a well-formed key and kind", () => {
    expect(parseTrack({ key: "nope", kind: "visit" })).toEqual({ error: "Unknown key." });
    expect(parseTrack({ key: KEY, kind: "delete" })).toEqual({ error: "Unknown kind." });
    expect(parseTrack(null)).toEqual({ error: "Send JSON." });
  });
  it("takes a lead without a touch (CRM still wants it), but not without an email", () => {
    const lead = parseTrack({ key: KEY, kind: "lead", email: " Ada@Example.COM ", name: "Ada\u0000", touch: null });
    expect(lead).toMatchObject({ kind: "lead", email: "ada@example.com", name: "Ada", touch: { campaign: "" } });
    expect(parseTrack({ key: KEY, kind: "lead", email: "nope" })).toEqual({ error: "A lead needs an email." });
  });
  it("turns a conversion's value into minor units and checks it", () => {
    expect(parseTrack({ key: KEY, kind: "conversion", value: 49.99, currency: "EUR", id: "ord_1" })).toMatchObject({ valueCents: 4999, currency: "eur", externalId: "ord_1" });
    expect(parseTrack({ key: KEY, kind: "conversion", value: "12" })).toMatchObject({ valueCents: 1200, currency: "usd" });
    expect("error" in parseTrack({ key: KEY, kind: "conversion", value: -1 })).toBe(true);
    expect("error" in parseTrack({ key: KEY, kind: "conversion", value: 1e12 })).toBe(true);
    expect("error" in parseTrack({ key: KEY, kind: "conversion", value: 5, currency: "dollars" })).toBe(true);
  });
  it("caps long strings", () => {
    const event = parseTrack({ key: KEY, kind: "lead", email: "a@b.co", company: "x".repeat(1000) });
    expect("company" in event && event.company?.length).toBe(200);
  });
});

describe("cleanEmail", () => {
  it.each([["a@b.co", "a@b.co"], ["A@B.CO ", "a@b.co"], ["no-at", undefined], ["a@b", undefined], [42, undefined]])("%s", (input, want) =>
    expect(cleanEmail(input)).toBe(want),
  );
});

describe("funnel", () => {
  const events = [
    { kind: "visit" as const, content: "x-d1-1" },
    { kind: "visit" as const, content: "x-d1-1" },
    { kind: "visit" as const, content: "linkedin-d2-1" },
    { kind: "conversion" as const, content: "x-d1-1", valueCents: 4999, currency: "usd" },
    { kind: "conversion" as const, content: "linkedin-d2-1", valueCents: 1000, currency: "eur" },
    { kind: "lead" as const, content: "x-d1-1" },
  ];
  const leads = [
    { status: "won" as const, valueCents: 100_000, currency: "usd", touch: { content: "linkedin-d2-1" } },
    { status: "new" as const, currency: "usd", touch: { content: "x-d1-1" } },
  ];

  it("counts leads from the CRM once, not from lead events", () => {
    const funnel = funnelOf(events, leads);
    expect(funnel).toMatchObject({ visits: 3, leads: 2, conversions: 2, wonDeals: 1 });
    expect(revenue(funnel)).toEqual({ usd: 104_999, eur: 1000 });
    expect(rates(funnel)).toEqual({ visitToLead: 2 / 3, leadToSale: 1.5 });
  });
  it("splits by post", () => {
    const split = byContent(events, leads);
    expect(split.get("x-d1-1")).toMatchObject({ visits: 2, leads: 1, conversions: 1 });
    expect(revenue(split.get("linkedin-d2-1")!)).toEqual({ eur: 1000, usd: 100_000 });
  });
  it("has no rates when there's nothing to divide by", () => {
    expect(rates(funnelOf([], []))).toEqual({ visitToLead: null, leadToSale: null });
  });
  it("formats money per currency, largest first", () => {
    expect(formatMoney({ usd: 104_999, eur: 1000 })).toBe("$1,049.99 + €10.00");
    expect(formatMoney({})).toBe("—");
  });
  it("gives the analyst real lines only for campaigns with traffic", () => {
    const lines = funnelLines([
      { tag: TAG, createdAt: "2026-11-19T00:00:00Z", funnel: funnelOf(events, leads) },
      { tag: "lp-20261101-aaaaaa", funnel: funnelOf([], []) },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("3 tracked visits, 2 leads, 3 sales");
  });
});

/** Runs public/lp.js in a fake browser and returns what it sent. */
function runSnippet(search: string, stored: Record<string, string> = {}) {
  const sent: Record<string, unknown>[] = [];
  const storage = { ...stored };
  const window: Record<string, unknown> = {};
  const context = {
    window,
    document: { currentScript: { src: "https://liftpage.test/lp.js", getAttribute: (name: string) => (name === "data-key" ? KEY : null) } },
    location: { search, pathname: "/pricing" },
    localStorage: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => void (storage[k] = v) },
    navigator: {
      sendBeacon: (url: string, blob: { text: string }) => {
        expect(url).toBe("https://liftpage.test/api/track");
        sent.push(JSON.parse(blob.text));
        return true;
      },
    },
    Blob: class {
      text: string;
      constructor(parts: string[]) {
        this.text = parts.join("");
      }
    },
    URL,
    URLSearchParams,
    JSON,
    Date,
  };
  vm.runInNewContext(readFileSync(path.resolve(__dirname, "../public/lp.js"), "utf8"), context);
  return { sent, storage, api: window.liftpage as { lead: (p: object) => void; convert: (p: object) => void } };
}

describe("lp.js", () => {
  it("reports a tagged landing and remembers it for the sign-up", () => {
    const { sent, api } = runSnippet(`?utm_source=x&utm_medium=social&utm_campaign=${TAG}&utm_content=x-d1-1`);
    expect(sent[0]).toMatchObject({ key: KEY, kind: "visit", path: "/pricing", touch: { campaign: TAG, content: "x-d1-1" } });
    api.lead({ email: "ada@example.com" });
    expect(sent[1]).toMatchObject({ kind: "lead", email: "ada@example.com", touch: { campaign: TAG } });
    expect(parseTrack(sent[1])).toMatchObject({ kind: "lead", touch: { campaign: TAG, source: "x" } });
  });
  it("stays silent on untagged pages, and a sale carries no touch", () => {
    const { sent, api } = runSnippet("?utm_campaign=newsletter");
    expect(sent).toHaveLength(0);
    api.convert({ value: 10, orderId: "o1" });
    expect(sent[0]).toMatchObject({ kind: "conversion", value: 10, id: "o1", touch: null });
  });
  it("forgets a touch after 30 days", () => {
    const old = JSON.stringify({ campaign: TAG, source: "x", medium: "social", content: "x-d1-1", at: Date.now() - 31 * 864e5 });
    const { sent, api } = runSnippet("", { liftpage_touch: old });
    api.lead({ email: "a@b.co" });
    expect(sent[0].touch).toBeNull();
  });
});
