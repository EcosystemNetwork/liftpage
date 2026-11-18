import { describe, expect, it } from "vitest";
import { clientFlags, urgency, type ClientSnapshot } from "@/lib/health";
import { effectiveRole, isOwnerEmail } from "@/lib/owner";
import { buildReport } from "@/lib/report";
import type { Metric, Post, User } from "@/lib/types";

const NOW = Date.parse("2026-11-18T12:00:00Z"); // a Wednesday
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

describe("owner lock", () => {
  it("only the owner email is an owner, in any case", () => {
    expect(isOwnerEmail("EricNans@gmail.com")).toBe(true);
    expect(isOwnerEmail(" ericnans@gmail.com ")).toBe(true);
    expect(isOwnerEmail("someone@gmail.com")).toBe(false);
    expect(isOwnerEmail("ericnans@gmail.com.evil.io")).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it("an admin row on any other email is a client", () => {
    expect(effectiveRole("admin", "ericnans@gmail.com")).toBe("admin");
    expect(effectiveRole("admin", "old-admin@liftpage.test")).toBe("client");
    expect(effectiveRole("client", "ericnans@gmail.com")).toBe("client");
  });
});

const user = (patch: Partial<User> = {}): User => ({
  id: "u1",
  email: "c@x.test",
  name: "Cam",
  company: "Acme",
  role: "client",
  createdAt: iso(-60),
  lastLoginAt: iso(-1),
  disabled: false,
  stage: "active",
  ...patch,
});

type P = ClientSnapshot["posts"][number];
const post = (patch: Partial<P> = {}): P => ({ status: "draft", publishState: "idle", slot: iso(2), notes: [], ...patch });
const changes = [{ kind: "changes" } as Post["notes"][number]];

const snap = (patch: Partial<ClientSnapshot> = {}): ClientSnapshot => ({
  user: user(),
  hasBoard: true,
  posts: [post({ status: "cued", publishState: "scheduled", slot: iso(3) })],
  connections: [{ platform: "x" }],
  latestWeek: "2026-11-09",
  unread: 0,
  holds: [],
  ...patch,
});

const keys = (s: ClientSnapshot) => clientFlags(s, NOW).map((f) => f.key);

describe("client health", () => {
  it("a client with a scheduled week, a network, and fresh numbers is clean", () => {
    expect(keys(snap())).toEqual([]);
  });

  it("flags failures and sent-back lines as heat", () => {
    const flags = clientFlags(snap({ posts: [post({ publishState: "failed", status: "cued" }), post({ notes: changes }), post({ status: "cued", publishState: "scheduled" })] }), NOW);
    expect(flags.filter((f) => f.tone === "heat").map((f) => f.key)).toEqual(["failed", "sent-back"]);
  });

  it("counts a sent-back line as sent back, not as a draft awaiting approval", () => {
    expect(keys(snap({ posts: [post({ notes: changes }), post({ status: "cued", publishState: "scheduled" })] }))).toEqual(["sent-back"]);
  });

  it("flags an empty week ahead, unscheduled approvals, and expiring tokens", () => {
    const k = keys(snap({ posts: [post({ status: "approved", slot: iso(9) })], connections: [{ platform: "linkedin", expiresAt: iso(3) }, { platform: "x", expiresAt: iso(-1) }] }));
    expect(k).toEqual(["expiring-linkedin", "expired-x", "nothing-scheduled", "approved"]);
  });

  it("asks for a board first, and nothing else about content", () => {
    expect(keys(snap({ hasBoard: false, posts: [], connections: [] }))).toEqual(["no-board"]);
  });

  it("paused clients only surface what is broken or waiting on us", () => {
    const k = keys(snap({ user: user({ stage: "paused", lastLoginAt: undefined }), posts: [post({ publishState: "failed" })], unread: 2, connections: [], latestWeek: undefined }));
    expect(k).toEqual(["failed", "unread"]);
  });

  it("flags a won request with no deposit, stale numbers, and a quiet client", () => {
    const k = keys(snap({ holds: [{ status: "won" }], latestWeek: "2026-10-12", user: user({ lastLoginAt: iso(-45) }) }));
    expect(k).toEqual(expect.arrayContaining(["unpaid", "stale-numbers", "quiet"]));
  });

  it("ranks heat over everything else", () => {
    const heat = clientFlags(snap({ posts: [post({ publishState: "failed" })] }), NOW);
    const mild = clientFlags(snap({ unread: 3, user: user({ lastLoginAt: iso(-40) }) }), NOW);
    expect(urgency(heat)).toBeGreaterThan(urgency(mild));
  });
});

const metric = (week: string, platform: Metric["platform"], impressions: number, patch: Partial<Metric> = {}): Metric => ({
  id: `${week}-${platform}`,
  userId: "u1",
  week,
  platform,
  followers: 1000,
  impressions,
  engagements: impressions / 20,
  clicks: 10,
  leads: 2,
  at: iso(0),
  by: "u1",
  ...patch,
});

describe("weekly report", () => {
  const now = new Date(NOW);

  it("reports the last full week against the one before, not the week in progress", () => {
    const report = buildReport({ name: "Cam", company: "Acme" }, [metric("2026-11-02", "x", 1000), metric("2026-11-09", "x", 1500), metric("2026-11-16", "x", 99)], [], now);
    expect(report.week).toBe("2026-11-09");
    expect(report.subject).toBe("Acme weekly numbers: Nov 9");
    expect(report.lines.join("\n")).toContain("Impressions: 1,500 (+50.0% vs the week before)");
    expect(report.lines.join("\n")).not.toContain("99");
    expect(report.empty).toBe(false);
  });

  it("names the strongest network and counts the board", () => {
    const posts = [
      { status: "cued" as const, publishState: "published" as const, slot: iso(-2), publishedAt: iso(-2), notes: [], platform: "x" as const },
      { status: "cued" as const, publishState: "scheduled" as const, slot: iso(2), notes: [], platform: "x" as const },
      { status: "draft" as const, publishState: "idle" as const, slot: iso(4), notes: [], platform: "x" as const },
    ];
    const text = buildReport({ name: "", company: "Acme" }, [metric("2026-11-09", "x", 500), metric("2026-11-09", "linkedin", 900)], posts, now).lines.join("\n");
    expect(text).toContain("Strongest network: LinkedIn");
    expect(text).toContain("1 post went out in the last 7 days, and 1 is scheduled for the next 7.");
    expect(text).toContain("1 draft is waiting for your approval");
  });

  it("is empty with no finished week and nothing on the board", () => {
    expect(buildReport({ name: "Cam", company: "Acme" }, [metric("2026-11-16", "x", 10)], [], now).empty).toBe(true);
  });
});
