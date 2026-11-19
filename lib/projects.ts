import "server-only";
import { db, must } from "./supabase/server";
import type { ChangeRequest, ChangeStatus, Plan, PlanOffer, PlanStatus, Project, ProjectKind, ProjectStatus, SiteCheck } from "./types";

type Row = Record<string, unknown>;
const opt = <T>(value: unknown) => (value === null || value === undefined ? undefined : (value as T));

/*
 * The client suite's tables: projects, change requests, plans. Server only; callers check
 * who is asking (lib/dal.ts) before they get here.
 */

function toProject(row: Row): Project {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    kind: row.kind as ProjectKind,
    name: row.name as string,
    url: opt<string>(row.url),
    status: row.status as ProjectStatus,
    summary: (row.summary as string) ?? "",
    createdAt: row.created_at as string,
    check: row.checked_at
      ? {
          at: row.checked_at as string,
          ok: Boolean(row.check_ok),
          code: opt<number>(row.check_code),
          ms: opt<number>(row.check_ms),
          error: opt<string>(row.check_error),
        }
      : undefined,
  };
}

function toChange(row: Row): ChangeRequest {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    clientId: row.client_id as string,
    text: row.text as string,
    status: row.status as ChangeStatus,
    at: row.at as string,
    doneAt: opt<string>(row.done_at),
  };
}

function toPlan(row: Row): Plan {
  return {
    clientId: row.client_id as string,
    name: row.name as string,
    monthly: row.monthly as number,
    includes: (row.includes as string) ?? "",
    offer: row.offer as PlanOffer,
    trialEndsAt: opt<string>(row.trial_ends_at),
    lockedUntil: opt<string>(row.locked_until),
    status: row.status as PlanStatus,
    startedAt: opt<string>(row.started_at),
    subscribed: Boolean(row.stripe_subscription_id),
  };
}

export type Suite = { projects: Project[]; changes: ChangeRequest[]; plan: Plan | null };

/**
 * Everything in one client's suite. Before the migration runs the tables aren't there;
 * that reads as an empty suite, not a 500.
 */
export async function loadSuite(clientId: string): Promise<Suite> {
  const [projects, changes, plan] = await Promise.all([
    db().from("projects").select("*").eq("client_id", clientId).order("created_at"),
    db().from("change_requests").select("*").eq("client_id", clientId).order("at", { ascending: false }).limit(100),
    db().from("plans").select("*").eq("client_id", clientId).maybeSingle(),
  ]);
  if (projects.error || changes.error || plan.error) {
    console.error("load suite", projects.error?.message ?? changes.error?.message ?? plan.error?.message);
    return { projects: [], changes: [], plan: null };
  }
  return {
    projects: (projects.data ?? []).map(toProject),
    changes: (changes.data ?? []).map(toChange),
    plan: plan.data ? toPlan(plan.data) : null,
  };
}

/** Suites for many clients at once, for the book-wide health pass. */
export async function loadSuites(clientIds: string[]): Promise<Map<string, Suite>> {
  const out = new Map<string, Suite>(clientIds.map((id) => [id, { projects: [], changes: [], plan: null }]));
  if (!clientIds.length) return out;
  const [projects, changes, plans] = await Promise.all([
    db().from("projects").select("*").in("client_id", clientIds),
    db().from("change_requests").select("*").in("client_id", clientIds).neq("status", "done"),
    db().from("plans").select("*").in("client_id", clientIds),
  ]);
  if (projects.error || changes.error || plans.error) {
    console.error("load suites", projects.error?.message ?? changes.error?.message ?? plans.error?.message);
    return out;
  }
  for (const row of projects.data ?? []) out.get(row.client_id as string)?.projects.push(toProject(row));
  for (const row of changes.data ?? []) out.get(row.client_id as string)?.changes.push(toChange(row));
  for (const row of plans.data ?? []) {
    const suite = out.get(row.client_id as string);
    if (suite) suite.plan = toPlan(row);
  }
  return out;
}

export async function findProject(id: string): Promise<Project | null> {
  const row = must(await db().from("projects").select("*").eq("id", id).maybeSingle(), "find project") as Row | null;
  return row ? toProject(row) : null;
}

export type ProjectInput = { kind: ProjectKind; name: string; url: string | null; status: ProjectStatus; summary: string };

export async function saveProject(clientId: string, input: ProjectInput, id?: string): Promise<Project> {
  const values = { kind: input.kind, name: input.name, url: input.url, status: input.status, summary: input.summary, updated_at: new Date().toISOString() };
  const result = id
    ? await db().from("projects").update(values).eq("id", id).eq("client_id", clientId).select("*").single()
    : await db().from("projects").insert({ ...values, client_id: clientId }).select("*").single();
  return toProject(must(result, "save project") as Row);
}

export async function deleteProject(clientId: string, id: string) {
  must(await db().from("projects").delete().eq("id", id).eq("client_id", clientId), "delete project");
}

export async function addChange(project: Project, authorId: string, text: string): Promise<ChangeRequest> {
  const row = must(
    await db().from("change_requests").insert({ project_id: project.id, client_id: project.clientId, author_id: authorId, text }).select("*").single(),
    "save change request",
  ) as Row;
  return toChange(row);
}

/** Returns the request's client, so the caller can log and refresh, or null when it's gone. */
export async function setChangeStatus(id: string, status: ChangeStatus): Promise<string | null> {
  const rows = must(
    await db()
      .from("change_requests")
      .update({ status, done_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", id)
      .select("client_id"),
    "set change status",
  ) as Row[];
  return (rows[0]?.client_id as string | undefined) ?? null;
}

export async function countChangesToday(clientId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("change_requests").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("at", since);
  return count ?? 0;
}

/* ---------- Plan ---------- */

export async function loadPlan(clientId: string): Promise<Plan | null> {
  const row = must(await db().from("plans").select("*").eq("client_id", clientId).maybeSingle(), "load plan") as Row | null;
  return row ? toPlan(row) : null;
}

export type PlanInput = {
  name: string;
  monthly: number;
  includes: string;
  offer: PlanOffer;
  trialEndsAt: string | null;
  lockedUntil: string | null;
  status: PlanStatus;
};

export async function savePlan(clientId: string, input: PlanInput): Promise<Plan> {
  const existing = await loadPlan(clientId);
  const now = new Date().toISOString();
  const started = existing?.startedAt ?? (input.status === "trialing" || input.status === "active" ? now : null);
  const row = must(
    await db()
      .from("plans")
      .upsert({
        client_id: clientId,
        name: input.name,
        monthly: input.monthly,
        includes: input.includes,
        offer: input.offer,
        trial_ends_at: input.offer === "trial" ? input.trialEndsAt : null,
        locked_until: input.offer === "locked" ? input.lockedUntil : null,
        status: input.status,
        started_at: started,
        updated_at: now,
      })
      .select("*")
      .single(),
    "save plan",
  ) as Row;
  return toPlan(row);
}

export async function deletePlan(clientId: string) {
  must(await db().from("plans").delete().eq("client_id", clientId), "delete plan");
}

/** What the Stripe webhook writes. Matched by client id, never by anything the browser sent. */
export async function recordSubscription(
  clientId: string,
  patch: { status: PlanStatus; customerId?: string | null; subscriptionId?: string | null },
): Promise<boolean> {
  const values: Row = { status: patch.status, updated_at: new Date().toISOString() };
  if (patch.customerId !== undefined) values.stripe_customer_id = patch.customerId;
  if (patch.subscriptionId !== undefined) values.stripe_subscription_id = patch.subscriptionId;
  const rows = must(await db().from("plans").update(values).eq("client_id", clientId).select("client_id"), "record subscription") as Row[];
  if (rows.length && (patch.status === "trialing" || patch.status === "active")) {
    // First start only; later updates keep the original date.
    must(await db().from("plans").update({ started_at: new Date().toISOString() }).eq("client_id", clientId).is("started_at", null), "plan start date");
  }
  return rows.length > 0;
}

export async function planBySubscription(subscriptionId: string): Promise<string | null> {
  const row = must(await db().from("plans").select("client_id").eq("stripe_subscription_id", subscriptionId).maybeSingle(), "find plan") as Row | null;
  return (row?.client_id as string | undefined) ?? null;
}

/* ---------- Uptime ---------- */

/**
 * Loads the page the way a visitor would and times it. Follows redirects; anything below
 * 400 counts as up. Never throws.
 */
export async function checkSite(url: string, fetcher: typeof fetch = fetch): Promise<SiteCheck> {
  const started = Date.now();
  const at = new Date(started).toISOString();
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { "user-agent": "LiftPage uptime check" },
      signal: AbortSignal.timeout(10_000),
    });
    // Don't download the whole page; the status line is the answer.
    await response.body?.cancel().catch(() => undefined);
    return { at, ok: response.status < 400, code: response.status, ms: Date.now() - started };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { at, ok: false, ms: Date.now() - started, error: name === "TimeoutError" ? "timed out" : "unreachable" };
  }
}

export async function recordCheck(projectId: string, check: SiteCheck) {
  must(
    await db()
      .from("projects")
      .update({ checked_at: check.at, check_ok: check.ok, check_code: check.code ?? null, check_ms: check.ms ?? null, check_error: check.error ?? null })
      .eq("id", projectId),
    "record check",
  );
}

/** Every website with an address that isn't paused. For the hourly job. */
export async function watchedSites(): Promise<{ id: string; url: string; clientId: string; name: string; wasOk: boolean | null }[]> {
  const { data, error } = await db().from("projects").select("id, url, client_id, name, check_ok").eq("kind", "website").neq("status", "paused").not("url", "is", null);
  if (error) {
    console.error("watched sites", error.message);
    return [];
  }
  return (data ?? []).map((r: Row) => ({
    id: r.id as string,
    url: r.url as string,
    clientId: r.client_id as string,
    name: r.name as string,
    wasOk: (r.check_ok as boolean | null) ?? null,
  }));
}
