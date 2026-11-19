import { describe, expect, it } from "vitest";
import { fitCaption, parsePosts, parseRevision, safeErr } from "@/lib/cut";
import { canUse, cleanTools, CLIENT_TOOLS } from "@/lib/tools";

const slots = ["2026-11-20T17:00:00Z", "2026-11-21T17:00:00Z", "2026-11-22T17:00:00Z", "2026-11-23T17:00:00Z"];

describe("captions fit the network", () => {
  it("holds X to 280 code points and keeps paragraph breaks elsewhere", () => {
    const long = "a".repeat(400);
    expect([...fitCaption("x", long)].length).toBe(280);
    expect(fitCaption("linkedin", "one\n\ntwo")).toBe("one\n\ntwo");
  });

  it("clips an AI week so X posts can publish", () => {
    const answer = JSON.stringify({
      posts: [
        { platform: "x", hook: "h", caption: "b".repeat(600), visual: "v", reply: "r" },
        { platform: "linkedin", hook: "h", caption: "para one\n\npara two", visual: "v", reply: "r" },
        { platform: "Twitter", hook: "h", caption: "short", visual: "v", reply: "r" },
      ],
    });
    const posts = parsePosts(answer, slots)!;
    expect(posts).toHaveLength(3);
    expect([...posts[0].caption].length).toBeLessThanOrEqual(280);
    expect(posts[1].caption).toContain("\n\n");
    expect(posts[2].platform).toBe("x");
  });
});

describe("parseRevision", () => {
  it("reads a rewrite, wrapped or bare, inside chatter", () => {
    expect(parseRevision('Sure! {"hook":"H","caption":"C","visual":"V","reply":"R"}', "linkedin")).toEqual({ hook: "H", caption: "C", visual: "V", reply: "R" });
    expect(parseRevision('{"post":{"caption":"C"}}', "x")?.caption).toBe("C");
  });

  it("rejects answers with no caption or no JSON", () => {
    expect(parseRevision('{"hook":"only"}', "x")).toBeNull();
    expect(parseRevision("no json here", "x")).toBeNull();
  });
});

describe("safeErr", () => {
  it("hides dashed and underscored keys", () => {
    const out = safeErr(new Error("bad key sk-hr-abc123 and sk-XyZ and tr_9 and Bearer abc.def"));
    expect(out).not.toMatch(/abc123|XyZ|tr_9|abc\.def/);
  });
});

describe("client tools", () => {
  const client = { role: "client" as const, disabled: false, tools: ["week", "press"] };

  it("cleans unknown and repeated ids into list order", () => {
    expect(cleanTools(["press", "nope", "week", "press"])).toEqual(["week", "press"]);
    expect(cleanTools("week")).toEqual([]);
  });

  it("gives clients only what was switched on, admins everything", () => {
    expect(canUse(client, "week")).toBe(true);
    expect(canUse(client, "redraft")).toBe(false);
    expect(canUse({ ...client, disabled: true }, "week")).toBe(false);
    for (const tool of CLIENT_TOOLS) expect(canUse({ role: "admin", disabled: false, tools: [] }, tool.id)).toBe(true);
  });
});
