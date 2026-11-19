import { describe, expect, it } from "vitest";
import { buildServices, nextRun, workLog, type ServiceInput } from "@/lib/services";
import type { AdminEvent } from "@/lib/types";

const NOW = new Date("2026-11-18T20:00:00Z"); // Wednesday, noon Pacific
const DAY = 86_400_000;
const iso = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const base: ServiceInput = {
  now: NOW,
  posts: [],
  connections: [],
  autopilot: null,
  campaign: null,
  projects: [],
  lastSync: null,
  reportsOn: false,
  tools: 0,
  pending: 0,
  pendingLimit: 4,
};

const byId = (input: ServiceInput) => Object.fromEntries(buildServices(input).map((s) => [s.id, s]));

describe("next run", () => {
  it("daily 6am Pacific is tomorrow once today's has passed", () => {
    expect(nextRun(NOW, { hour: 6 })).toBe("2026-11-19T06:00:00-08:00");
  });

  it("Monday 8am Pacific lands on the coming Monday", () => {
    expect(nextRun(NOW, { hour: 8, weekday: 1 })).toBe("2026-11-23T08:00:00-08:00");
  });

  it("today's weekday still counts if the hour is ahead", () => {
    expect(nextRun(NOW, { hour: 15, weekday: 3 })).toBe("2026-11-18T15:00:00-08:00");
  });
});

describe("services", () => {
  it("a brand-new client sees every service as available, each with an ask", () => {
    const services = buildServices(base);
    expect(services.every((s) => s.state === "off" && s.ask)).toBe(true);
  });

  it("posting reports the next scheduled post and the last one out", () => {
    const s = byId({
      ...base,
      connections: [{ platform: "linkedin" }],
      posts: [
        { platform: "linkedin", status: "cued", publishState: "idle", slot: iso(1), notes: [] },
        { platform: "x", status: "cued", publishState: "published", slot: iso(-2), publishedAt: iso(-2), notes: [] },
        { platform: "x", status: "cued", publishState: "scheduled", slot: iso(-1), notes: [] },
      ],
    });
    expect(s.posting.state).toBe("on");
    expect(s.posting.last).toMatch(/on X · 1 in the last 30 days/);
    expect(s.posting.next).toMatch(/on LinkedIn · 1 scheduled/);
  });

  it("a failed post or expired connection puts posting first, needing a look", () => {
    const services = buildServices({
      ...base,
      connections: [{ platform: "x", expiresAt: iso(-1) }],
      posts: [{ platform: "x", status: "cued", publishState: "failed", slot: iso(-1), notes: [] }],
    });
    expect(services[0].id).toBe("posting");
    expect(services[0].state).toBe("attention");
  });

  it("autopilot holds while too many drafts wait, and says so", () => {
    const s = byId({ ...base, autopilot: { enabled: true, weekday: 4 }, pending: 4 });
    expect(s.autopilot.state).toBe("attention");
    expect(s.autopilot.next).toMatch(/4 drafts waiting/);
    expect(byId({ ...base, autopilot: { enabled: true, weekday: 4 }, pending: 1 }).autopilot.next).toMatch(/Thu, Nov 19/);
  });

  it("a down site needs a look", () => {
    const s = byId({ ...base, projects: [{ kind: "website", status: "live", check: { at: iso(0), ok: false } }] });
    expect(s.uptime.state).toBe("attention");
  });

  it("a running growth campaign says it's researching", () => {
    expect(byId({ ...base, campaign: { status: "running", createdAt: iso(0), postIds: [] } }).growth.last).toMatch(/Researching now/);
  });
});

describe("work log", () => {
  const event = (action: string, detail = "", days = 0): AdminEvent => ({ id: action, at: iso(days), actorEmail: "a@liftpage.test", action, detail });

  it("keeps only client-safe actions and never shows the raw detail", () => {
    const log = workLog(
      [event("drafted week", "7 drafts via harnessrouter", -1), event("note", "late payer, be firm"), event("stage", "paused"), event("tools", "week")],
      [],
    );
    expect(log).toEqual([{ at: iso(-1), text: "We wrote 7 new posts for you to look over" }]);
    expect(JSON.stringify(log)).not.toMatch(/harnessrouter|late payer/);
  });

  it("mixes published posts in, newest first, and ignores newly opened requests", () => {
    const log = workLog(
      [event("change request", "open", -3), event("change request", "done", -2)],
      [{ platform: "instagram", publishState: "published", publishedAt: iso(-1) }],
    );
    expect(log.map((i) => i.text)).toEqual(["Posted on Instagram", "We finished one of your requests"]);
  });
});
