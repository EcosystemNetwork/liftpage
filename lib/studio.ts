import "server-only";
import { randomUUID } from "node:crypto";
import { HRError, HarnessRouter, TERMINAL, answerText, harnessKey, type SessionFile } from "./harnessrouter";
import { nid } from "./id";

/*
 * Content studio: a signed-in person asks the LiftPage content agent (a HarnessRouter Harness)
 * for social posts, carousels or video scripts. One request is one HarnessRouter task;
 * feedback on the result is a follow-up on the same session. Tasks run in background mode and
 * are polled, so nothing depends on a long-lived connection (the site runs on serverless).
 *
 * The Harness's instructions live in HarnessRouter; harnessrouter.json at the repo root is
 * the reviewed copy. The browser never sees the key, the Harness id or any HarnessRouter id.
 */

/** The one Harness this feature sends tasks to. Server-side only; never from the browser. */
export const STUDIO_HARNESS_ID = "chrn_a96e4e672bd32343e635ab59feba35c3";

export const MAX_TEXT = 20_000;
export const MAX_FILES = 6;
/** Serverless functions cap request bodies near 6 MB; the browser shrinks photos to fit. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const UPLOAD_TYPES: Readonly<Record<string, string>> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain", md: "text/markdown", csv: "text/csv",
};

export type TaskStatus = "starting" | "in_progress" | "completed" | "incomplete" | "failed" | "cancelled";
export type Attachment = { name: string; bytes: number };

export type StudioTask = {
  id: string;
  userId: string;
  harnessId: string;
  /** The first task's id; follow-ups share it. */
  threadId: string;
  parentId: string | null;
  idempotencyKey: string;
  input: string;
  attachments: Attachment[];
  status: TaskStatus;
  responseId: string | null;
  sessionId: string | null;
  answer: string | null;
  files: SessionFile[];
  incompleteReason: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Persistence. lib/studio-store.ts backs it with Supabase; tests use memory. */
export interface StudioStore {
  create(task: StudioTask): Promise<void>;
  update(id: string, patch: Partial<StudioTask>): Promise<StudioTask>;
  get(id: string): Promise<StudioTask | null>;
  thread(threadId: string, userId: string): Promise<StudioTask[]>;
  threads(userId: string, limit: number): Promise<StudioTask[][]>;
}

export type Upload = { name: string; type: string; bytes: Uint8Array };

/** An error whose message is safe to show. */
export class StudioError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "StudioError";
    this.status = status;
  }
}

const NOT_CONNECTED = "The content agent isn't connected yet. LiftPage needs to add its HarnessRouter key.";

export function studioReady(): boolean {
  return Boolean(harnessKey());
}

/** Upstream error code -> a plain sentence. Upstream text never reaches the browser. */
export function friendlyError(code: string | null | undefined): string {
  switch (code) {
    case "invalid_credential":
    case "not_configured":
      return NOT_CONNECTED;
    case "session_busy":
      return "This result is still being worked on. Wait for it to finish, then send your follow-up.";
    case "rate_limited":
      return "The content agent is busy right now. Try again in a minute.";
    case "upload_failed":
      return "We couldn't attach one of your files. Try again, or send your request without it.";
    case "harness_not_found":
      return "The content agent isn't available right now. LiftPage needs to check its setup.";
    case "task_failed":
      return "The agent couldn't finish this request. Try again, or say it another way.";
    default:
      return "Something went wrong while making your content. Try again.";
  }
}

export function incompleteMessage(reason: string | null | undefined): string {
  if (reason === "timeout") return "The agent ran out of time before finishing. Send a follow-up to pick up where it left off.";
  if (reason === "max_steps") return "The agent hit its step limit before finishing. Send a follow-up to pick up where it left off.";
  return "The agent stopped before finishing. Send a follow-up to pick up where it left off.";
}

/** A file name the agent sees in its working folder: plain characters, unique per task. */
export function safeUploadName(raw: string, taken: Set<string>): string {
  const base = (raw.split(/[\\/]/).pop() || "file").normalize("NFKC");
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const stem =
    (dot > 0 ? base.slice(0, dot) : base)
      .replace(/[^A-Za-z0-9 _-]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file";
  let name = ext ? `${stem}.${ext}` : stem;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = ext ? `${stem}-${i}.${ext}` : `${stem}-${i}`;
  taken.add(name.toLowerCase());
  return name;
}

export const extOf = (name: string) => (name.includes(".") ? (name.split(".").pop() || "").toLowerCase() : "");

/** Checks and names a request's attachments. Throws a StudioError the person can act on. */
export function checkUploads(files: { name: string; bytes: Uint8Array }[]): Upload[] {
  if (files.length > MAX_FILES) throw new StudioError(400, `Attach at most ${MAX_FILES} files.`);
  const total = files.reduce((n, f) => n + f.bytes.byteLength, 0);
  if (total > MAX_UPLOAD_BYTES) throw new StudioError(413, "Those files are too big together. Keep them under 4 MB, or send fewer.");
  const taken = new Set<string>();
  return files.map((f) => {
    const type = UPLOAD_TYPES[extOf(f.name)];
    if (!type) throw new StudioError(400, `"${f.name}" isn't a file the agent can read. Attach images, PDFs, Word, PowerPoint, Excel, text or CSV files.`);
    if (!f.bytes.byteLength) throw new StudioError(400, `"${f.name}" is empty.`);
    return { name: safeUploadName(f.name, taken), type, bytes: f.bytes };
  });
}

function codeOf(error: unknown): string {
  return error instanceof HRError ? error.code : "internal";
}

export class Studio {
  private readonly store: StudioStore;
  private readonly client: () => HarnessRouter;

  constructor(store: StudioStore, client: () => HarnessRouter = () => new HarnessRouter()) {
    this.store = store;
    this.client = client;
  }

  private hr(): HarnessRouter {
    try {
      return this.client();
    } catch {
      throw new StudioError(503, NOT_CONNECTED);
    }
  }

  /** A new request: a new task in a new thread. Returns once HarnessRouter has accepted it. */
  async start(userId: string, text: string, uploads: Upload[]): Promise<StudioTask> {
    const hr = this.hr(); // before a record exists, so a missing key loses nothing
    const id = nid("stk");
    const task = await this.create({ id, userId, threadId: id, parentId: null, harnessId: STUDIO_HARNESS_ID, text, uploads });
    return this.send(hr, task, uploads, {});
  }

  /** Feedback on a result: continues the thread's HarnessRouter session, on the same Harness. */
  async followUp(userId: string, threadId: string, text: string, uploads: Upload[]): Promise<StudioTask> {
    const turns = await this.refreshThread(userId, threadId);
    if (!turns.length) throw new StudioError(404, "Not found.");
    const latest = turns.at(-1)!;
    if (!TERMINAL.has(latest.status)) throw new StudioError(409, friendlyError("session_busy"));
    const base = [...turns].reverse().find((t) => t.responseId && t.sessionId);
    if (!base) throw new StudioError(409, "There's no result to continue yet. Start a new request instead.");
    const hr = this.hr();
    const task = await this.create({ id: nid("stk"), userId, threadId, parentId: latest.id, harnessId: turns[0].harnessId, text, uploads });
    return this.send(hr, task, uploads, { previousResponseId: base.responseId!, sessionId: base.sessionId! });
  }

  /** Polls HarnessRouter for an unfinished task and stores the result once it ends. */
  async refresh(task: StudioTask): Promise<StudioTask> {
    if (TERMINAL.has(task.status) || !task.responseId) return task;
    let hr: HarnessRouter;
    try {
      hr = this.client();
    } catch {
      return task;
    }
    try {
      const r = await hr.getResponse(task.responseId);
      if (!TERMINAL.has(r.status)) return task;
      return this.settle(hr, task, r.status as TaskStatus, answerText(r), r.incomplete_details?.reason ?? null);
    } catch (error) {
      if (error instanceof HRError && error.status === 404) return this.store.update(task.id, { status: "failed", errorCode: "task_failed" });
      return task; // a hiccup: try again on the next poll
    }
  }

  async refreshThread(userId: string, threadId: string): Promise<StudioTask[]> {
    const turns = await this.store.thread(threadId, userId);
    return Promise.all(turns.map((t) => this.refresh(t)));
  }

  async cancel(userId: string, taskId: string): Promise<StudioTask> {
    const task = await this.store.get(taskId);
    if (!task || task.userId !== userId) throw new StudioError(404, "Not found.");
    if (TERMINAL.has(task.status)) return task;
    if (!task.responseId) throw new StudioError(409, "This request is still starting. Try again in a moment.");
    const r = await this.hr().cancel(task.responseId);
    return TERMINAL.has(r.status) ? this.store.update(task.id, { status: r.status as TaskStatus }) : task;
  }

  /** A person's task, or null when it isn't theirs. Every file route goes through this. */
  async owned(userId: string, taskId: string): Promise<StudioTask | null> {
    const task = await this.store.get(taskId);
    return task && task.userId === userId ? task : null;
  }

  private async create(o: { id: string; userId: string; threadId: string; parentId: string | null; harnessId: string; text: string; uploads: Upload[] }) {
    const now = new Date().toISOString();
    const task: StudioTask = {
      id: o.id, userId: o.userId, harnessId: o.harnessId, threadId: o.threadId, parentId: o.parentId,
      idempotencyKey: randomUUID(), input: o.text,
      attachments: o.uploads.map((u) => ({ name: u.name, bytes: u.bytes.byteLength })),
      status: "starting", responseId: null, sessionId: null, answer: null, files: [],
      incompleteReason: null, errorCode: null, createdAt: now, updatedAt: now,
    };
    await this.store.create(task);
    return task;
  }

  private async send(hr: HarnessRouter, task: StudioTask, uploads: Upload[], follow: { previousResponseId?: string; sessionId?: string }) {
    let input: unknown = task.input;
    if (uploads.length) {
      const parts: unknown[] = [{ type: "input_text", text: task.input }];
      try {
        for (const u of uploads) parts.push({ type: "input_file", file_id: (await hr.upload(u.bytes, u.name, u.type)).id });
      } catch {
        return this.store.update(task.id, { status: "failed", errorCode: "upload_failed" });
      }
      input = [{ role: "user", content: parts }];
    }
    try {
      const r = await hr.start({ harnessId: task.harnessId, input, user: task.userId, idempotencyKey: task.idempotencyKey, ...follow });
      const saved = await this.store.update(task.id, {
        status: "in_progress", responseId: r.id, sessionId: r.metadata?.session_id ?? follow.sessionId ?? null,
      });
      return TERMINAL.has(r.status) ? this.settle(hr, saved, r.status as TaskStatus, answerText(r), r.incomplete_details?.reason ?? null) : saved;
    } catch (error) {
      return this.store.update(task.id, { status: "failed", errorCode: codeOf(error) });
    }
  }

  private async settle(hr: HarnessRouter, task: StudioTask, status: TaskStatus, answer: string, reason: string | null) {
    let files: SessionFile[] = [];
    if (task.sessionId && status !== "cancelled") {
      try {
        files = await hr.listFiles(task.sessionId, true);
      } catch {
        files = [];
      }
    }
    return this.store.update(task.id, {
      status, answer, files, incompleteReason: reason, errorCode: status === "failed" ? "task_failed" : null,
    });
  }
}

// ── what the browser may see ────────────────────────────────────────────────────────────────

export type FileKind = "image" | "pdf" | "office" | "html" | "text" | "other";

export function fileKind(path: string): FileKind {
  const ext = extOf(path);
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["docx", "pptx", "xlsx"].includes(ext)) return "office";
  if (["html", "htm", "svg"].includes(ext)) return "html";
  if (["md", "txt", "csv", "json"].includes(ext)) return "text";
  return "other";
}

/** What the task made, without the person's own uploads (the session lists those too). */
export function outputFiles(task: Pick<StudioTask, "files" | "attachments">): SessionFile[] {
  const uploaded = new Set(task.attachments.map((a) => a.name));
  return task.files.filter((f) => !(f.path === f.filename && uploaded.has(f.filename)));
}

export type TaskView = {
  id: string;
  status: TaskStatus;
  input: string;
  attachments: string[];
  answer: string | null;
  error: string | null;
  notice: string | null;
  files: { index: number; name: string; path: string; bytes: number; kind: FileKind; url: string; viewUrl: string | null; previewUrl: string | null }[];
  createdAt: string;
};

export function taskView(task: StudioTask, sign: (taskId: string) => string): TaskView {
  const files = outputFiles(task).map((f, index) => {
    const kind = fileKind(f.path);
    const url = `/api/studio/files/${task.id}/${index}`;
    return {
      index, name: f.filename, path: f.path, bytes: f.bytes, kind,
      url: `${url}?download=1`,
      viewUrl: kind === "image" || kind === "pdf" || kind === "office" || kind === "text" ? url : null,
      previewUrl: kind === "html" ? `/api/studio/preview/${sign(task.id)}/${f.path.split("/").map(encodeURIComponent).join("/")}` : null,
    };
  });
  return {
    id: task.id,
    status: task.status,
    input: task.input,
    attachments: task.attachments.map((a) => a.name),
    answer: task.answer,
    error: task.status === "failed" ? friendlyError(task.errorCode) : null,
    notice: task.status === "incomplete" ? incompleteMessage(task.incompleteReason) : task.status === "cancelled" ? "You cancelled this request." : null,
    files,
    createdAt: task.createdAt,
  };
}

export type ThreadSummary = { id: string; title: string; status: TaskStatus; turns: number; updatedAt: string };

export function threadSummary(turns: StudioTask[]): ThreadSummary {
  const first = turns[0];
  const latest = turns.at(-1)!;
  return { id: first.threadId, title: first.input.slice(0, 120), status: latest.status, turns: turns.length, updatedAt: latest.updatedAt };
}

export function canContinue(turns: StudioTask[]): boolean {
  const latest = turns.at(-1);
  return Boolean(latest && TERMINAL.has(latest.status) && turns.some((t) => t.responseId));
}
