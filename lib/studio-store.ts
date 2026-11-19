import "server-only";
import type { SessionFile } from "./harnessrouter";
import { Studio, type Attachment, type StudioStore, type StudioTask, type TaskStatus } from "./studio";
import { db, must } from "./supabase/server";

type Row = Record<string, unknown>;

/* Content studio tasks in Postgres (`studio_tasks`). Callers check who is asking first. */

function toTask(row: Row): StudioTask {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    harnessId: row.harness_id as string,
    threadId: row.thread_id as string,
    parentId: (row.parent_id as string | null) ?? null,
    idempotencyKey: row.idempotency_key as string,
    input: row.input as string,
    attachments: (row.attachments as Attachment[] | null) ?? [],
    status: row.status as TaskStatus,
    responseId: (row.response_id as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    answer: (row.answer as string | null) ?? null,
    files: (row.files as SessionFile[] | null) ?? [],
    incompleteReason: (row.incomplete_reason as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const COLUMNS: Record<keyof StudioTask, string> = {
  id: "id", userId: "user_id", harnessId: "harness_id", threadId: "thread_id", parentId: "parent_id",
  idempotencyKey: "idempotency_key", input: "input", attachments: "attachments", status: "status",
  responseId: "response_id", sessionId: "session_id", answer: "answer", files: "files",
  incompleteReason: "incomplete_reason", errorCode: "error_code", createdAt: "created_at", updatedAt: "updated_at",
};

function toRow(patch: Partial<StudioTask>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(patch)) row[COLUMNS[k as keyof StudioTask]] = v;
  return row;
}

export const supabaseStudioStore: StudioStore = {
  async create(task) {
    must(await db().from("studio_tasks").insert(toRow(task)), "save studio task");
  },
  async update(id, patch) {
    const row = must(
      await db().from("studio_tasks").update(toRow({ ...patch, updatedAt: new Date().toISOString() })).eq("id", id).select("*").single(),
      "update studio task",
    );
    return toTask(row as Row);
  },
  async get(id) {
    const { data, error } = await db().from("studio_tasks").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`load studio task: ${error.message}`);
    return data ? toTask(data as Row) : null;
  },
  async thread(threadId, userId) {
    const rows = must(
      await db().from("studio_tasks").select("*").eq("thread_id", threadId).eq("user_id", userId).order("created_at"),
      "load studio thread",
    );
    return ((rows ?? []) as Row[]).map(toTask);
  },
  async threads(userId, limit) {
    // Newest activity first. A person has few threads, so grouping here is fine.
    const rows = must(
      await db().from("studio_tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
      "load studio threads",
    );
    const byThread = new Map<string, StudioTask[]>();
    for (const task of ((rows ?? []) as Row[]).map(toTask).reverse()) byThread.set(task.threadId, [...(byThread.get(task.threadId) ?? []), task]);
    return [...byThread.values()].sort((a, b) => b.at(-1)!.updatedAt.localeCompare(a.at(-1)!.updatedAt)).slice(0, limit);
  },
};

export function studio(): Studio {
  return new Studio(supabaseStudioStore);
}
