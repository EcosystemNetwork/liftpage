import { EMAIL } from "@/lib/accounts";
import { headers } from "next/headers";
import { currentUser } from "@/lib/dal";
import { nid } from "@/lib/id";
import { limited } from "@/lib/rate";
import { updateDesk } from "@/lib/store";
import { PACKAGES, type PackageId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PACKS = new Set<PackageId>(["starter", "growth", "accelerator", "event"]);

export async function POST(request: Request) {
  const list = await headers();
  const ip = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "local";
  if (limited(`hold:${ip}`, 10, 60 * 60_000)) {
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
  await updateDesk((current) => {
    current.holds.unshift({
      id: nid("hold"),
      at: new Date().toISOString(),
      name,
      email,
      company,
      packageId,
      brandId: current.brand.id,
      amount: PACKAGES[packageId].amount,
      status: "requested",
      userId: user?.role === "client" ? user.id : undefined,
    });
    current.holds = current.holds.slice(0, 1000);
  });

  // Public endpoint: never echo the desk back. It holds every other lead.
  return Response.json({ ok: true });
}
