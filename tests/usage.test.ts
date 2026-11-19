import { describe, expect, it } from "vitest";
import { addUsage, metered, priceTable, recordUsage, summarizeUsage, usageFrom, usageLabel, usageOf } from "@/lib/usage";

describe("usageFrom", () => {
  it("reads chat-completions and Responses usage", () => {
    expect(usageFrom("TokenRouter", { model: "m", usage: { prompt_tokens: 10, completion_tokens: 5 } })).toEqual({ backend: "TokenRouter", model: "m", inputTokens: 10, outputTokens: 5 });
    expect(usageFrom("HarnessRouter", { usage: { input_tokens: 7, output_tokens: 3 } })?.model).toBe("unknown");
  });
  it("ignores bodies without usage", () => {
    expect(usageFrom("x", { output_text: "hi" })).toBeNull();
    expect(usageFrom("x", "text")).toBeNull();
    expect(usageFrom("x", { usage: { prompt_tokens: -4 } })).toBeNull();
  });
});

describe("priceTable", () => {
  it("keeps only well-formed prices", () => {
    expect(priceTable('{"a":[1,2],"b":[1],"c":"x","d":[-1,2]}')).toEqual({ a: [1, 2] });
    expect(priceTable("not json")).toEqual({});
  });
});

describe("summarizeUsage", () => {
  it("prices known models and counts the rest as unpriced, never guessing", () => {
    const usage = summarizeUsage(
      [
        { backend: "t", model: "a", inputTokens: 1_000_000, outputTokens: 500_000 },
        { backend: "h", model: "b", inputTokens: 100, outputTokens: 100 },
      ],
      { a: [0.5, 2] },
    );
    expect(usage.costUsd).toBe(1.5);
    expect(usage.unpriced).toBe(1);
    expect(usage.models).toEqual(["a", "b"]);
    expect(usageLabel(usage)).toBe("$1.50+ · 1500.2k tokens (1 unpriced)");
  });
});

describe("metered", () => {
  it("counts calls made inside it and nothing outside", async () => {
    recordUsage("t", { model: "a", usage: { prompt_tokens: 99, completion_tokens: 1 } });
    const { value, usage } = await metered(async () => {
      recordUsage("t", { model: "a", usage: { prompt_tokens: 10, completion_tokens: 5 } });
      await Promise.resolve();
      recordUsage("t", { model: "a", usage: { prompt_tokens: 1, completion_tokens: 1 } });
      return "ok";
    });
    expect(value).toBe("ok");
    expect(usage.calls).toBe(2);
    expect(usage.inputTokens).toBe(11);
  });
  it("keeps parallel meters apart", async () => {
    const one = metered(async () => {
      await new Promise((r) => setTimeout(r, 5));
      recordUsage("t", { model: "a", usage: { prompt_tokens: 1, completion_tokens: 0 } });
    });
    const two = metered(async () => recordUsage("t", { model: "a", usage: { prompt_tokens: 2, completion_tokens: 0 } }));
    const [a, b] = await Promise.all([one, two]);
    expect([a.usage.inputTokens, b.usage.inputTokens]).toEqual([1, 2]);
  });
  it("attaches the spend to a thrown error", async () => {
    const error = await metered(async () => {
      recordUsage("t", { model: "a", usage: { prompt_tokens: 3, completion_tokens: 0 } });
      throw new Error("bad answer");
    }).catch((e: unknown) => e);
    expect(usageOf(error)?.inputTokens).toBe(3);
  });
});

describe("addUsage", () => {
  it("adds steps and skips missing ones", () => {
    const a = summarizeUsage([{ backend: "t", model: "a", inputTokens: 1, outputTokens: 1 }], {});
    const total = addUsage(a, undefined, a);
    expect(total.calls).toBe(2);
    expect(total.models).toEqual(["a"]);
    expect(usageLabel(addUsage())).toBe("no model calls");
  });
});
