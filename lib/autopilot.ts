import "server-only";
import { findUser, toMetric } from "./accounts";
import { logEvent } from "./admin";
import { aiReady } from "./ai";
import { autopilotBrief, defaultSettings, pendingDrafts, PENDING_LIMIT, type AutopilotSettings } from "./autopilot-plan";
import { cutWeek } from "./cut";
import { limited } from "./rate";
import { mailReadyForReview } from "./review-mail";
import { addRun, boardForClient } from "./store";
import { db, must } from "./supabase/server";
import type { User } from "./types";

/*
 * Content autopilot. Once a week, on the client's day, it reads their board and numbers,
 * writes a brief from what they approved, sent back and what's working, and cuts next
 * week as drafts. It never approves, schedules or publishes: that stays with the client
 * or an admin.
 */

type Row = Record<string, unknown>;

function toSettings(row: Row): AutopilotSettings {
  return {
    clientId: row.client_id as string,
    enabled: Boolean(row.enabled),
    weekday: Number(row.weekday ?? 0),
    guidance: (row.guidance as string) ?? "",
    notify: row.notify !== false,
    lastRunAt: (row.last_run_at as string | null) ?? undefined,
    lastResult: (row.last_result as string) ?? "",
  };
}

/** A client's settings, or "off" if there's no row yet (or the migration hasn't run), so the page still loads. */
export async function loadAutopilot(clientId: string): Promise<AutopilotSettings> {
  const { data, error } = await db().from("autopilot").select("*").eq("client_id", clientId).maybeSingle();
  if (error) {
    console.error("load autopilot", error.message);
    return { ...defaultSettings(clientId), lastResult: "Autopilot isn't set up in the database yet. Run the autopilot migration." };
  }
  return data ? toSettings(data as Row) : defaultSettings(clientId);
}

/** Every client with autopilot switched on. */
export async function enabledAutopilots(): Promise<AutopilotSettings[]> {
  const rows = must(await db().from("autopilot").select("*").eq("enabled", true), "list autopilot") as Row[];
  return rows.map(toSettings);
}

export async function saveAutopilot(clientId: string, patch: Pick<AutopilotSettings, "enabled" | "weekday" | "guidance" | "notify">) {
  must(
    await db()
      .from("autopilot")
      .upsert({ client_id: clientId, enabled: patch.enabled, weekday: patch.weekday, guidance: patch.guidance, notify: patch.notify, updated_at: new Date().toISOString() }),
    "save autopilot",
  );
}

async function record(clientId: string, result: string, ran: boolean) {
  const patch: Row = { client_id: clientId, last_result: result.slice(0, 500), updated_at: new Date().toISOString() };
  if (ran) patch.last_run_at = new Date().toISOString();
  const { error } = await db().from("autopilot").upsert(patch);
  if (error) console.error("autopilot record", error.message);
}

/** The scheduled job has no admin behind it, so it signs the activity log as autopilot. */
async function logSystem(action: string, clientId: string, detail: string) {
  const { error } = await db().from("admin_events").insert({ actor_id: null, actor_email: "autopilot", action, client_id: clientId, detail: detail.slice(0, 1000) });
  if (error) console.error("autopilot event", error.message);
}

export type AutopilotOutcome = { ok: string; drafts: number } | { skipped: string };

/**
 * One autopilot run for one client. `by` is the admin who pressed Run now; the weekly job
 * leaves it out. Never throws for an expected stop; returns why it skipped instead.
 */
export async function runAutopilot(clientId: string, by?: Pick<User, "id" | "email">): Promise<AutopilotOutcome> {
  const skip = async (why: string): Promise<AutopilotOutcome> => {
    await record(clientId, `Skipped: ${why}`, false);
    return { skipped: why };
  };
  const client = await findUser(clientId);
  if (!client || client.role !== "client") return { skipped: "Not a client account." };
  if (client.disabled) return skip("the account is switched off.");
  if (client.stage !== "active" && client.stage !== "onboarding") return skip(`the client is ${client.stage}.`);
  if (!aiReady()) return skip("no AI backend is set up, and the local operator can't learn from feedback.");
  const board = await boardForClient(clientId);
  if (!board) return skip("no board yet.");
  const pending = pendingDrafts(board.posts);
  if (pending >= PENDING_LIMIT) return skip(`${pending} drafts are still waiting on review. Get those approved first.`);
  // One run at a time per client, so a double click or a job retry can't write two weeks.
  if (await limited(`autopilot:${clientId}`, 1, 10 * 60_000)) return { skipped: "Already ran in the last 10 minutes." };

  const settings = await loadAutopilot(clientId);
  const since = new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10);
  const metrics = (must(await db().from("metrics").select("*").eq("user_id", clientId).gte("week", since).order("week"), "load numbers") ?? []).map(toMetric);
  const brief = autopilotBrief({ brand: board.brand, guidance: settings.guidance, posts: board.posts, metrics, now: new Date() });

  // One model pass, no "tighten" second pass: the host cuts a function off at about a minute.
  const cut = await cutWeek(brief, board.brand, { review: false });
  if (cut.via === "local" || !cut.posts.length) return skip(`the AI didn't give a usable week, so nothing was saved. ${cut.note}`);
  await addRun(board.brand.id, `Autopilot\n\n${brief}`, cut);

  let told = "";
  if (settings.notify) {
    const mailed = await mailReadyForReview(board.brand.id, cut.posts.length);
    told = mailed === "sent" ? " Client emailed." : mailed === "throttled" ? " Client was emailed in the last 10 minutes." : mailed === "no-email" ? " No email: Resend isn't set up." : "";
  }
  const result = `${cut.posts.length} drafts via ${cut.via}.${told}`;
  await record(clientId, result, true);
  if (by) await logEvent(by, "autopilot run", clientId, result);
  else await logSystem("autopilot run", clientId, result);
  return { ok: result, drafts: cut.posts.length };
}
