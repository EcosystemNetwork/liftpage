import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * HarnessRouter Cloud client for agent tasks that run longer than one request: start in
 * background mode, poll, follow up on the same session, cancel, and fetch the files a task
 * made. Adapted from HarnessRouter's integration Skill (github.com/HarnessRouter/plugins,
 * Apache-2.0). `lib/ai.ts` keeps serving the short, blocking prompts.
 *
 * The key goes only to api.harnessrouter.ai, set here rather than from config, and never
 * follows a redirect.
 */

export const HR_API = "https://api.harnessrouter.ai";
export const UHP_VERSION = "2026-09-28";
export const TERMINAL = new Set(["completed", "incomplete", "failed", "cancelled"]);

/** HR_API_KEY, else the key the rest of the app already uses. */
export function harnessKey(): string | undefined {
  return process.env.HR_API_KEY?.trim() || process.env.HARNESSROUTER_API_KEY?.trim() || undefined;
}

// ── shapes (HarnessRouter API, UHP 2026-09-28) ──────────────────────────────────────────────
export type Annotation = { type: string; container_id: string; file_id: string; filename: string };
export type OutputItem = { type: string; role?: string; content?: { type: string; text?: string; annotations?: Annotation[] }[] };
export type HRResponse = {
  id: string;
  status: string;
  output: OutputItem[];
  incomplete_details?: { reason?: string } | null;
  metadata?: { session_id?: string; [k: string]: unknown };
};
export type SessionFile = { id: string; filename: string; path: string; bytes: number; media_type: string };
export type Harness = {
  id: string; name: string; base: string; defaultModel: string; systemPrompt: string;
  mcpServers: unknown[]; skills: unknown[]; plugins: unknown[]; additionalHeaders: string[]; env: Record<string, string>;
  maxStep: number | null; timeoutSeconds: number | null; maxCostUsd: number | null;
  reasoningEffort?: string; environment?: string; disabledTools?: string[];
};

export class HRError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, body: unknown) {
    const envelope = (body && typeof body === "object" ? body : {}) as { error?: { code?: unknown; message?: unknown }; detail?: unknown };
    super(String(envelope.error?.message ?? (typeof envelope.detail === "string" ? envelope.detail : "") ?? "") || `HTTP ${status}`);
    this.name = "HRError";
    this.status = status;
    this.code = String(envelope.error?.code ?? (status === 404 ? "not_found" : status === 429 ? "rate_limited" : "unknown"));
  }
  /** Worth one retry: network-level trouble upstream. */
  get retryable(): boolean {
    return [429, 502, 503, 504].includes(this.status);
  }
}

/** The answer: the output_text of the LAST message item. Earlier messages are progress notes. */
export function answerText(r: Pick<HRResponse, "output">): string {
  const messages = (r.output || []).filter((i) => i.type === "message");
  const last = messages.at(-1);
  return (last?.content || []).filter((c) => c.type === "output_text").map((c) => c.text || "").join("");
}

export type TaskStart = {
  harnessId: string;
  /** What the person typed, or a message list with input_text / input_file parts. */
  input: unknown;
  /** The product's id for the signed-in person. Never from the request body. */
  user: string;
  idempotencyKey: string;
  /** Follow-ups only, from the stored record of the task being continued. */
  previousResponseId?: string;
  sessionId?: string;
};

/** The documented request body: one task, or a follow-up on the same session. */
export function taskBody(t: TaskStart): Record<string, unknown> {
  const metadata: Record<string, string> = { harness_id: t.harnessId };
  if (t.sessionId) metadata.session_id = t.sessionId;
  const body: Record<string, unknown> = { input: t.input, user: t.user, metadata, background: true };
  if (t.previousResponseId) body.previous_response_id = t.previousResponseId;
  return body;
}

export class HarnessRouter {
  private readonly key: string;
  private readonly http: typeof fetch;

  constructor(opts: { apiKey?: string; fetch?: typeof fetch } = {}) {
    const key = opts.apiKey ?? harnessKey();
    if (!key) throw new HRError(401, { error: { code: "not_configured", message: "No HarnessRouter key" } });
    this.key = key;
    this.http = opts.fetch ?? fetch;
  }

  private async raw(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Response> {
    const isForm = body instanceof FormData;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.key}`, "UHP-Version": UHP_VERSION, Accept: "application/json", ...extra };
    if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
    const res = await this.http(HR_API + path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        // not JSON
      }
      throw new HRError(res.status, parsed);
    }
    return res;
  }

  private async json<T>(method: string, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
    return (await (await this.raw(method, path, body, extra)).json()) as T;
  }

  /** Background mode: answers at once with status "in_progress", the response id and session id. */
  async start(t: TaskStart): Promise<HRResponse> {
    const send = () => this.json<HRResponse>("POST", "/v1/responses", taskBody(t), { "Idempotency-Key": t.idempotencyKey });
    try {
      return await send();
    } catch (error) {
      // Same key, same body: if the first attempt did start, HarnessRouter replays it instead of running it twice.
      if (error instanceof HRError && error.retryable) return send();
      if (!(error instanceof HRError)) return send();
      throw error;
    }
  }

  getResponse(id: string) {
    return this.json<HRResponse>("GET", `/v1/responses/${encodeURIComponent(id)}`);
  }

  cancel(id: string) {
    return this.json<HRResponse>("POST", `/v1/responses/${encodeURIComponent(id)}/cancel`, {});
  }

  /** POST /v1/files. Reference the id as {type: "input_file", file_id}. */
  async upload(bytes: Uint8Array, filename: string, type: string): Promise<{ id: string }> {
    const form = new FormData();
    form.append("purpose", "user_data");
    form.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), filename);
    return this.json<{ id: string }>("POST", "/v1/files", form);
  }

  async listFiles(sessionId: string, changed = false): Promise<SessionFile[]> {
    const q = changed ? "?changed=true" : "";
    return (await this.json<{ files?: SessionFile[] }>("GET", `/v1/sessions/${encodeURIComponent(sessionId)}/files${q}`)).files ?? [];
  }

  /** Bytes of one file; `pdf` is the PDF view of an Office file. */
  async fetchFile(sessionId: string, fileId: string, view: "content" | "pdf" = "content"): Promise<{ bytes: Uint8Array; type: string }> {
    const res = await this.raw("GET", `/v1/containers/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}/${view}`, undefined, { Accept: "*/*" });
    return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") || "application/octet-stream" };
  }

  async getHarness(id: string): Promise<{ harness: Harness; etag: string | null }> {
    const res = await this.raw("GET", `/v1/harnesses/${encodeURIComponent(id)}`);
    return { harness: (await res.json()) as Harness, etag: res.headers.get("etag") };
  }
}

// ── signed, sandboxed previews of generated HTML ────────────────────────────────────────────
// A sandboxed iframe has an opaque origin and sends no cookies, so the URL itself carries a
// short-lived signature, issued only by an owner-checked route.

/** STUDIO_PREVIEW_SECRET, else derived from the Supabase secret key, so every server instance agrees. */
export function previewSecret(): Buffer {
  const own = process.env.STUDIO_PREVIEW_SECRET?.trim();
  if (own) return Buffer.from(own);
  const base = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("No preview secret");
  return createHmac("sha256", base).update("liftpage studio preview v1").digest();
}
const mac = (secret: Buffer, msg: string) => createHmac("sha256", secret).update(msg).digest("base64url");

export function signPreview(taskId: string, secret: Buffer, ttlSeconds = 3600, now = Date.now()): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(taskId)) throw new Error("bad task id");
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `${taskId}.${exp}.${mac(secret, `${taskId}.${exp}`)}`;
}

/** The task id when the token is genuine and unexpired, else null. */
export function verifyPreview(token: string, secret: Buffer, now = Date.now()): string | null {
  const m = /^([A-Za-z0-9_-]{1,128})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return null;
  const [, taskId, exp, sig] = m;
  if (Number(exp) * 1000 < now) return null;
  const want = Buffer.from(mac(secret, `${taskId}.${exp}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? taskId : null;
}

/** A relative path with no way out of the session folder, else null. */
export function safeRelPath(p: string): string | null {
  if (!p || p.includes("\\") || p.includes("\0") || p.startsWith("/")) return null;
  const parts = p.split("/");
  if (parts.some((x) => x === ".." || x === "." || x === "")) return null;
  return parts.join("/");
}

export const PREVIEW_TYPES: Readonly<Record<string, string>> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", json: "application/json", txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  woff: "font/woff", woff2: "font/woff2",
};

export const PREVIEW_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
};
