import { after } from "next/server";
import { EMAIL } from "@/lib/accounts";
import { track } from "@/lib/analytics";
import { currentUser } from "@/lib/dal";
import { enqueue } from "@/lib/inngest/client";
import { notifyHold } from "@/lib/notify";
import { clientIp, limited } from "@/lib/rate";
import { addHold, listBoards } from "@/lib/store";
import { stripeReady } from "@/lib/stripe";
import { supabaseReady } from "@/lib/supabase/server";
import { PACKAGES, type PackageId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PACKS = new Set<PackageId>(["starter", "growth", "accelerator", "event"]);

export async function POST(request: Request) {
  if (!supabaseReady()) return Response.json({ error: "Requests are offline. Email us instead." }, { status: 503 });
  if (await limited(`hold:${await clientIp()}`, 10, 60 * 60_000)) {
    return Response.json({ error: "Too many requests from here. Try again later." }, { status: 429 });
  }
  let body: { email?: unknown; name?: unknown; company?: unknown; packageId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send the request." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const company = typeof body.company === "string" ? body.company.trim().slice(0, 80) : "";
  const packageId = PACKS.has(body.packageId as PackageId) ? (body.packageId as PackageId) : null;
  if (!name || !company) {
    return Response.json({ error: "Name and company both need a line." }, { status: 400 });
  }
  if (!EMAIL.test(email) || email.length > 120) {
    return Response.json({ error: "That email doesn't look usable." }, { status: 400 });
  }
  if (!packageId) return Response.json({ error: "Pick a package." }, { status: 400 });

  const user = await currentUser();
  const house = (await listBoards()).find((board) => !board.clientId);
  const hold = await addHold({
    name,
    email,
    company,
    packageId,
    brandId: house?.id ?? "",
    amount: PACKAGES[packageId].amount,
    userId: user?.role === "client" ? user.id : undefined,
  });
  await track(hold.id, "request_created", { package: packageId });
  // Emails go through the job queue when there is one; otherwise after the response.
  if (!(await enqueue("liftpage/hold.created", { holdId: hold.id }, `hold-created/${hold.id}`))) {
    after(() => notifyHold(hold.id).catch((error) => console.error("notify", error)));
  }

  // Public endpoint: never echo the desk back. It holds every other lead.
  // holdId only when there is a way to pay; it is what the Pay button posts back.
  return Response.json({ ok: true, ...(stripeReady() ? { holdId: hold.id } : {}) });
}
