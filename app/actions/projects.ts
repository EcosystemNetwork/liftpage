"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { findUser } from "@/lib/accounts";
import { logEvent } from "@/lib/admin";
import { requireAdmin, requireUser } from "@/lib/dal";
import { notifyAddress, sendMail } from "@/lib/email";
import { cleanUrl } from "@/lib/plan";
import {
  addChange,
  checkSite,
  countChangesToday,
  deletePlan,
  deleteProject,
  findProject,
  recordCheck,
  savePlan,
  saveProject,
  setChangeStatus,
} from "@/lib/projects";
import { limited } from "@/lib/rate";
import { siteUrl } from "@/lib/site";
import {
  CHANGE_STATUSES,
  PLAN_OFFERS,
  PLAN_STATUSES,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  type ChangeStatus,
  type PlanOffer,
  type PlanStatus,
  type ProjectKind,
  type ProjectStatus,
} from "@/lib/types";
import type { FormState } from "./auth";

/*
 * The client suite. Admins set up projects and the plan from /admin/customers/[id];
 * clients ask for changes and check their site from /account.
 */

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function pick<T extends string>(value: string, list: readonly T[]): T | null {
  return (list as readonly string[]).includes(value) ? (value as T) : null;
}

function refresh(clientId: string) {
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/customers/${clientId}`);
  revalidatePath("/account");
}

async function adminAndClient(data: FormData) {
  const me = await requireAdmin();
  const client = await findUser(text(data, "clientId", 40));
  if (!client || client.role !== "client") return { error: "That client account is gone." } as const;
  return { me, client } as const;
}

/* ---------- Admin: projects ---------- */

export async function saveProjectAction(_: FormState, data: FormData): Promise<FormState> {
  const got = await adminAndClient(data);
  if ("error" in got) return got;
  const kind = pick<ProjectKind>(text(data, "kind", 20), PROJECT_KINDS);
  const status = pick<ProjectStatus>(text(data, "status", 20), PROJECT_STATUSES);
  const name = text(data, "name", 120);
  if (!kind || !status) return { error: "Pick a kind and a status." };
  if (!name) return { error: "Give the project a name." };
  const rawUrl = text(data, "url", 500);
  const url = rawUrl ? cleanUrl(rawUrl) : null;
  if (rawUrl && !url) return { error: "That address doesn't look like a website. Use https://example.com." };
  const id = text(data, "projectId", 40) || undefined;
  if (id) {
    const existing = await findProject(id);
    if (!existing || existing.clientId !== got.client.id) return { error: "That project is gone." };
  }
  const project = await saveProject(got.client.id, { kind, name, url, status, summary: text(data, "summary", 2000) }, id);
  await logEvent(got.me, id ? "project updated" : "project added", got.client.id, `${project.name} · ${project.status}`);
  // A new live site gets its first check now, so the client never sees "not checked".
  if (project.url && project.kind === "website" && project.status !== "paused" && !project.check) {
    after(async () => recordCheck(project.id, await checkSite(project.url!)));
  }
  refresh(got.client.id);
  return { ok: id ? "Saved." : `Added ${project.name}. ${got.client.name || got.client.company} sees it on their account.` };
}

export async function removeProject(data: FormData) {
  const got = await adminAndClient(data);
  if ("error" in got) return;
  const project = await findProject(text(data, "projectId", 40));
  if (!project || project.clientId !== got.client.id) return;
  await deleteProject(got.client.id, project.id);
  await logEvent(got.me, "project removed", got.client.id, project.name);
  refresh(got.client.id);
}

export async function changeStatusAction(data: FormData) {
  const me = await requireAdmin();
  const status = pick<ChangeStatus>(text(data, "status", 10), CHANGE_STATUSES);
  if (!status) return;
  const clientId = await setChangeStatus(text(data, "changeId", 40), status);
  if (!clientId) return;
  await logEvent(me, "change request", clientId, status);
  refresh(clientId);
}

/* ---------- Admin: plan ---------- */

const DAY = 86_400_000;

export async function savePlanAction(_: FormState, data: FormData): Promise<FormState> {
  const got = await adminAndClient(data);
  if ("error" in got) return got;
  const offer = pick<PlanOffer>(text(data, "offer", 20), PLAN_OFFERS);
  const status = pick<PlanStatus>(text(data, "status", 20), PLAN_STATUSES);
  if (!offer || !status) return { error: "Pick an offer and a status." };
  const monthly = Number(text(data, "monthly", 10));
  if (!Number.isInteger(monthly) || monthly < 0 || monthly > 100_000) return { error: "Monthly price is whole dollars, 0 to 100,000." };

  let trialEndsAt: string | null = null;
  if (offer === "trial") {
    const day = text(data, "trialEnds", 10);
    // Blank means the usual: one month from today.
    trialEndsAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T23:59:00Z`).toISOString() : new Date(Date.now() + 30 * DAY).toISOString();
    if (Number.isNaN(Date.parse(trialEndsAt))) return { error: "The free-until date doesn't parse." };
  }
  let lockedUntil: string | null = null;
  if (offer === "locked") {
    lockedUntil = text(data, "lockedUntil", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lockedUntil) || Number.isNaN(Date.parse(lockedUntil))) return { error: "Set the date the locked price holds through." };
  }

  const plan = await savePlan(got.client.id, {
    name: text(data, "name", 120) || "Online presence",
    monthly,
    includes: text(data, "includes", 2000),
    offer,
    trialEndsAt,
    lockedUntil,
    status,
  });
  await logEvent(got.me, "plan saved", got.client.id, `${plan.name} · $${plan.monthly}/mo · ${plan.offer} · ${plan.status}`);
  refresh(got.client.id);
  return { ok: plan.subscribed ? "Saved. Stripe still bills the price the client subscribed at; change it in Stripe too if it moved." : "Saved." };
}

export async function removePlan(data: FormData) {
  const got = await adminAndClient(data);
  if ("error" in got) return;
  await deletePlan(got.client.id);
  await logEvent(got.me, "plan removed", got.client.id);
  refresh(got.client.id);
}

/* ---------- Client ---------- */

export async function requestChange(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser("/account");
  const project = await findProject(text(data, "projectId", 40));
  // Clients only touch their own projects; admins may file one for a client.
  if (!project || (me.role !== "admin" && project.clientId !== me.id)) return { error: "That project is gone." };
  const body = text(data, "text", 4000);
  if (body.length < 4) return { error: "Say what you'd like changed." };
  if ((await countChangesToday(project.clientId)) >= 20) return { error: "That's a lot for one day. Send the rest as a message and we'll batch them." };
  await addChange(project, me.id, body);
  const to = notifyAddress();
  if (to) {
    after(() =>
      sendMail({
        to,
        subject: `Change request: ${project.name}`,
        lines: [`${me.name || me.email} (${me.company}) asked for a change on ${project.name}:`, body],
        action: { label: "Open the customer", url: `${siteUrl()}/admin/customers/${project.clientId}#projects` },
      }).catch((error) => console.error("change mail", error)),
    );
  }
  refresh(project.clientId);
  return { ok: "Got it. You'll see it move from Received to In progress to Done here." };
}

export async function checkNow(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser("/account");
  const project = await findProject(text(data, "projectId", 40));
  if (!project || (me.role !== "admin" && project.clientId !== me.id)) return { error: "That project is gone." };
  if (!project.url) return { error: "No address on this project yet." };
  if (await limited(`sitecheck:${me.id}`, 10, 10 * 60_000)) return { error: "Checked a lot just now. Try again in a few minutes." };
  const check = await checkSite(project.url);
  await recordCheck(project.id, check);
  refresh(project.clientId);
  return check.ok ? { ok: `Up. Answered ${check.code} in ${check.ms} ms.` } : { error: `Didn't answer cleanly${check.code ? ` (${check.code})` : check.error ? ` (${check.error})` : ""}. LiftPage sees it on our side too.` };
}
