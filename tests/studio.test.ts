import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HarnessRouter, answerText, safeRelPath, signPreview, taskBody, verifyPreview } from "@/lib/harnessrouter";
import {
  STUDIO_HARNESS_ID, Studio, StudioError, canContinue, checkUploads, friendlyError, outputFiles, safeUploadName, taskView,
  type StudioStore, type StudioTask,
} from "@/lib/studio";
import { CLIENT_TOOLS, canUse } from "@/lib/tools";

const SID = "hsess_t1";
const FILES = [
  { id: "cfile_up", filename: "brief.pdf", path: "brief.pdf", bytes: 4, media_type: "application/pdf" },
  { id: "cfile_img", filename: "slide-1.png", path: "out/slide-1.png", bytes: 3, media_type: "image/png" },
  { id: "cfile_html", filename: "index.html", path: "out/index.html", bytes: 20, media_type: "text/html" },
];

type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };

/** A fake HarnessRouter Cloud: background tasks finish after `pollsUntilDone` polls. */
function fakeCloud(opts: { failStart?: { status: number; code: string }; pollsUntilDone?: number } = {}) {
  const calls: Call[] = [];
  let n = 0;
  let polls = 0;
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    const c = { method: init?.method ?? "GET", path: url.pathname + url.search, headers, body };
    calls.push(c);
    if (url.origin !== "https://api.harnessrouter.ai") throw new Error("key sent elsewhere");
    if (c.method === "POST" && c.path === "/v1/files") return json({ id: `file_${++n}` });
    if (c.method === "POST" && c.path === "/v1/responses") {
      if (opts.failStart) return json({ error: { code: opts.failStart.code, message: "upstream secret detail" } }, opts.failStart.status);
      return json({ id: `resp_${++n}`, object: "response", status: "in_progress", output: [], metadata: { session_id: SID } });
    }
    if (c.method === "GET" && c.path.startsWith("/v1/responses/")) {
      const id = c.path.split("/")[3];
      if (++polls < (opts.pollsUntilDone ?? 1)) return json({ id, status: "in_progress", output: [] });
      return json({
        id, status: "completed", metadata: { session_id: SID }, output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "Reading the brief." }] },
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "## Summary\nNorthwind, Instagram.\n\n1. Draft one" }] },
        ],
      });
    }
    if (c.method === "POST" && /\/cancel$/.test(c.path)) return json({ id: "x", status: "cancelled", output: [] });
    if (c.method === "GET" && c.path.startsWith(`/v1/sessions/${SID}/files`)) return json({ files: FILES });
    return json({ error: { code: "not_found" } }, 404);
  }) as typeof fetch;
  return { calls, fetchImpl, client: () => new HarnessRouter({ apiKey: "sk-hr-test", fetch: fetchImpl }) };
}

function memoryStore(): StudioStore & { rows: Map<string, StudioTask> } {
  const rows = new Map<string, StudioTask>();
  return {
    rows,
    async create(t) { rows.set(t.id, { ...t }); },
    async update(id, patch) { const next = { ...rows.get(id)!, ...patch, updatedAt: new Date().toISOString() }; rows.set(id, next); return { ...next }; },
    async get(id) { const t = rows.get(id); return t ? { ...t } : null; },
    async thread(threadId, userId) { return [...rows.values()].filter((t) => t.threadId === threadId && t.userId === userId).map((t) => ({ ...t })); },
    async threads() { return []; },
  };
}

const posts = (cloud: ReturnType<typeof fakeCloud>) => cloud.calls.filter((c) => c.method === "POST" && c.path === "/v1/responses");
const SECRET = Buffer.alloc(32, 7);
const sign = (id: string) => signPreview(id, SECRET);

describe("content studio: the harness", () => {
  it("is the one in harnessrouter.json, and is a tool admins can switch on", () => {
    const file = JSON.parse(readFileSync(path.join(__dirname, "..", "harnessrouter.json"), "utf8"));
    expect(file.harness_id).toBe(STUDIO_HARNESS_ID);
    expect(Object.keys(file).sort()).toEqual(["base", "harness_id", "instructions", "model", "name"]);
    expect(CLIENT_TOOLS.some((t) => t.id === "studio")).toBe(true);
    expect(canUse({ role: "client", disabled: false, tools: [] }, "studio")).toBe(false);
    expect(canUse({ role: "client", disabled: false, tools: ["studio"] }, "studio")).toBe(true);
    expect(canUse({ role: "admin", disabled: false, tools: [] }, "studio")).toBe(true);
  });

  it("builds the documented body: background, user, harness id; follow-ups add both ids", () => {
    expect(taskBody({ harnessId: "chrn_x", input: "hi", user: "u1", idempotencyKey: "k" })).toEqual({
      input: "hi", user: "u1", metadata: { harness_id: "chrn_x" }, background: true,
    });
    expect(taskBody({ harnessId: "chrn_x", input: "more", user: "u1", idempotencyKey: "k", previousResponseId: "resp_1", sessionId: "hsess_1" })).toEqual({
      input: "more", user: "u1", metadata: { harness_id: "chrn_x", session_id: "hsess_1" }, background: true, previous_response_id: "resp_1",
    });
  });
});

describe("content studio: tasks", () => {
  it("starts one task for what the person typed, on the studio harness, as that person", async () => {
    const cloud = fakeCloud();
    const store = memoryStore();
    const task = await new Studio(store, cloud.client).start("user-a", "Three LinkedIn posts for Northwind. Goal: book demos.", []);
    const [post] = posts(cloud);
    expect(post.body).toEqual({
      input: "Three LinkedIn posts for Northwind. Goal: book demos.", user: "user-a",
      metadata: { harness_id: STUDIO_HARNESS_ID }, background: true,
    });
    expect(post.headers.authorization).toBe("Bearer sk-hr-test");
    expect(post.headers["uhp-version"]).toBe("2026-09-28");
    expect(post.headers["idempotency-key"]).toBe(task.idempotencyKey);
    expect(task).toMatchObject({ status: "in_progress", sessionId: SID, threadId: task.id, userId: "user-a" });
    expect(task.responseId).toMatch(/^resp_/);
  });

  it("polls to a result: the last message is the answer, the person's uploads aren't outputs", async () => {
    const cloud = fakeCloud({ pollsUntilDone: 2 });
    const store = memoryStore();
    const studio = new Studio(store, cloud.client);
    const [up] = checkUploads([{ name: "brief.pdf", bytes: new TextEncoder().encode("PDF!") }]);
    let task = await studio.start("user-a", "Use the brief", [up]);
    const sent = posts(cloud)[0].body as { input: { content: { type: string; file_id?: string; text?: string }[] }[] };
    expect(sent.input[0].content[0]).toEqual({ type: "input_text", text: "Use the brief" });
    expect(sent.input[0].content[1]).toMatchObject({ type: "input_file" });
    expect(cloud.calls.some((c) => c.path === "/v1/files")).toBe(true);

    task = await studio.refresh(task);
    expect(task.status).toBe("in_progress");
    task = await studio.refresh(task);
    expect(task.status).toBe("completed");
    expect(task.answer).toBe("## Summary\nNorthwind, Instagram.\n\n1. Draft one");
    expect(cloud.calls.some((c) => c.path === `/v1/sessions/${SID}/files?changed=true`)).toBe(true);
    expect(outputFiles(task).map((f) => f.path)).toEqual(["out/slide-1.png", "out/index.html"]);
    // done tasks aren't polled again
    const before = cloud.calls.length;
    await studio.refresh(task);
    expect(cloud.calls.length).toBe(before);
  });

  it("continues the same session on the same harness, and only once the last task ended", async () => {
    const cloud = fakeCloud({ pollsUntilDone: 2 });
    const store = memoryStore();
    const studio = new Studio(store, cloud.client);
    const first = await studio.start("user-a", "Instagram carousel for Northwind", []);
    await expect(studio.followUp("user-a", first.threadId, "punchier", [])).rejects.toMatchObject({ status: 409 });
    expect(posts(cloud)).toHaveLength(1);
    await studio.refresh(first);
    const next = await studio.followUp("user-a", first.threadId, "Make slide 2 punchier", []);
    const body = posts(cloud)[1].body as Record<string, unknown>;
    expect(body).toEqual({
      input: "Make slide 2 punchier", user: "user-a", previous_response_id: first.responseId,
      metadata: { harness_id: STUDIO_HARNESS_ID, session_id: SID }, background: true,
    });
    expect(next.threadId).toBe(first.threadId);
    expect(next.parentId).toBe(first.id);
    expect(posts(cloud)[0].headers["idempotency-key"]).not.toBe(posts(cloud)[1].headers["idempotency-key"]);
  });

  it("keeps people apart: another person can't continue, cancel or open someone's task", async () => {
    const cloud = fakeCloud();
    const studio = new Studio(memoryStore(), cloud.client);
    const task = await studio.start("user-a", "Northwind posts", []);
    await expect(studio.followUp("user-b", task.threadId, "mine now", [])).rejects.toMatchObject({ status: 404 });
    await expect(studio.cancel("user-b", task.id)).rejects.toMatchObject({ status: 404 });
    expect(await studio.owned("user-b", task.id)).toBeNull();
    expect(await studio.refreshThread("user-b", task.threadId)).toEqual([]);
    expect((await studio.cancel("user-a", task.id)).status).toBe("cancelled");
  });

  it("turns upstream errors into plain sentences, and a missing key into a 503 with nothing saved", async () => {
    const cloud = fakeCloud({ failStart: { status: 401, code: "invalid_credential" } });
    const store = memoryStore();
    const task = await new Studio(store, cloud.client).start("user-a", "Northwind posts", []);
    expect(task).toMatchObject({ status: "failed", errorCode: "invalid_credential" });
    const view = taskView(task, sign);
    expect(view.error).toBe(friendlyError("invalid_credential"));
    expect(JSON.stringify(view)).not.toContain("upstream secret detail");
    expect(canContinue([task])).toBe(false);

    const empty = memoryStore();
    const noKey = new Studio(empty, () => {
      throw new Error("no key");
    });
    await expect(noKey.start("user-a", "x", [])).rejects.toBeInstanceOf(StudioError);
    expect(empty.rows.size).toBe(0);
  });

  it("shows the browser no HarnessRouter ids, urls or keys", async () => {
    const cloud = fakeCloud();
    const studio = new Studio(memoryStore(), cloud.client);
    const task = await studio.refresh(await studio.start("user-a", "Northwind posts", []));
    const raw = JSON.stringify(taskView(task, sign));
    for (const leak of ["resp_", "hsess", "chrn_", "cfile_", "harnessrouter.ai", "sk-hr"]) expect(raw).not.toContain(leak);
    const files = taskView(task, sign).files;
    expect(files.find((f) => f.kind === "html")?.previewUrl).toMatch(/^\/api\/studio\/preview\/stk_/);
    expect(files.find((f) => f.kind === "image")?.url).toBe(`/api/studio/files/${task.id}/1?download=1`);
  });
});

describe("content studio: uploads and previews", () => {
  it("accepts briefs and photos, renames them safely, and refuses the rest", () => {
    const bytes = new Uint8Array([1]);
    expect(checkUploads([{ name: "../../Brief Final!.pdf", bytes }, { name: "Brief Final.pdf", bytes }]).map((u) => u.name)).toEqual([
      "Brief-Final.pdf", "Brief-Final-2.pdf",
    ]);
    expect(() => checkUploads([{ name: "run.exe", bytes }])).toThrow(StudioError);
    expect(() => checkUploads([{ name: "big.png", bytes: new Uint8Array(5 * 1024 * 1024) }])).toThrow(/too big/);
    expect(safeUploadName("photo.JPG", new Set())).toBe("photo.jpg");
  });

  it("signs previews for one task, and rejects tampered or expired links", () => {
    const token = signPreview("stk_abc", SECRET, 60, 1_000_000);
    expect(verifyPreview(token, SECRET, 1_000_000)).toBe("stk_abc");
    expect(verifyPreview(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), SECRET, 1_000_000)).toBeNull();
    expect(verifyPreview(token, SECRET, 1_000_000 + 61_000)).toBeNull();
    expect(verifyPreview(token, Buffer.alloc(32, 8), 1_000_000)).toBeNull();
    expect(safeRelPath("out/index.html")).toBe("out/index.html");
    for (const bad of ["../x", "/etc/passwd", "a//b", "a\\b", ""]) expect(safeRelPath(bad)).toBeNull();
  });

  it("reads the answer from the last message only", () => {
    expect(answerText({ output: [
      { type: "message", content: [{ type: "output_text", text: "note" }] },
      { type: "function_call" },
      { type: "message", content: [{ type: "output_text", text: "A" }, { type: "output_text", text: "B" }] },
    ] })).toBe("AB");
  });
});
