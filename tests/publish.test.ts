import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "@/lib/types";

const state = {
  post: null as null | { post: Post; brandId: string; cueId?: string; mediaPath?: string },
  claim: true,
  updates: [] as Record<string, unknown>[],
  /** How many "published" writes fail before one succeeds. */
  recordFailures: 0,
};

vi.mock("@/lib/store", () => ({
  MEDIA_BUCKET: "post-media",
  loadPost: async () => state.post,
  claimPublish: async () => state.claim,
  updatePost: async (_id: string, patch: Record<string, unknown>) => {
    if (patch.publish_state === "published" && state.recordFailures > 0) {
      state.recordFailures--;
      throw new Error("database hiccup");
    }
    state.updates.push(patch);
  },
}));
vi.mock("@/lib/analytics", () => ({ track: async () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ db: () => ({}) }));
vi.mock("@/lib/social/oauth", async (original) => {
  const real = await original<typeof import("@/lib/social/oauth")>();
  return {
    ...real,
    accountFor: async (brandId: string, platform: string) => ({ brandId, platform, accountId: "42", accountName: "@liftpage", token: "tok" }),
  };
});

const { publishPost, recordPublished } = await import("@/lib/social/publish");

function post(over: Partial<Post> = {}): Post {
  return {
    id: "p1",
    platform: "x",
    slot: "2026-11-18T17:00:00Z",
    hook: "Hook",
    caption: "Demo day is Friday.",
    visual: "",
    reply: "",
    status: "cued",
    publishState: "scheduled",
    notes: [],
    ...over,
  };
}

describe("publishPost", () => {
  beforeEach(() => {
    state.post = { post: post(), brandId: "b1", cueId: "c1" };
    state.claim = true;
    state.updates = [];
    state.recordFailures = 0;
    vi.restoreAllMocks();
  });

  it("stands down when another caller holds the claim", async () => {
    state.claim = false;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await publishPost("p1", "c1");
    expect(out).toMatchObject({ ok: false, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("posts to X and records the live URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { id: "999" } }), { status: 201 }));
    const out = await publishPost("p1", "c1");
    expect(out).toMatchObject({ ok: true, url: "https://x.com/liftpage/status/999" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.x.com/2/tweets");
    expect(JSON.parse(String(init!.body))).toEqual({ text: "Demo day is Friday." });
    expect(state.updates.at(-1)).toMatchObject({ publish_state: "published", published_url: "https://x.com/liftpage/status/999" });
  });

  it("fails a post over 280 characters without calling X", async () => {
    state.post!.post = post({ caption: "a".repeat(281) });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await publishPost("p1");
    expect(out).toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.updates.at(-1)).toMatchObject({ publish_state: "failed" });
  });

  it("records the network's own error text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ title: "Forbidden", detail: "duplicate content" }), { status: 403 }));
    const out = await publishPost("p1");
    expect(out.ok).toBe(false);
    expect(String(state.updates.at(-1)!.publish_error)).toContain("duplicate content");
  });

  it("Instagram without media fails before any request", async () => {
    state.post!.post = post({ platform: "instagram" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await publishPost("p1");
    expect(out).toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never marks a post failed after the network took it, even if recording fails", async () => {
    state.recordFailures = 99;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { id: "7" } }), { status: 201 }));
    const out = await publishPost("p1", "c1");
    expect(out).toMatchObject({ ok: true, url: "https://x.com/liftpage/status/7" });
    expect(String(out.ok && out.note)).toContain("Don't publish this line again");
    expect(state.updates.some((u) => u.publish_state === "failed")).toBe(false);
  }, 10_000);

  it("retries a flaky record and succeeds", async () => {
    state.recordFailures = 1;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ok = await recordPublished("p1", { url: "https://x.com/a/status/1" }, async () => undefined);
    expect(ok).toBe(true);
    expect(state.updates.at(-1)).toMatchObject({ publish_state: "published" });
  });

  it("is a no-op for a post that's gone", async () => {
    state.post = null;
    expect(await publishPost("nope")).toMatchObject({ ok: false, skipped: true });
  });
});
