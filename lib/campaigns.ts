import "server-only";
import { randomUUID } from "node:crypto";
import { AGENT_ROSTER } from "./agents/roster";
import { db, must } from "./supabase/server";
import type { AgentId, AgentStep, Campaign, CampaignStatus, StepStatus } from "./types";
import { addUsage, type Usage } from "./usage-format";

type Row = Record<string, unknown>;

const opt = <T>(value: unknown) => (value === null || value === undefined ? undefined : (value as T));

/** A run left "running" this long was cut off (deploy, timeout); the desk shows it as failed. */
const STALE_MS = 10 * 60_000;

function toStep(row: Row): AgentStep {
  return {
    agent: row.agent as AgentId,
    status: row.status as StepStatus,
    startedAt: opt<string>(row.started_at),
    finishedAt: opt<string>(row.finished_at),
    via: opt<string>(row.via),
    note: (row.note as string) ?? "",
    output: opt<unknown>(row.output),
    error: opt<string>(row.error),
    usage: opt<Usage>(row.usage),
  };
}

function toCampaign(row: Row): Campaign {
  const steps = ((row.agent_steps as Row[] | undefined) ?? [])
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map(toStep);
  let status = row.status as CampaignStatus;
  const started = Date.parse((row.started_at as string) ?? (row.created_at as string));
  if ((status === "running" || status === "queued") && Date.now() - started > STALE_MS) status = "failed";
  return {
    id: row.id as string,
    brandId: row.brand_id as string,
    url: row.url as string,
    goal: (row.goal as string) ?? "",
    competitors: (row.competitors as string[]) ?? [],
    status,
    createdAt: row.created_at as string,
    startedAt: opt<string>(row.started_at),
    finishedAt: opt<string>(row.finished_at),
    postIds: (row.post_ids as string[]) ?? [],
    steps,
    usage: addUsage(...steps.map((step) => step.usage)),
  };
}

const SELECT = "*, agent_steps(*)";

export async function createCampaign(input: { brandId: string; url: string; goal: string; competitors: string[] }): Promise<Campaign> {
  // The id is enough to read the campaign's research, so it gets real randomness.
  const id = `cmp_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  must(
    await db().from("campaigns").insert({ id, brand_id: input.brandId, url: input.url, goal: input.goal, competitors: input.competitors }),
    "save campaign",
  );
  must(
    await db()
      .from("agent_steps")
      .insert(
        AGENT_ROSTER.map((agent, position) => ({
          campaign_id: id,
          agent: agent.id,
          position,
          status: agent.ready ? "queued" : "skipped",
          note: agent.ready ? "" : "Not wired in yet. On the next build list.",
        })),
      ),
    "save campaign steps",
  );
  const made = await loadCampaign(id);
  if (!made) throw new Error("The campaign didn't save.");
  return made;
}

export async function loadCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await db().from("campaigns").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`load campaign: ${error.message}`);
  return data ? toCampaign(data as Row) : null;
}

export async function latestCampaign(brandId: string): Promise<Campaign | null> {
  const { data, error } = await db()
    .from("campaigns")
    .select(SELECT)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`load campaign: ${error.message}`);
  return data ? toCampaign(data as Row) : null;
}

/** Moves a queued campaign to running. False when someone else already took it. */
export async function claimCampaign(id: string): Promise<boolean> {
  const { data, error } = await db()
    .from("campaigns")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued")
    .select("id");
  if (error) throw new Error(`claim campaign: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function setStep(
  campaignId: string,
  agent: AgentId,
  patch: { status: StepStatus; via?: string; note?: string; output?: unknown; error?: string; usage?: Usage },
) {
  const now = new Date().toISOString();
  const row: Row = { status: patch.status };
  if (patch.status === "running") row.started_at = now;
  if (patch.status === "done" || patch.status === "failed" || patch.status === "skipped") row.finished_at = now;
  if (patch.via !== undefined) row.via = patch.via;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.output !== undefined) row.output = patch.output;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.usage !== undefined) row.usage = patch.usage;
  must(await db().from("agent_steps").update(row).eq("campaign_id", campaignId).eq("agent", agent), "save step");
}

export async function finishCampaign(id: string, status: "ready" | "failed", patch: { postIds?: string[]; memory?: unknown } = {}) {
  const row: Row = { status, finished_at: new Date().toISOString() };
  if (patch.postIds) row.post_ids = patch.postIds;
  if (patch.memory !== undefined) row.memory = patch.memory;
  must(await db().from("campaigns").update(row).eq("id", id), "finish campaign");
}

/** Links the drafts and keeps the research while later agents are still working. */
export async function recordDrafts(id: string, postIds: string[], memory: unknown) {
  must(await db().from("campaigns").update({ post_ids: postIds, memory }).eq("id", id), "save campaign drafts");
}
