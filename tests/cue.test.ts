import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "@/lib/types";

const state = { post: null as null | { post: Post; brandId: string }, updates: [] as Record<string, unknown>[], queued: true, events: [] as unknown[] };

vi.mock("@/lib/store", () => ({
  loadPost: async () => state.post,
  retireCue: async (_id: string, status: string) => {
    state.updates.push({ retire: status });
  },
  updatePost: async (_id: string, patch: Record<string, unknown>) => {
    state.updates.push(patch);
  },
}));
const guarded: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/server", () => {
  // A chainable stand-in for db().from("posts").update(...).eq(...)...
  const chain = (patch: Record<string, unknown>) => {
    const filters: Record<string, unknown> = {};
    const link = {
      eq(column: string, value: unknown) {
        filters[column] = value;
        return link;
      },
      then(resolve: (v: unknown) => void) {
        guarded.push({ patch, filters });
        resolve({ data: null, error: null });
      },
    };
    return link;
  };
  return { db: () => ({ from: () => ({ update: chain }) }) };
});
vi.mock("@/lib/inngest/client", () => ({
  enqueue: async (...args: unknown[]) => {
    state.events.push(args);
    return state.queued;
  },
}));

const { setPostStatus } = await import("@/lib/cue");

const base = (over: Partial<Post> = {}): Post => ({
  id: "p1", platform: "x", slot: "2099-01-01T00:00:00Z", hook: "", caption: "", visual: "", reply: "",
  status: "approved", publishState: "idle", notes: [], ...over,
});

describe("setPostStatus", () => {
  beforeEach(() => {
    state.post = { post: base(), brandId: "b" };
    state.updates = [];
    state.events = [];
    state.queued = true;
    guarded.length = 0;
  });

  it("cue: scheduled is written before the job goes out, never after", async () => {
    const out = await setPostStatus("p1", "cued");
    expect(out).toEqual({ note: "Cued. It posts at the slot." });
    expect(state.updates).toHaveLength(1);
    const cueId = state.updates[0].cue_id as string;
    expect(cueId).toMatch(/^cue_/);
    expect(state.updates[0]).toMatchObject({ status: "cued", publish_state: "scheduled" });
    expect(state.events[0]).toEqual(["liftpage/post.cued", { postId: "p1", cueId, slot: "2099-01-01T00:00:00Z" }, `cue/${cueId}`]);
  });

  it("cue without a job queue says so and stays idle", async () => {
    state.queued = false;
    const out = await setPostStatus("p1", "cued");
    expect("note" in out && out.note).toMatch(/Publish now/);
    // Steps back to idle only if this cue is still the one scheduled.
    const cueId = state.updates[0].cue_id;
    expect(guarded).toEqual([{ patch: expect.objectContaining({ publish_state: "idle" }), filters: { id: "p1", cue_id: cueId, publish_state: "scheduled" } }]);
  });

  it("un-cueing retires the cue so a sleeping job stands down", async () => {
    state.post = { post: base({ status: "cued", publishState: "scheduled" }), brandId: "b" };
    await setPostStatus("p1", "draft");
    expect(state.updates).toEqual([{ retire: "draft" }]);
  });

  it("won't touch a published or publishing post", async () => {
    state.post = { post: base({ publishState: "published" }), brandId: "b" };
    expect(await setPostStatus("p1", "draft")).toHaveProperty("error");
    state.post = { post: base({ publishState: "publishing" }), brandId: "b" };
    expect(await setPostStatus("p1", "cued")).toHaveProperty("error");
    expect(state.updates).toEqual([]);
  });
});

describe("retireCue", () => {
  it("only steps publish_state back from scheduled, never from publishing", async () => {
    vi.resetModules();
    const calls: { patch: Record<string, unknown>; filters: [string, unknown][] }[] = [];
    vi.doMock("@/lib/supabase/server", () => ({
      db: () => ({
        from: () => ({
          update: (patch: Record<string, unknown>) => {
            const filters: [string, unknown][] = [];
            const link = {
              eq(column: string, value: unknown) {
                filters.push([column, value]);
                return link;
              },
              then(resolve: (v: unknown) => void) {
                calls.push({ patch, filters });
                resolve({ data: null, error: null });
              },
            };
            return link;
          },
        }),
      }),
      must: <T>(r: { data: T }) => r.data,
    }));
    vi.doUnmock("@/lib/store");
    const { retireCue } = await import("@/lib/store");
    await retireCue("p1", "draft");
    expect(calls[0].patch).toMatchObject({ status: "draft", cue_id: null });
    expect(calls[0].patch).not.toHaveProperty("publish_state");
    expect(calls[1].patch).toMatchObject({ publish_state: "idle" });
    expect(calls[1].filters).toEqual([["id", "p1"], ["publish_state", "scheduled"]]);
  });
});
