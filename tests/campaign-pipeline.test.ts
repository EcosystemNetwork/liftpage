import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentId, AgentStep, Brand, Campaign, Post, StepStatus } from "@/lib/types";

/*
 * End to end through the real campaign runner and all six real agents, parsers, the
 * distribution planner and the usage meter. Only the edges are fake: the database (an
 * in-memory store), the model (scripted answers per agent), and the website fetch.
 */

const ROSTER: AgentId[] = ["research", "strategy", "content", "distribution", "community", "analyst"];
const URL_ = "https://acme.test/";

const db = {
  campaigns: new Map<string, Campaign & { memory?: unknown }>(),
  posts: new Map<string, Post>(),
  runs: [] as { brandId: string; brief: string }[],
};

/** Per agent, what the fake model says. A string is the answer; null is a backend failure. */
const answers: Partial<Record<AgentId, string | null>> = {};

const brand: Brand = { id: "b1", clientId: "u1", name: "Acme", handle: "@acme", voice: "Plain", offers: "Deploys", platforms: ["x", "linkedin", "instagram"] };

vi.mock("@/lib/campaigns", () => ({
  loadCampaign: async (id: string) => structuredClone(db.campaigns.get(id) ?? null),
  claimCampaign: async (id: string) => {
    const c = db.campaigns.get(id);
    if (!c || c.status !== "queued") return false;
    c.status = "running";
    return true;
  },
  setStep: async (id: string, agent: AgentId, patch: Partial<AgentStep> & { status: StepStatus }) => {
    const step = db.campaigns.get(id)!.steps.find((s) => s.agent === agent)!;
    Object.assign(step, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  },
  recordDrafts: async (id: string, postIds: string[], memory: unknown) => Object.assign(db.campaigns.get(id)!, { postIds, memory }),
  finishCampaign: async (id: string, status: Campaign["status"], patch: { postIds?: string[] } = {}) => {
    const c = db.campaigns.get(id)!;
    c.status = status;
    if (patch.postIds) c.postIds = patch.postIds;
  },
}));

vi.mock("@/lib/store", () => ({
  loadBrand: async (id: string) => (id === brand.id ? brand : null),
  loadPost: async (id: string) => {
    const post = db.posts.get(id);
    return post ? { post: structuredClone(post), brandId: brand.id } : null;
  },
  updatePost: async (id: string, patch: Partial<Post>) => Object.assign(db.posts.get(id)!, patch),
  addRun: async (brandId: string, brief: string, cut: { posts: Post[] }) => {
    db.runs.push({ brandId, brief });
    for (const post of cut.posts) db.posts.set(post.id, structuredClone(post));
  },
}));

vi.mock("@/lib/read-site", () => ({
  readSite: async (url: string) => ({ url, title: "Acme Deploy", description: "One-click deploys", headings: ["Deploy in one click"], text: "Used by 40 teams." }),
}));

vi.mock("@/lib/cut", () => ({
  CAPTION_LIMIT: { x: 280, instagram: 2200, tiktok: 2200, linkedin: 3000, youtube: 5000 },
  cutWeek: async () => {
    const { recordUsage } = await import("@/lib/usage");
    recordUsage("TokenRouter", { model: "m", usage: { prompt_tokens: 100, completion_tokens: 50 } });
    if (answers.content === null) throw new Error("The cutter fell over.");
    const mk = (id: string, platform: Post["platform"], caption: string, slot: string): Post => ({
      id, platform, slot, hook: `Hook ${id}`, caption, visual: "", reply: "", status: "draft", publishState: "idle", notes: [],
    });
    return {
      via: "tokenrouter",
      note: "",
      posts: [
        mk("p1", "x", "Deploy in one click: acme.test", "2030-01-01T17:00:00Z"),
        mk("p2", "linkedin", "Read how at https://acme.test", "2030-01-01T18:00:00Z"),
        mk("p3", "instagram", "Link in bio", "2030-01-02T17:00:00Z"),
      ],
    };
  },
}));

vi.mock("@/lib/write", () => ({ writePiece: async () => ({ text: "Subject: Ship it\nTry acme.test today.", note: "" }) }));

vi.mock("@/lib/ai", async () => {
  const { recordUsage } = await import("@/lib/usage");
  const agentOf = (prompt: string): AgentId | null =>
    prompt.includes("research agent") ? "research" : prompt.includes("strategy agent") ? "strategy" : prompt.includes("community agent") ? "community" : prompt.includes("growth analyst") ? "analyst" : null;
  return {
    safeErr: (e: unknown) => (e instanceof Error ? e.message : String(e)),
    complete: async (prompt: string, options: { accept?: (text: string) => boolean } = {}) => {
      const agent = agentOf(prompt);
      const text = agent ? answers[agent] : undefined;
      if (!text) return { error: `No model answered for ${agent}.`, notes: [] };
      recordUsage("TokenRouter", { model: "m", usage: { prompt_tokens: 1000, completion_tokens: 200 } });
      if (options.accept && !options.accept(text)) return { error: "Unusable answer.", notes: [] };
      return { text, via: "tokenrouter", notes: [] };
    },
  };
});

// The analyst reads metrics and past funnels; this client has none.
vi.mock("@/lib/supabase/server", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "select", "eq", "gte", "order", "limit"]) chain[name] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return { db: () => chain, must: (r: { data: unknown }) => r.data };
});
vi.mock("@/lib/attribution-store", () => ({ boardReport: async () => ({ campaigns: [], unattributed: {}, since: "" }) }));
vi.mock("@/lib/accounts", () => ({ toMetric: (row: unknown) => row }));

const { runCampaign, beginCampaign } = await import("@/lib/agents/run");

function queue(id = "cmp_1") {
  db.campaigns.set(id, {
    id,
    brandId: brand.id,
    url: URL_,
    goal: "Beta sign-ups",
    competitors: [],
    status: "queued",
    createdAt: "2026-11-19T00:00:00Z",
    postIds: [],
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpriced: 0, models: [] },
    steps: ROSTER.map((agent) => ({ agent, status: "queued", note: "" })),
  });
  return id;
}

const step = (id: string, agent: AgentId) => db.campaigns.get(id)!.steps.find((s) => s.agent === agent)!;

beforeEach(() => {
  db.campaigns.clear();
  db.posts.clear();
  db.runs = [];
  answers.research = JSON.stringify({
    product: "Acme Deploy",
    oneLiner: "One-click deploys",
    audience: ["CTOs"],
    painPoints: ["Slow releases"],
    valueProps: ["Fast"],
    proofOnSite: ["Used by 40 teams"],
    competitors: [],
    gaps: ["Solo devs"],
  });
  answers.strategy = JSON.stringify({
    positioning: "Deploys without a platform team.",
    pillars: ["Speed", "Calm", "Proof"],
    channels: [{ platform: "x", why: "devs", cadence: "daily" }],
    days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, theme: `Theme ${day}`, objective: "o", cta: "Try it" })),
    kpis: ["Sign-ups"],
  });
  answers.content = "";
  answers.community = JSON.stringify({
    communities: [{ name: "r/devops", where: "Reddit", why: "CTOs", etiquette: "Contribute first" }],
    creatorSearches: [{ platform: "x", query: "#devops", fit: "Writes for CTOs" }],
    outreach: [{ to: "creator", channel: "DM", subject: "", message: "Your thread on release trains was useful. Want early access for your readers?" }],
    cautions: [],
  });
  answers.analyst = JSON.stringify({
    readout: "No numbers yet.",
    baseline: ["Record sign-ups by source"],
    experiments: [{ name: "Morning vs evening", hypothesis: "Mornings win", change: "Time", metric: "Clicks", successBar: "+20%", days: 7 }],
    tracking: ["UTM report"],
  });
});

describe("campaign pipeline", () => {
  it("runs all six agents, saves drafts, tags links, and ends ready with its spend", async () => {
    const id = queue();
    await runCampaign(id);
    const campaign = db.campaigns.get(id)!;
    expect(campaign.status).toBe("ready");
    expect(campaign.steps.map((s) => [s.agent, s.status])).toEqual(ROSTER.map((agent) => [agent, "done"]));
    expect(campaign.postIds).toEqual(["p1", "p2", "p3"]);

    // Distribution re-slotted the drafts and tagged the clickable links, not Instagram's.
    expect(db.posts.get("p1")!.caption).toMatch(/utm_campaign=lp-20261119-[0-9a-f]{6}/);
    expect(db.posts.get("p1")!.caption).toContain("utm_content=x-d1-1");
    expect(db.posts.get("p2")!.caption).toContain("utm_source=linkedin");
    expect(db.posts.get("p3")!.caption).toBe("Link in bio");
    expect(db.posts.get("p1")!.slot).not.toBe("2030-01-01T17:00:00Z");
    expect([...db.posts.values()].every((p) => p.status === "draft")).toBe(true);
    expect((step(id, "distribution").output as { newsletter?: string }).newsletter).toContain("utm_medium=email");

    // Every model call was metered against its step.
    expect(step(id, "research").usage).toMatchObject({ calls: 1, inputTokens: 1000 });
    expect(step(id, "content").usage).toMatchObject({ calls: 1, inputTokens: 100 });
    expect(step(id, "distribution").usage).toBeUndefined();

    // Outreach drafts never go out addressed to a guessed name.
    const community = step(id, "community").output as { outreach: { message: string }[] };
    expect(community.outreach[0].message.startsWith("Hi [NAME],")).toBe(true);
  });

  it("stops cleanly when research fails: later agents skipped, campaign failed, no drafts", async () => {
    answers.research = null;
    const id = queue();
    await runCampaign(id);
    const campaign = db.campaigns.get(id)!;
    expect(campaign.status).toBe("failed");
    expect(step(id, "research")).toMatchObject({ status: "failed", error: expect.stringContaining("No model answered") });
    for (const agent of ROSTER.slice(1)) expect(step(id, agent)).toMatchObject({ status: "skipped", note: "Stopped: research failed." });
    expect(db.posts.size).toBe(0);
  });

  it("keeps the drafts and finishes when a later agent fails", async () => {
    answers.community = null;
    const id = queue();
    await runCampaign(id);
    expect(db.campaigns.get(id)!.status).toBe("ready");
    expect(step(id, "community")).toMatchObject({ status: "failed", note: expect.stringContaining("drafts are safe") });
    expect(step(id, "analyst").status).toBe("done");
    expect(db.posts.size).toBe(3);
  });

  it("a failed content cut stops the run after strategy and keeps what was learned", async () => {
    answers.content = null;
    const id = queue();
    await runCampaign(id);
    expect(db.campaigns.get(id)!.status).toBe("failed");
    expect(step(id, "strategy").status).toBe("done");
    expect(step(id, "content")).toMatchObject({ status: "failed", usage: { calls: 1 } });
    expect(step(id, "distribution").status).toBe("skipped");
  });

  it("refuses to run the same campaign twice", async () => {
    const id = queue();
    expect(await beginCampaign(id)).toBe(true);
    expect(await beginCampaign(id)).toBe(false);
  });
});
