import "server-only";
import { randomBytes } from "node:crypto";
import { campaignTag } from "./agents/distribute";
import type { Distribution } from "./agents/distribution";
import {
  byContent,
  EMPTY_FUNNEL,
  funnelOf,
  LEAD_STATUSES,
  NO_TOUCH,
  type AttributionEvent,
  type Funnel,
  type Lead,
  type LeadStatus,
  type TrackEvent,
} from "./attribution";
import { campaignsFor } from "./campaigns";
import { nid } from "./id";
import { db, must } from "./supabase/server";
import type { Platform } from "./types";
import type { Usage } from "./usage-format";

type Row = Record<string, unknown>;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A public, write-only key. It can add events for one board and read nothing. */
function newKey(): string {
  const bytes = randomBytes(32);
  return `lpk_${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

export async function trackKeyFor(brandId: string): Promise<string | null> {
  const row = must(await db().from("brands").select("track_key").eq("id", brandId).maybeSingle(), "load track key") as Row | null;
  return (row?.track_key as string | null) ?? null;
}

/** Makes or replaces the board's key. The old one stops working at once. */
export async function rotateTrackKey(brandId: string): Promise<string> {
  const key = newKey();
  must(await db().from("brands").update({ track_key: key }).eq("id", brandId), "save track key");
  return key;
}

export async function brandForKey(key: string): Promise<string | null> {
  const row = must(await db().from("brands").select("id").eq("track_key", key).maybeSingle(), "find track key") as Row | null;
  return (row?.id as string | undefined) ?? null;
}

function toLead(row: Row): Lead {
  return {
    id: row.id as string,
    brandId: row.brand_id as string,
    email: row.email as string,
    name: (row.name as string) ?? "",
    company: (row.company as string) ?? "",
    touch: { campaign: (row.campaign as string) ?? "", source: (row.source as string) ?? "", medium: (row.medium as string) ?? "", content: (row.content as string) ?? "" },
    status: row.status as LeadStatus,
    valueCents: row.value_cents === null || row.value_cents === undefined ? undefined : Number(row.value_cents),
    currency: (row.currency as string) ?? "usd",
    notes: (row.notes as string) ?? "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function leadByEmail(brandId: string, email: string): Promise<Lead | null> {
  const row = must(await db().from("leads").select("*").eq("brand_id", brandId).eq("email", email).maybeSingle(), "find lead") as Row | null;
  return row ? toLead(row) : null;
}

const DUPLICATE = "23505";

/** Inserts an event; a resent one (same external id) is quietly accepted. */
async function addEvent(row: Row): Promise<"saved" | "duplicate"> {
  const { error } = await db().from("attribution_events").insert(row);
  if (!error) return "saved";
  if ((error as { code?: string }).code === DUPLICATE) return "duplicate";
  throw new Error(`save event: ${error.message}`);
}

/**
 * Finds or makes the lead. The first touch that brought someone in stays theirs; a later
 * sign-up only fills in what's missing, so a resubmitted form can't steal the credit.
 */
async function upsertLead(brandId: string, event: TrackEvent): Promise<Lead> {
  const found = await leadByEmail(brandId, event.email!);
  if (found) {
    const patch: Row = {};
    if (!found.name && event.name) patch.name = event.name;
    if (!found.company && event.company) patch.company = event.company;
    if (!found.touch.campaign && event.touch.campaign) Object.assign(patch, event.touch);
    if (Object.keys(patch).length) {
      must(await db().from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", found.id), "update lead");
    }
    return { ...found, ...(patch as Partial<Lead>) };
  }
  const row = { id: nid("lead"), brand_id: brandId, email: event.email, name: event.name ?? "", company: event.company ?? "", ...event.touch };
  const { error } = await db().from("leads").insert(row);
  if (error && (error as { code?: string }).code === DUPLICATE) {
    // Two sign-ups raced; the other one made the row.
    const raced = await leadByEmail(brandId, event.email!);
    if (raced) return raced;
  }
  if (error) throw new Error(`save lead: ${error.message}`);
  return (await leadByEmail(brandId, event.email!))!;
}

export async function recordTrack(brandId: string, event: TrackEvent): Promise<"saved" | "duplicate"> {
  const base = { brand_id: brandId, kind: event.kind, path: event.path, external_id: event.externalId ?? null };
  if (event.kind === "visit") return addEvent({ ...base, ...event.touch });
  if (event.kind === "lead") {
    const lead = await upsertLead(brandId, event);
    return addEvent({ ...base, ...lead.touch, lead_id: lead.id });
  }
  // A sale without its own touch is credited to the lead's, when we know who bought.
  const lead = event.email ? await leadByEmail(brandId, event.email) : null;
  const touch = event.touch.campaign ? event.touch : (lead?.touch ?? NO_TOUCH);
  return addEvent({ ...base, ...touch, value_cents: event.valueCents ?? 0, currency: event.currency ?? "usd", lead_id: lead?.id ?? null });
}

/* ---------- CRM ---------- */

export async function listLeads(brandId: string, limit = 500): Promise<Lead[]> {
  const rows = must(await db().from("leads").select("*").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(limit), "list leads") as Row[];
  return rows.map(toLead);
}

export async function loadLead(id: string): Promise<Lead | null> {
  const row = must(await db().from("leads").select("*").eq("id", id).maybeSingle(), "load lead") as Row | null;
  return row ? toLead(row) : null;
}

export async function updateLead(id: string, patch: { status?: LeadStatus; valueCents?: number | null; notes?: string }) {
  const row: Row = { updated_at: new Date().toISOString() };
  if (patch.status && LEAD_STATUSES.includes(patch.status)) row.status = patch.status;
  if (patch.valueCents !== undefined) row.value_cents = patch.valueCents;
  if (patch.notes !== undefined) row.notes = patch.notes.slice(0, 4000);
  must(await db().from("leads").update(row).eq("id", id), "update lead");
}

/* ---------- Report ---------- */

export type PostLine = { content: string; platform?: Platform; day?: number; hook?: string; funnel: Funnel };

export type CampaignReport = {
  tag: string;
  campaign?: { id: string; url: string; goal: string; createdAt: string; usage: Usage };
  funnel: Funnel;
  posts: PostLine[];
};

export type BoardReport = { campaigns: CampaignReport[]; unattributed: Funnel; since: string };

const REPORT_DAYS = 180;

/** Every campaign's funnel on a board, with a line per post. Events from the last 180 days. */
export async function boardReport(brandId: string): Promise<BoardReport> {
  const since = new Date(Date.now() - REPORT_DAYS * 86_400_000).toISOString();
  const [eventRows, leads, campaigns] = await Promise.all([
    must(
      await db().from("attribution_events").select("kind, campaign, content, value_cents, currency, lead_id, at").eq("brand_id", brandId).gte("at", since).limit(50_000),
      "load events",
    ) as Row[],
    listLeads(brandId, 5000),
    campaignsFor(brandId, 50),
  ]);
  const events: AttributionEvent[] = eventRows.map((row) => ({
    kind: row.kind as AttributionEvent["kind"],
    campaign: (row.campaign as string) ?? "",
    content: (row.content as string) ?? "",
    valueCents: row.value_cents === null ? undefined : Number(row.value_cents),
    currency: (row.currency as string | null) ?? undefined,
    leadId: (row.lead_id as string | null) ?? undefined,
    at: row.at as string,
  }));

  const byTag = new Map(campaigns.map((campaign) => [campaignTag(campaign.id, campaign.createdAt), campaign]));
  const tags = new Set([...events.map((e) => e.campaign), ...leads.map((l) => l.touch.campaign)].filter(Boolean));
  for (const tag of byTag.keys()) tags.add(tag);

  const reports: CampaignReport[] = [...tags].map((tag) => {
    const campaign = byTag.get(tag);
    const own = events.filter((e) => e.campaign === tag);
    const ownLeads = leads.filter((l) => l.touch.campaign === tag);
    const distribution = campaign?.steps.find((s) => s.agent === "distribution" && s.status === "done")?.output as Distribution | undefined;
    const content = campaign?.steps.find((s) => s.agent === "content" && s.status === "done")?.output as { posts?: { id: string; hook: string }[] } | undefined;
    const hooks = new Map((content?.posts ?? []).map((p) => [p.id, p.hook]));
    const placements = new Map((distribution?.placements ?? []).map((p) => [p.content, p]));
    const split = byContent(own, ownLeads);
    // Every planned post gets a line, even before it has traffic.
    for (const key of placements.keys()) if (!split.has(key)) split.set(key, { ...EMPTY_FUNNEL, sales: {}, won: {} });
    const posts: PostLine[] = [...split.entries()]
      .map(([key, funnel]) => {
        const placement = placements.get(key);
        return { content: key, platform: placement?.platform, day: placement?.day, hook: placement ? hooks.get(placement.postId) : undefined, funnel };
      })
      .sort((a, b) => (a.day ?? 99) - (b.day ?? 99) || a.content.localeCompare(b.content));
    return {
      tag,
      campaign: campaign ? { id: campaign.id, url: campaign.url, goal: campaign.goal, createdAt: campaign.createdAt, usage: campaign.usage } : undefined,
      funnel: funnelOf(own, ownLeads),
      posts,
    };
  });
  reports.sort((a, b) => (b.campaign?.createdAt ?? "").localeCompare(a.campaign?.createdAt ?? ""));

  return {
    campaigns: reports,
    unattributed: funnelOf(
      events.filter((e) => !e.campaign),
      leads.filter((l) => !l.touch.campaign),
    ),
    since,
  };
}
