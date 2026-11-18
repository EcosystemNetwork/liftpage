import { describe, expect, it } from "vitest";
import { canSubscribe, checkLine, cleanUrl, fromStripeStatus, planNotice, planTerms, stripeTrialEnd, suiteFlags, type SuiteSnapshot } from "@/lib/plan";
import type { Plan } from "@/lib/types";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const DAY = 86_400_000;
const iso = (days: number) => new Date(NOW + days * DAY).toISOString();

const plan = (patch: Partial<Plan> = {}): Plan => ({
  clientId: "u1",
  name: "Online presence",
  monthly: 499,
  includes: "",
  offer: "standard",
  status: "pending",
  subscribed: false,
  ...patch,
});

describe("plan terms", () => {
  it("a free month says when billing starts and what it costs", () => {
    const t = planTerms(plan({ offer: "trial", trialEndsAt: iso(10) }), NOW);
    expect(t.price).toBe("$499/mo");
    expect(t.terms).toMatch(/^Free until Nov 28, 2026 \(10 days left\)\. Then \$499\/mo\.$/);
  });

  it("an ended free month says so", () => {
    expect(planTerms(plan({ offer: "trial", trialEndsAt: iso(-3) }), NOW).terms).toMatch(/^Free month ended/);
  });

  it("a locked price names the date it holds through, inclusive", () => {
    expect(planTerms(plan({ offer: "locked", lockedUntil: "2027-11-18", monthly: 1200 }), NOW).terms).toBe(
      "Locked at $1,200/mo through Nov 18, 2027. Rate card changes don't touch you.",
    );
    // The lock holds all of its last day.
    expect(planTerms(plan({ offer: "locked", lockedUntil: "2026-11-18" }), NOW).terms).toMatch(/^Locked/);
    expect(planTerms(plan({ offer: "locked", lockedUntil: "2026-11-17" }), NOW).terms).toMatch(/^Price lock ended/);
  });

  it("canceled wins over the offer", () => {
    expect(planTerms(plan({ offer: "trial", trialEndsAt: iso(10), status: "canceled" }), NOW).terms).toMatch(/^Canceled/);
  });
});

describe("subscribing", () => {
  it("offers a card button only to unsubscribed, payable, open plans", () => {
    expect(canSubscribe(null)).toBe(false);
    expect(canSubscribe(plan())).toBe(true);
    expect(canSubscribe(plan({ status: "trialing" }))).toBe(true);
    expect(canSubscribe(plan({ subscribed: true }))).toBe(false);
    expect(canSubscribe(plan({ monthly: 0 }))).toBe(false);
    expect(canSubscribe(plan({ status: "canceled" }))).toBe(false);
    expect(canSubscribe(plan({ status: "active" }))).toBe(false);
  });

  it("passes the free month to Stripe only when it is more than 48 hours out", () => {
    expect(stripeTrialEnd(plan({ offer: "trial", trialEndsAt: iso(20) }), NOW)).toBe(Math.floor((NOW + 20 * DAY) / 1000));
    expect(stripeTrialEnd(plan({ offer: "trial", trialEndsAt: iso(1.5) }), NOW)).toBeUndefined();
    expect(stripeTrialEnd(plan({ offer: "locked", lockedUntil: "2027-01-01" }), NOW)).toBeUndefined();
  });

  it("maps Stripe statuses", () => {
    expect(fromStripeStatus("trialing")).toBe("trialing");
    expect(fromStripeStatus("active")).toBe("active");
    expect(fromStripeStatus("unpaid")).toBe("past_due");
    expect(fromStripeStatus("incomplete_expired")).toBe("canceled");
    expect(fromStripeStatus("incomplete")).toBe("pending");
  });

  it("only known notice codes reach the page", () => {
    expect(planNotice("started")).toBe("started");
    expect(planNotice("Call 555-0100 to verify your card")).toBeUndefined();
    expect(planNotice(["started"])).toBeUndefined();
  });
});

describe("site addresses and checks", () => {
  it("cleans addresses and refuses anything that isn't a website", () => {
    expect(cleanUrl("rosasbakery.com")).toBe("https://rosasbakery.com/");
    expect(cleanUrl(" http://x.io/menu ")).toBe("http://x.io/menu");
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("ftp://x.io")).toBeNull();
    expect(cleanUrl("https://user:pw@x.io")).toBeNull();
    expect(cleanUrl("localhost")).toBeNull();
    expect(cleanUrl("")).toBeNull();
  });

  it("reads a check in plain words", () => {
    expect(checkLine(undefined, NOW)).toBe("Not checked yet");
    expect(checkLine({ at: new Date(NOW - 5 * 60_000).toISOString(), ok: true, code: 200, ms: 180 }, NOW)).toBe("Up · 180 ms · checked 5m ago");
    expect(checkLine({ at: iso(-2), ok: false, code: 503 }, NOW)).toBe("Down (503) · checked 2d ago");
    expect(checkLine({ at: iso(0), ok: false, error: "timed out" }, NOW)).toBe("Down (timed out) · checked just now");
  });
});

describe("suite flags", () => {
  const snap = (patch: Partial<SuiteSnapshot> = {}): SuiteSnapshot => ({ projects: [], changes: [], plan: null, ...patch });
  const keys = (s: SuiteSnapshot) => suiteFlags(s, NOW).map((f) => f.key);

  it("an empty suite is clean", () => {
    expect(keys(snap())).toEqual([]);
  });

  it("a live site that's down is heat; a paused or building one isn't", () => {
    const down = { at: iso(0), ok: false, code: 500 };
    expect(suiteFlags(snap({ projects: [{ kind: "website", status: "live", name: "Site", check: down }], plan: plan() }), NOW)[0]).toMatchObject({ key: "down-Site", tone: "heat" });
    expect(keys(snap({ projects: [{ kind: "website", status: "building", name: "Site", check: down }], plan: plan() }))).toEqual([]);
  });

  it("flags open change requests, a free month about to end, and a lock about to end", () => {
    expect(keys(snap({ changes: [{ status: "open" }, { status: "doing" }, { status: "done" }] }))).toEqual(["changes"]);
    const trial = suiteFlags(snap({ plan: plan({ offer: "trial", trialEndsAt: iso(3) }) }), NOW);
    expect(trial[0].text).toBe("Free month ends in 3d, no card on file");
    expect(keys(snap({ plan: plan({ offer: "trial", trialEndsAt: iso(20) }) }))).toEqual([]);
    expect(keys(snap({ plan: plan({ offer: "locked", lockedUntil: "2026-12-01" }) }))).toEqual(["lock-ending"]);
    expect(keys(snap({ plan: plan({ status: "past_due" }) }))).toEqual(["past-due"]);
  });

  it("projects without a plan are a nudge to sell one", () => {
    expect(keys(snap({ projects: [{ kind: "website", status: "live", name: "Site" }] }))).toEqual(["no-plan"]);
  });
});
