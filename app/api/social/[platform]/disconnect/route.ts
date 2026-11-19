import { adminOrResponse } from "@/lib/dal";
import { disconnect } from "@/lib/social/oauth";
import { loadDesk } from "@/lib/store";
import { PLATFORMS, type Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: RouteContext<"/api/social/[platform]/disconnect">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const platform = (await params).platform as Platform;
  if (!PLATFORMS.includes(platform)) return Response.json({ error: "Unknown network." }, { status: 404 });
  const { brandId } = (await request.json().catch(() => ({}))) as { brandId?: string };
  if (!brandId) return Response.json({ error: "Pick a board." }, { status: 400 });
  await disconnect(brandId, platform);
  return Response.json({ desk: await loadDesk(brandId) });
}
