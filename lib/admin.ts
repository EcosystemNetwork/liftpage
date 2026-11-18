import "server-only";
import { findUser, toMetric } from "./accounts";
import { sendMail } from "./email";
import { clientFlags, urgency, type ClientSnapshot, type Flag } from "./health";
import { suiteFlags } from "./plan";
import { loadSuites } from "./projects";
import { buildReport } from "./report";
import { siteUrl } from "./site";
import { toHold } from "./store";
import { db, must } from "./supabase/server";
import type { AdminEvent, ClientNote, ClientStage, NoteKind, Platform, Post, User } from "./types";

type Row = Record<string, unknown>;
const opt = <T>(value: unknown) => (value === null || value === undefined ? undefined : (value as T));

/* ---------- Activity log ---------- */

/**
 * Records an admin action. Never throws: the action already happened, and a missing log
 * row must not turn it into an error on screen.
 */
export async function logEvent(actor: Pick<User, "id" | "email">, action: string, clientId?: string | null, detail = "") {
  const { error } = await db()
    .from("admin_events")
    .insert({ actor_id: actor.id, actor_email: actor.email, action, client_id: clientId ?? null, detail: detail.slice(0, 1000) });
  if (error) console.error("admin event", action, error.message);
}

export async function loadEvents(opts: { clientId?: string; limit?: number } = {}): Promise<AdminEvent[]> {
  let query = db().from("admin_events").select("*").order("at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.clientId) query = query.eq("client_id", opts.clientId);
  const { data, error } = await query;
  if (error) {
    // Before the admin-tools migration the table isn't there. Show an empty log, not a 500.
    console.error("load events", error.message);
    return [];
  }
  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    at: row.at as string,
    actorEmail: row.actor_email as string,
    action: row.action as string,
    clientId: opt<string>(row.client_id),
    detail: row.detail as string,
  }));
}

/* ---------- Client notes and stage ---------- */

export async function loadClientNotes(clientId: string): Promise<ClientNote[]> {
  const { data, error } = await db().from("client_notes").select("*").eq("client_id", clientId).order("pinned", { ascending: false }).order("at", { ascending: false });
  if (error) {
    console.error("client notes", error.message);
    return [];
  }
  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    authorId: opt<string>(row.author_id),
    text: row.text as string,
    pinned: Boolean(row.pinned),
    at: row.at as string,
  }));
}

export async function addClientNote(clientId: string, authorId: string, text: string) {
  must(await db().from("client_notes").insert({ client_id: clientId, author_id: authorId, text }), "save note");
}

/** Returns the note's client, so the caller can log and refresh the right page. */
export async function changeClientNote(id: string, change: { pinned: boolean } | "delete"): Promise<string | null> {
  const row = must(await db().from("client_notes").select("client_id").eq("id", id).maybeSingle(), "find note") as Row | null;
  if (!row) return null;
  if (change === "delete") must(await db().from("client_notes").delete().eq("id", id), "delete note");
  else must(await db().from("client_notes").update({ pinned: change.pinned }).eq("id", id), "pin note");
  return row.client_id as string;
}

export async function setStage(clientId: string, stage: ClientStage) {
  must(await db().from("profiles").update({ stage }).eq("id", clientId).eq("role", "client"), "set stage");
}

/* ---------- Health across the book ---------- */

type PostLite = ClientSnapshot["posts"][number] & { id: string; platform: Platform; publishedAt?: string };

function toPostLite(row: Row): PostLite {
  const notes = ((row.post_notes as Row[] | undefined) ?? [])
    .map((n) => ({ kind: n.kind as NoteKind, at: n.at as string }))
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    id: row.id as string,
    platform: row.platform as Platform,
    status: row.status as Post["status"],
    publishState: row.publish_state as Post["publishState"],
    slot: row.slot as string,
    publishedAt: opt<string>(row.published_at),
    // The health check reads only kind; the rest of PostNote isn't needed here.
    notes: notes as unknown as Post["notes"],
  };
}

const TONE_ORDER = { heat: 0, tape: 1, mute: 2 } as const;

export type ClientHealth ={ user: User; brandId?: string; flags: Flag[]; score: number };

/**
 * One pass over every client: boards, posts, connections, numbers, unread messages,
 * requests. Agency scale, so it reads whole tables rather than aggregating in SQL.
 */
export async function bookHealth(clients: User[], latestWeekByUser: Map<string, string>, now = Date.now()): Promise<ClientHealth[]> {
  if (!clients.length) return [];
  const ids = clients.map((c) => c.id);
  const brands = must(await db().from("brands").select("id, client_id").in("client_id", ids), "load boards") as Row[];
  const brandOf = new Map(brands.map((r) => [r.client_id as string, r.id as string]));
  const boardIds = brands.map((r) => r.id as string);
  const [posts, connections, unread, holds, suites] = await Promise.all([
    boardIds.length
      ? db().from("posts").select("id, brand_id, platform, status, publish_state, slot, published_at, post_notes(kind, at)").in("brand_id", boardIds)
      : { data: [], error: null },
    boardIds.length ? db().from("social_accounts").select("brand_id, platform, expires_at").in("brand_id", boardIds) : { data: [], error: null },
    db().from("messages").select("client_id").eq("role", "client").is("read_at", null),
    db().from("holds").select("*").in("user_id", ids),
    loadSuites(ids),
  ]);
  const postsBy = group(must(posts, "load posts") as Row[], (r) => r.brand_id as string);
  const connsBy = group(must(connections, "load connections") as Row[], (r) => r.brand_id as string);
  const unreadBy = group(must(unread, "load unread") as Row[], (r) => r.client_id as string);
  const holdsBy = group(must(holds, "load requests") as Row[], (r) => r.user_id as string);

  return clients
    .map((user) => {
      const brandId = brandOf.get(user.id);
      const flags = clientFlags(
        {
          user,
          hasBoard: Boolean(brandId),
          posts: brandId ? (postsBy.get(brandId) ?? []).map(toPostLite) : [],
          connections: brandId ? (connsBy.get(brandId) ?? []).map((r) => ({ platform: r.platform as Platform, expiresAt: opt<string>(r.expires_at) })) : [],
          latestWeek: latestWeekByUser.get(user.id),
          unread: unreadBy.get(user.id)?.length ?? 0,
          holds: (holdsBy.get(user.id) ?? []).map(toHold),
        },
        now,
      );
      const suite = suites.get(user.id);
      if (suite) flags.push(...suiteFlags(suite, now));
      flags.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
      return { user, brandId, flags, score: urgency(flags) };
    })
    .sort((a, b) => b.score - a.score || a.user.company.localeCompare(b.user.company));
}

function group<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}

/* ---------- Reports ---------- */

export type ReportOutcome = "sent" | "empty" | "no-email" | "skipped";

/**
 * Builds and emails one client's weekly report. `key` makes a retried send a no-op at
 * Resend (the weekly job passes the week). Throws only on a real send failure.
 */
export async function sendReport(clientId: string, key?: string): Promise<ReportOutcome> {
  const client = await findUser(clientId);
  if (!client || client.role !== "client" || client.disabled) return "skipped";
  const brand = must(await db().from("brands").select("id").eq("client_id", clientId).maybeSingle(), "find board") as Row | null;
  const [metrics, posts] = await Promise.all([
    db().from("metrics").select("*").eq("user_id", clientId).order("week"),
    brand ? db().from("posts").select("id, brand_id, platform, status, publish_state, slot, published_at, post_notes(kind, at)").eq("brand_id", brand.id as string) : null,
  ]);
  const report = buildReport(client, (must(metrics, "load numbers") ?? []).map(toMetric), posts ? (must(posts, "load posts") as Row[]).map(toPostLite) : []);
  if (report.empty) return "empty";
  const sent = await sendMail({
    to: client.email,
    subject: report.subject,
    lines: report.lines,
    action: { label: "See your numbers", url: `${siteUrl()}/account#numbers` },
    idempotencyKey: key ? `report/${clientId}/${key}` : undefined,
  });
  return sent ? "sent" : "no-email";
}

export function weeklyReportsOn(): boolean {
  return process.env.LIFTPAGE_WEEKLY_REPORTS === "true";
}

/** Clients a book-wide report or broadcast goes to: switched on, and onboarding or active. */
export async function reachableClients(): Promise<User[]> {
  const { loadAccounts } = await import("./accounts");
  const { users } = await loadAccounts();
  return users.filter((u) => u.role === "client" && !u.disabled && (u.stage === "active" || u.stage === "onboarding"));
}
