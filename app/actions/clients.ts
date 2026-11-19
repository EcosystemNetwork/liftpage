"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { findUser } from "@/lib/accounts";
import {
  addClientNote,
  changeClientNote,
  logEvent,
  reachableClients,
  sendReport,
  setStage as saveStage,
  setTools as saveTools,
  type ReportOutcome,
} from "@/lib/admin";
import { runAutopilot, saveAutopilot } from "@/lib/autopilot";
import { GUIDANCE_MAX, WEEKDAYS } from "@/lib/autopilot-plan";
import { setPostStatus } from "@/lib/cue";
import { cutWeek } from "@/lib/cut";
import { requireAdmin } from "@/lib/dal";
import { emailReady } from "@/lib/email";
import { enqueue, jobsReady } from "@/lib/inngest/client";
import { addMessage, mailMessage, MESSAGE_MAX } from "@/lib/messages";
import { mailReadyForReview } from "@/lib/review-mail";
import { syncableClients, syncInsights } from "@/lib/social/insights";
import { addNote, addRun, boardForClient, retireCue, updatePost } from "@/lib/store";
import { CLIENT_TOOLS, cleanTools } from "@/lib/tools";
import { CLIENT_STAGES, type ClientStage, type User } from "@/lib/types";
import type { FormState } from "./auth";

/*
 * The admin's moves on a client, from /admin/customers/[id] and /admin/tools. Every one
 * checks the admin, works only on client accounts, and lands in the activity log.
 */

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function refresh(clientId?: string) {
  revalidatePath("/admin", "layout");
  if (clientId) revalidatePath(`/admin/customers/${clientId}`);
  revalidatePath("/account");
}

/** The admin plus the client named in the form, or an error line. */
async function forClient(data: FormData): Promise<{ me: User; client: User; board: Awaited<ReturnType<typeof boardForClient>> } | { error: string }> {
  const me = await requireAdmin();
  const client = await findUser(text(data, "clientId", 40));
  if (!client || client.role !== "client") return { error: "That client account is gone." };
  return { me, client, board: await boardForClient(client.id) };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- Relationship ---------- */

export async function setStage(data: FormData) {
  const got = await forClient(data);
  if ("error" in got) return;
  const stage = text(data, "stage", 20) as ClientStage;
  if (!CLIENT_STAGES.includes(stage) || stage === got.client.stage) return;
  await saveStage(got.client.id, stage);
  await logEvent(got.me, "stage", got.client.id, `${got.client.stage} → ${stage}`);
  refresh(got.client.id);
}

export async function addNoteAction(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const note = text(data, "text", 4000);
  if (!note) return { error: "Write the note first." };
  await addClientNote(got.client.id, got.me.id, note);
  await logEvent(got.me, "note", got.client.id);
  refresh(got.client.id);
  return { ok: "Saved. Only admins see it." };
}

export async function changeNote(data: FormData) {
  const me = await requireAdmin();
  const how = text(data, "change", 10);
  const clientId = await changeClientNote(text(data, "noteId", 40), how === "delete" ? "delete" : { pinned: how === "pin" });
  if (!clientId) return;
  if (how === "delete") await logEvent(me, "note deleted", clientId);
  refresh(clientId);
}

/** Switches the client's AI tools on or off. The form sends every ticked box as "tool". */
export async function setClientTools(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const next = cleanTools(data.getAll("tool"));
  const before = new Set(got.client.tools);
  const on = next.filter((id) => !before.has(id));
  const off = got.client.tools.filter((id) => !next.includes(id as never));
  if (!on.length && !off.length) return { ok: "No change." };
  try {
    await saveTools(got.client.id, next);
  } catch (error) {
    console.error("set tools", error);
    return { error: "The tools didn't save. Try again." };
  }
  const name = (id: string) => CLIENT_TOOLS.find((t) => t.id === id)?.label ?? id;
  await logEvent(got.me, "tools", got.client.id, [on.length ? `on: ${on.map(name).join(", ")}` : "", off.length ? `off: ${off.map(name).join(", ")}` : ""].filter(Boolean).join("; "));
  refresh(got.client.id);
  return { ok: next.length ? `${plural(next.length, "tool")} on for ${got.client.company || got.client.name}.` : "Every tool is off." };
}

/* ---------- Content ---------- */

/** Writes a week of drafts on the client's board, like a desk run, and can tell them. */
export async function draftWeek(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  if (!got.board) return { error: "Open a board for this client first." };
  const brief = text(data, "brief", 4000);
  if (brief.length < 8) return { error: "The brief needs a real note. Eight characters at least." };
  const cut = await cutWeek(brief, got.board.brand);
  await addRun(got.board.brand.id, brief, cut);
  await logEvent(got.me, "drafted week", got.client.id, `${cut.posts.length} drafts via ${cut.via}`);
  let told = "";
  if (data.get("notify") === "on") {
    const mailed = await mailReadyForReview(got.board.brand.id, cut.posts.length);
    told = mailed === "sent" ? ` Emailed ${got.client.email} to review.` : mailed === "throttled" ? " The client was emailed in the last 10 minutes; no second email." : " No email went out; Resend isn't set up.";
  }
  refresh(got.client.id);
  return { ok: `${plural(cut.posts.length, "draft")} on the board. ${cut.note}${told}` };
}

/* ---------- Autopilot ---------- */

/** Switches the client's content autopilot on or off, and sets its day and standing instructions. */
export async function saveAutopilotAction(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const enabled = data.get("enabled") === "on";
  if (enabled && !got.board) return { error: "Open a board for this client first. Autopilot writes onto it." };
  const weekday = Number(text(data, "weekday", 1));
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "Pick a day." };
  const settings = { enabled, weekday, guidance: text(data, "guidance", GUIDANCE_MAX), notify: data.get("notify") === "on" };
  try {
    await saveAutopilot(got.client.id, settings);
  } catch (error) {
    console.error("save autopilot", error);
    return { error: "Autopilot didn't save. Try again." };
  }
  await logEvent(got.me, "autopilot", got.client.id, enabled ? `on, ${WEEKDAYS[weekday]}s` : "off");
  refresh(got.client.id);
  return {
    ok: enabled
      ? `On. Every ${WEEKDAYS[weekday]} afternoon (Pacific) it drafts the next week${jobsReady() ? "." : ". Background jobs are off, so it only runs when you press Run now."}`
      : "Off. Nothing runs on its own.",
  };
}

/** Runs autopilot for this client now, whatever the day. Same checks as the weekly run. */
export async function runAutopilotNow(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  try {
    const outcome = await runAutopilot(got.client.id, got.me);
    refresh(got.client.id);
    return "ok" in outcome ? { ok: `${outcome.ok} On the board for review.` } : { error: `Skipped: ${outcome.skipped}` };
  } catch (error) {
    console.error("autopilot run", error);
    return { error: "Autopilot stopped partway. Check the board before running it again." };
  }
}

/** Approves every draft the client hasn't sent back. For when they said yes off the app. */
export async function approveDrafts(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const drafts = (got.board?.posts ?? []).filter((p) => p.status === "draft" && p.notes.at(-1)?.kind !== "changes");
  if (!drafts.length) return { error: "No drafts waiting. Lines the client sent back stay drafts until you rework them." };
  const why = text(data, "why", 300) || "Approved by LiftPage for the client.";
  for (const post of drafts) {
    await updatePost(post.id, { status: "approved" });
    await addNote({ postId: post.id, authorId: got.me.id, authorName: got.me.name || "LiftPage", role: "admin", kind: "approved", text: why });
  }
  await logEvent(got.me, "approved drafts", got.client.id, `${drafts.length} · ${why}`);
  refresh(got.client.id);
  return { ok: `Approved ${plural(drafts.length, "draft")}.` };
}

/** Schedules every approved line whose slot is still ahead. */
export async function scheduleApproved(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const now = Date.now();
  const ready = (got.board?.posts ?? []).filter((p) => p.status === "approved" && p.publishState === "idle" && Date.parse(p.slot) > now);
  if (!ready.length) return { error: "Nothing approved with a slot still ahead." };
  const notes: string[] = [];
  let ok = 0;
  for (const post of ready) {
    const result = await setPostStatus(post.id, "cued");
    if ("error" in result) notes.push(result.error);
    else ok++;
  }
  await logEvent(got.me, "scheduled approved", got.client.id, `${ok} of ${ready.length}`);
  refresh(got.client.id);
  const unqueued = ok > 0 && !jobsReady();
  return {
    ok: `Scheduled ${plural(ok, "line")}.${unqueued ? " Background jobs aren't set up, so they won't post at their slots; use Publish now on the desk." : ""}${notes.length ? ` Skipped: ${[...new Set(notes)].join(" ")}` : ""}`,
  };
}

/** Takes everything scheduled off the schedule, back to approved. Nothing is lost. */
export async function pausePublishing(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const cued = (got.board?.posts ?? []).filter((p) => p.status === "cued" && p.publishState !== "published" && p.publishState !== "publishing");
  if (!cued.length) return { error: "Nothing is scheduled." };
  for (const post of cued) await retireCue(post.id, "approved");
  await logEvent(got.me, "paused publishing", got.client.id, `${cued.length} lines`);
  refresh(got.client.id);
  return { ok: `Took ${plural(cued.length, "line")} off the schedule. They're approved; schedule them again any time.` };
}

/** Puts failed posts back on the scheduler. A slot in the past goes out at once. */
export async function retryFailed(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const failed = (got.board?.posts ?? []).filter((p) => p.publishState === "failed");
  if (!failed.length) return { error: "Nothing failed." };
  const notes: string[] = [];
  for (const post of failed) {
    const result = await setPostStatus(post.id, "cued");
    notes.push("error" in result ? result.error : result.note);
  }
  await logEvent(got.me, "retried failed", got.client.id, `${failed.length} posts`);
  refresh(got.client.id);
  return { ok: `Retried ${plural(failed.length, "post")}. ${[...new Set(notes)].join(" ")}` };
}

/* ---------- Client contact ---------- */

export async function nudgeReview(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const drafts = (got.board?.posts ?? []).filter((p) => p.status === "draft").length;
  if (!got.board || !drafts) return { error: "No drafts on the board to review." };
  const result = await mailReadyForReview(got.board.brand.id, drafts);
  if (result === "sent") await logEvent(got.me, "review nudge", got.client.id, `${drafts} drafts`);
  return result === "sent"
    ? { ok: `Emailed ${got.client.email}: ${plural(drafts, "line")} to review.` }
    : { error: result === "throttled" ? "They were emailed in the last 10 minutes." : result === "no-email" ? "Resend isn't set up." : "That client is switched off." };
}

function reportLine(outcome: ReportOutcome, email: string): FormState {
  switch (outcome) {
    case "sent":
      return { ok: `Report emailed to ${email}.` };
    case "empty":
      return { error: "Nothing to report yet: no finished week of numbers and nothing on the board." };
    case "no-email":
      return { error: "Resend isn't set up, so no report went out." };
    default:
      return { error: "That account is switched off." };
  }
}

export async function sendReportAction(_: FormState, data: FormData): Promise<FormState> {
  const got = await forClient(data);
  if ("error" in got) return got;
  const outcome = await sendReport(got.client.id);
  if (outcome === "sent") await logEvent(got.me, "report sent", got.client.id);
  return reportLine(outcome, got.client.email);
}

/* ---------- Book-wide ---------- */

/** One message into every reachable client's thread, emailed like any LiftPage message. */
export async function broadcast(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const body = text(data, "text", MESSAGE_MAX);
  if (body.length < 4) return { error: "Write the message first." };
  const stage = text(data, "stage", 20);
  const everyone = await reachableClients();
  const to = stage === "all" ? everyone : everyone.filter((c) => c.stage === stage);
  if (!to.length) return { error: "No switched-on clients in that group." };
  const saved: Awaited<ReturnType<typeof addMessage>>[] = [];
  for (const client of to) saved.push(await addMessage({ clientId: client.id, author: me, text: body }));
  after(async () => {
    for (const message of saved) await mailMessage(message);
  });
  await logEvent(me, "broadcast", null, `${to.length} clients · ${body.slice(0, 120)}`);
  refresh();
  return { ok: `Sent to ${plural(to.length, "client")}.${emailReady() ? " Each gets an email too." : " Email isn't set up, so they'll see it next time they sign in."}` };
}

export async function reportAll(): Promise<FormState> {
  const me = await requireAdmin();
  if (!emailReady()) return { error: "Resend isn't set up, so no report can go out." };
  const clients = await reachableClients();
  const tally: Record<ReportOutcome, number> = { sent: 0, empty: 0, "no-email": 0, skipped: 0 };
  const failed: string[] = [];
  for (const client of clients) {
    try {
      tally[await sendReport(client.id)]++;
    } catch (error) {
      console.error("report", client.id, error);
      failed.push(client.company || client.email);
    }
  }
  await logEvent(me, "reports sent", null, `${tally.sent} sent, ${tally.empty} empty, ${failed.length} failed`);
  return {
    ok: `${plural(tally.sent, "report")} sent. ${tally.empty ? `${tally.empty} had nothing to report. ` : ""}${failed.length ? `Failed: ${failed.join(", ")}.` : ""}`,
  };
}

export async function syncAll(): Promise<FormState> {
  const me = await requireAdmin();
  const users = await syncableClients();
  if (!users.length) return { error: "No client has a network connected yet." };
  await logEvent(me, "sync all", null, `${users.length} clients`);
  if (await enqueue("liftpage/insights.sync", { userId: "" })) return { ok: `Syncing ${plural(users.length, "client")} in the background.` };
  let ok = 0;
  for (const userId of users) {
    const report = await syncInsights(userId);
    if (report.some((r) => r.ok)) ok++;
  }
  refresh();
  return { ok: `Synced ${ok} of ${plural(users.length, "client")}.` };
}
