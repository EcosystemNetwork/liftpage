// Keeps harnessrouter.json in step with the live HarnessRouter Harness.
//
//   1. npm run harness:pull   fetch the live Harness, rewrite harnessrouter.json from it, keep its ETag
//   2. edit harnessrouter.json (name, model, instructions)
//   3. npm run harness:push   PUT the FULL Harness with If-Match: <that ETag>, then read it back
//
// A 412 on push means the Harness was edited in HarnessRouter after your pull: pull again, redo
// your change, push again. Reads HR_API_KEY or HARNESSROUTER_API_KEY (from .env.local too).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.harnessrouter.ai";
const ROOT = join(import.meta.dirname, "..");
const FILE = join(ROOT, "harnessrouter.json");
const ETAG_FILE = join(ROOT, ".harnessrouter-etag"); // local only, gitignored
const KEYS = ["harness_id", "name", "base", "model", "instructions"];

const key = process.env.HR_API_KEY?.trim() || process.env.HARNESSROUTER_API_KEY?.trim();
if (!key) {
  console.error("Set HR_API_KEY or HARNESSROUTER_API_KEY (for example in .env.local).");
  process.exit(2);
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(API + path, {
    method,
    redirect: "manual",
    headers: { Authorization: `Bearer ${key}`, "UHP-Version": "2026-09-28", Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, etag: res.headers.get("etag"), json };
}

const read = () => JSON.parse(readFileSync(FILE, "utf8"));
const write = (s) => writeFileSync(FILE, JSON.stringify(s, null, 2) + "\n");
const fromLive = (h) => ({ harness_id: h.id, name: h.name, base: h.base, model: h.defaultModel, instructions: h.systemPrompt });
const diff = (a, b) => KEYS.filter((k) => a[k] !== b[k]);
const fail = (res) => {
  console.error(`HarnessRouter answered ${res.status} ${res.json?.error?.code ?? ""}`.trim());
  process.exit(2);
};

const cmd = process.argv[2];
const file = read();
const path = `/v1/harnesses/${encodeURIComponent(file.harness_id)}`;

if (cmd === "pull") {
  const got = await call("GET", path);
  if (got.status !== 200) fail(got);
  const live = fromLive(got.json);
  const changed = diff(file, live);
  write(live);
  if (got.etag) writeFileSync(ETAG_FILE, got.etag + "\n");
  console.log(JSON.stringify({ status: changed.length ? "UPDATED_FILE" : "UNCHANGED", changed, etag: got.etag }));
} else if (cmd === "push") {
  let etag;
  try {
    etag = readFileSync(ETAG_FILE, "utf8").trim();
  } catch {
    console.log(JSON.stringify({ status: "NO_ETAG", note: "Run harness:pull first, then edit harnessrouter.json, then push." }));
    process.exit(2);
  }
  // The live record supplies every field the file doesn't track (tools, skills, budgets...): PUT replaces all of them.
  const got = await call("GET", path);
  if (got.status !== 200) fail(got);
  const live = got.json;
  if (file.base !== live.base) {
    console.log(JSON.stringify({ status: "BASE_IMMUTABLE", note: "A Harness can't change base. Create a new Harness and move the app to it." }));
    process.exit(2);
  }
  const body = {
    name: file.name, base: live.base, default_model: file.model, system_prompt: file.instructions,
    mcp_servers: live.mcpServers, skills: live.skills, plugins: live.plugins, additional_headers: live.additionalHeaders,
    env: live.env, max_step: live.maxStep, timeout_seconds: live.timeoutSeconds, max_cost_usd: live.maxCostUsd,
    reasoning_effort: live.reasoningEffort ?? "", environment: live.environment ?? "", disabled_tools: live.disabledTools ?? [],
  };
  const put = await call("PUT", path, body, { "If-Match": etag });
  if (put.status === 412) {
    console.log(JSON.stringify({ status: "CONFLICT", note: "The Harness changed in HarnessRouter meanwhile. Run harness:pull, redo your change, then push again." }));
    process.exit(1);
  }
  if (put.status !== 200) fail(put);
  const after = await call("GET", path);
  if (after.status !== 200) fail(after);
  const mismatch = diff(file, fromLive(after.json));
  if (after.etag) writeFileSync(ETAG_FILE, after.etag + "\n");
  console.log(JSON.stringify({ status: mismatch.length ? "READBACK_MISMATCH" : "UPDATED", mismatch }));
  if (mismatch.length) process.exit(1);
} else {
  console.log("usage: node scripts/harness-sync.mjs pull|push");
  process.exit(2);
}
