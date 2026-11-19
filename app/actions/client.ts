"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { findUser } from "@/lib/accounts";
import { logEvent } from "@/lib/admin";
import { track } from "@/lib/analytics";
import { captionPhoto, deletePhoto, finishSetup, loadSetup, ownsPath, PHOTO_EXT, PHOTO_MAX, photoUploaded, recordPhoto, saveSetup } from "@/lib/client-files";
import { requireAdmin, requireUser } from "@/lib/dal";
import { cleanHandle } from "@/lib/handles";
import { notifyAddress, sendMail } from "@/lib/email";
import { enqueue } from "@/lib/inngest/client";
import { notifyHold } from "@/lib/notify";
import { addGeneralChange, countChangesToday } from "@/lib/projects";
import { limited } from "@/lib/rate";
import { siteUrl } from "@/lib/site";
import { addHold, listBoards } from "@/lib/store";
import { stripeReady } from "@/lib/stripe";
import { PACKAGES, SETUP_ASKS, SETUP_NAME, SETUP_PLATFORMS, type PackageId, type SetupAsk, type SetupPlatform, type User } from "@/lib/types";
import type { FormState } from "./auth";

/*
 * What a client does for themselves from /account: start a campaign, hand over photos,
 * ask for a change, and tell us about their social accounts. Admins act on a client's
 * behalf by naming them (clientId); a client always acts on their own account.
 */

function text(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function refresh(clientId: string) {
  revalidatePath("/account");
  revalidatePath(`/admin/customers/${clientId}`);
  revalidatePath("/admin", "layout");
}

/** The client this action is for: the caller, or the named client when an admin calls. */
async function target(data: FormData): Promise<{ me: User; client: User } | { error: string }> {
  const me = await requireUser("/account");
  if (me.role !== "admin") return { me, client: me };
  const client = await findUser(text(data, "clientId", 40));
  if (!client || client.role !== "client") return { error: "That client account is gone." };
  return { me, client };
}

function tellLiftPage(subject: string, lines: string[], clientId: string, anchor: string, replyTo?: string) {
  const to = notifyAddress();
  if (!to) return;
  after(() =>
    sendMail({ to, subject, lines, action: { label: "Open the customer", url: `${siteUrl()}/admin/customers/${clientId}#${anchor}` }, replyTo }).catch((error) =>
      console.error("client mail", error),
    ),
  );
}

/* ---------- Start a campaign ---------- */

const PACKS = new Set<PackageId>(["starter", "growth", "accelerator", "event"]);

export type CampaignState = (FormState & { holdId?: string }) | undefined;

/** Same request the public form makes, filled from the account, with a brief. */
export async function startCampaign(_: CampaignState, data: FormData): Promise<CampaignState> {
  const me = await requireUser("/account");
  if (me.role !== "client") return { error: "Admins start campaigns for a client from the desk." };
  const packageId = text(data, "packageId", 20) as PackageId;
  const brief = text(data, "brief", 2000);
  const fields = { packageId, brief };
  if (!PACKS.has(packageId)) return { error: "Pick a package.", fields };
  if (brief.length < 10) return { error: "Tell us a little about what the campaign is for.", fields };
  if (await limited(`campaign:${me.id}`, 5, 24 * 60 * 60_000)) {
    return { error: "You've started a few today already. Send anything else as a message.", fields };
  }

  const house = (await listBoards()).find((board) => !board.clientId);
  const hold = await addHold({
    name: me.name || me.email,
    email: me.email,
    company: me.company,
    packageId,
    brandId: house?.id ?? "",
    amount: PACKAGES[packageId].amount,
    userId: me.id,
    brief,
  });
  await track(hold.id, "request_created", { package: packageId, from: "account" });
  if (!(await enqueue("liftpage/hold.created", { holdId: hold.id }, `hold-created/${hold.id}`))) {
    after(() => notifyHold(hold.id).catch((error) => console.error("notify", error)));
  }
  refresh(me.id);
  return {
    ok: `Started. We have your ${PACKAGES[packageId].name} request and reply within one business day. Nothing was charged.`,
    holdId: stripeReady() ? hold.id : undefined,
  };
}

/* ---------- Photos ---------- */

/** Records a photo the browser just uploaded on a signed URL from /api/photos. */
export async function savePhoto(input: { path: string; type: string; size: number; caption?: string; clientId?: string }): Promise<{ error?: string }> {
  const data = new FormData();
  if (input.clientId) data.set("clientId", input.clientId);
  const got = await target(data);
  if ("error" in got) return got;
  if (typeof input.path !== "string" || !ownsPath(got.client.id, input.path)) return { error: "That upload isn't yours." };
  if (!PHOTO_EXT[input.type] || !(input.size > 0 && input.size <= PHOTO_MAX)) return { error: "Photos only, under 25 MB." };
  if (!(await photoUploaded(input.path))) return { error: "The upload didn't finish. Try that photo again." };
  await recordPhoto({
    clientId: got.client.id,
    authorId: got.me.id,
    path: input.path,
    type: input.type,
    size: input.size,
    caption: (input.caption ?? "").trim().slice(0, 500),
  });
  return {};
}

/** Called once after a batch of uploads: one email to LiftPage, one refresh. */
export async function photosAdded(count: number, clientId?: string): Promise<void> {
  const data = new FormData();
  if (clientId) data.set("clientId", clientId);
  const got = await target(data);
  if ("error" in got) return;
  const n = Math.max(1, Math.min(500, Math.floor(count) || 1));
  if (got.me.role === "admin") {
    await logEvent(got.me, "photos added", got.client.id, `${n}`);
  } else if (!(await limited(`photo-mail:${got.client.id}`, 1, 30 * 60_000))) {
    tellLiftPage(`${got.client.company || got.client.name}: ${n} new ${n === 1 ? "photo" : "photos"}`, [`${got.client.name || got.client.email} added ${n} ${n === 1 ? "photo" : "photos"} to their library.`], got.client.id, "photos", got.client.email);
  }
  refresh(got.client.id);
}

export async function captionPhotoAction(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser("/account");
  const clientId = await captionPhoto(text(data, "photoId", 40), me.role === "admin" ? null : me.id, text(data, "caption", 500));
  if (!clientId) return { error: "That photo is gone." };
  refresh(clientId);
  return { ok: "Saved." };
}

export async function deletePhotoAction(data: FormData) {
  const me = await requireUser("/account");
  const clientId = await deletePhoto(text(data, "photoId", 40), me.role === "admin" ? null : me.id);
  if (!clientId) return;
  if (me.role === "admin") await logEvent(me, "photo deleted", clientId);
  refresh(clientId);
}

/* ---------- Anything else ---------- */

export async function requestGeneralChange(_: FormState, data: FormData): Promise<FormState> {
  const got = await target(data);
  if ("error" in got) return got;
  const body = text(data, "text", 4000);
  if (body.length < 4) return { error: "Say what you'd like changed." };
  if ((await countChangesToday(got.client.id)) >= 20) return { error: "That's a lot for one day. Send the rest as a message and we'll batch them.", fields: { text: body } };
  await addGeneralChange(got.client.id, got.me.id, body);
  if (got.me.role === "client") {
    tellLiftPage(`Change request: ${got.client.company || got.client.name}`, [`${got.me.name || got.me.email} (${got.client.company}) asked for:`, body], got.client.id, "projects", got.me.email);
  }
  refresh(got.client.id);
  return { ok: "Got it. You'll see it move from Received to In progress to Done here." };
}

/* ---------- Social accounts ---------- */

const pick = <T extends string>(value: string, list: readonly T[]): T | null => ((list as readonly string[]).includes(value) ? (value as T) : null);

export async function saveSocialSetup(_: FormState, data: FormData): Promise<FormState> {
  const got = await target(data);
  if ("error" in got) return got;
  const rows: { platform: SetupPlatform; ask: SetupAsk; handle: string; note: string }[] = [];
  for (const platform of SETUP_PLATFORMS) {
    const ask = pick<SetupAsk>(text(data, `ask_${platform}`, 10), SETUP_ASKS);
    if (!ask) continue;
    const handle = ask === "have" ? cleanHandle(text(data, `handle_${platform}`, 200)) : "";
    if (ask === "have" && !handle) return { error: `Add your ${SETUP_NAME[platform]} handle or link, or pick "Make one for me".` };
    rows.push({ platform, ask, handle, note: ask === "skip" ? "" : text(data, `note_${platform}`, 1000) });
  }
  if (!rows.length) return { error: "Pick an answer for at least one network." };
  const changed = await saveSetup(got.client.id, rows, await loadSetup(got.client.id));
  if (!changed.length) return { ok: "Nothing changed." };
  if (got.me.role === "client") {
    const lines = changed.map((r) =>
      r.ask === "have" ? `${SETUP_NAME[r.platform]}: has @${r.handle}` : r.ask === "make" ? `${SETUP_NAME[r.platform]}: make one for them` : `${SETUP_NAME[r.platform]}: not needed`,
    );
    tellLiftPage(`Social accounts: ${got.client.company || got.client.name}`, [`${got.me.name || got.me.email} updated their social accounts:`, ...lines], got.client.id, "social-setup", got.me.email);
  } else {
    await logEvent(got.me, "social setup", got.client.id, changed.map((r) => `${r.platform}:${r.ask}`).join(", "));
  }
  refresh(got.client.id);
  const making = rows.filter((r) => r.ask === "make").length;
  return {
    ok: making
      ? `Saved. We'll set up ${making} ${making === 1 ? "account" : "accounts"} and put the handles here when they're ready.`
      : "Saved. We'll be in touch about getting access to post for you.",
  };
}

/** LiftPage marks a network handled, with the handle of an account it made. */
export async function finishSetupAction(data: FormData) {
  const me = await requireAdmin();
  const client = await findUser(text(data, "clientId", 40));
  const platform = pick<SetupPlatform>(text(data, "platform", 20), SETUP_PLATFORMS);
  const status = text(data, "status", 10) === "open" ? "open" : "done";
  if (!client || client.role !== "client" || !platform) return;
  const raw = data.get("handle");
  const handle = typeof raw === "string" ? cleanHandle(raw) : undefined;
  await finishSetup(client.id, platform, status, handle || undefined);
  await logEvent(me, `social setup ${status}`, client.id, `${platform}${handle ? ` @${handle}` : ""}`);
  refresh(client.id);
}
