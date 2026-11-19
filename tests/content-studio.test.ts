import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { complete, routeAllows } from "@/lib/ai";
import { titleFrom } from "@/lib/content-drafts";
import { checkRoute, parseCatalog } from "@/lib/harness-catalog";

const catalog = {
  harnesses: [
    { id: "codex", defaultModel: "gpt-6.1-sol", models: ["gpt-6.1-sol", "gpt-5.4-mini"] },
    { id: "claude", defaultModel: "claude-sonnet-5.5", models: ["claude-sonnet-5.5", "claude-opus-5.5"] },
  ],
};

describe("parseCatalog", () => {
  it("keeps available models and a default that is on the list", () => {
    const harnesses = parseCatalog({
      backends: {
        codex: { default: "gpt-6.1-sol", models: [{ id: "gpt-6.1-sol", available: true }, { id: "gone", available: false }] },
        qoder: { default: "auto", models: [{ id: "auto", available: false }] },
        odd: { default: "missing", models: [{ id: "m1" }] },
        "bad id!": { models: [{ id: "x" }] },
      },
    });
    expect(harnesses).toEqual([
      { id: "codex", defaultModel: "gpt-6.1-sol", models: ["gpt-6.1-sol"] },
      { id: "odd", defaultModel: "m1", models: ["m1"] },
    ]);
  });

  it("returns nothing for junk", () => {
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog({ backends: [] })).toEqual([]);
  });
});

describe("checkRoute", () => {
  it("accepts a listed harness and model, and fills the harness default", () => {
    expect(checkRoute({ backend: "harnessrouter", harness: "claude", model: "claude-opus-5.5" }, catalog)).toEqual({
      backend: "harnessrouter",
      harness: "claude",
      model: "claude-opus-5.5",
    });
    expect(checkRoute({ harness: "claude" }, catalog)).toEqual({ backend: "auto", harness: "claude", model: "claude-sonnet-5.5" });
  });

  it("refuses harnesses and models that aren't offered", () => {
    expect(checkRoute({ harness: "nope" }, catalog)).toHaveProperty("error");
    expect(checkRoute({ harness: "codex", model: "claude-opus-5.5" }, catalog)).toHaveProperty("error");
  });

  it("drops harness fields for TokenRouter and defaults junk to auto", () => {
    expect(checkRoute({ backend: "tokenrouter", harness: "nope" }, catalog)).toEqual({ backend: "tokenrouter" });
    expect(checkRoute({ backend: "everything" }, catalog)).toEqual({ backend: "auto" });
    expect(checkRoute(undefined, catalog)).toEqual({ backend: "auto" });
  });
});

describe("routeAllows", () => {
  it("lets auto use both and a forced backend only itself", () => {
    expect(routeAllows(undefined, "tokenrouter")).toBe(true);
    expect(routeAllows({ backend: "harnessrouter" }, "tokenrouter")).toBe(false);
    expect(routeAllows({ backend: "tokenrouter" }, "tokenrouter")).toBe(true);
  });
});

describe("complete with a route", () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("HARNESSROUTER_BASE_URL", "https://harness.test");
    vi.stubEnv("HARNESSROUTER_API_KEY", "hr-test");
    vi.stubEnv("TOKENROUTER_BASE_URL", "https://token.test/v1");
    vi.stubEnv("TOKENROUTER_API_KEY", "tr-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ output_text: "an answer long enough" }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the picked harness and model to HarnessRouter", async () => {
    const out = await complete("hi", { route: { backend: "harnessrouter", harness: "claude", model: "claude-opus-5.5" } });
    expect(out).toMatchObject({ via: "harnessrouter" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://harness.test/v1/responses");
    expect(calls[0].body).toMatchObject({ backend: "claude", model: "claude-opus-5.5" });
    // harness_id names a saved custom harness; sending it for a picked backend 404s.
    expect(calls[0].body).not.toHaveProperty("metadata");
  });

  it("goes straight to TokenRouter when that is forced", async () => {
    const out = await complete("hi", { route: { backend: "tokenrouter" } });
    expect(out).toMatchObject({ via: "tokenrouter" });
    expect(calls.map((c) => c.url)).toEqual(["https://token.test/v1/chat/completions"]);
  });

  it("doesn't fall back when HarnessRouter only is forced and fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const out = await complete("hi", { route: { backend: "harnessrouter" } });
    expect(out).toHaveProperty("error");
    expect((out as { error: string }).error).toMatch(/HarnessRouter skipped/);
    expect((out as { error: string }).error).not.toMatch(/TokenRouter/);
  });
});

describe("titleFrom", () => {
  it("takes the first real line, without heading marks or a Subject label", () => {
    expect(titleFrom("\n# Subject line: Our second bakery\n\nBody")).toBe("Our second bakery");
    expect(titleFrom("   ")).toBe("Untitled");
  });
});
