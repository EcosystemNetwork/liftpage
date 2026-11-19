import { loadCampaign } from "@/lib/campaigns";
import { adminOrResponse } from "@/lib/dal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One campaign with its agent steps. The desk polls this while the agents work. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const campaign = await loadCampaign(id);
  if (!campaign) return Response.json({ error: "No such campaign." }, { status: 404 });
  return Response.json({ campaign });
}
