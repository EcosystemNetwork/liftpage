import { after } from "next/server";
import { logEvent } from "@/lib/admin";
import { runCampaign } from "@/lib/agents/run";
import { enqueue } from "@/lib/inngest/client";
import { createCampaign, finishCampaign, latestCampaign } from "@/lib/campaigns";
import { adminOrResponse } from "@/lib/dal";
import { limited } from "@/lib/rate";
import { normalizeUrl } from "@/lib/read-site";
import { loadBrand } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The agents run after the response, inside this budget.
export const maxDuration = 300;

/** The latest campaign on a board, so the desk can pick up a run after a reload. */
export async function GET(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const board = new URL(request.url).searchParams.get("board") ?? "";
  if (!board) return Response.json({ campaign: null });
  return Response.json({ campaign: await latestCampaign(board) });
}

/** Starts a campaign from a website: all six agents, drafts only, nothing scheduled. Admins only. */
export async function POST(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  let body: { url?: unknown; brandId?: unknown; goal?: unknown; competitors?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send a website address." }, { status: 400 });
  }
  const url = normalizeUrl(typeof body.url === "string" ? body.url : "");
  if (!url) return Response.json({ error: "That isn't a public web address." }, { status: 400 });
  const rawCompetitors = Array.isArray(body.competitors) ? body.competitors : [];
  const competitors = rawCompetitors
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 3)
    .map((item) => normalizeUrl(item));
  if (competitors.some((item) => !item)) return Response.json({ error: "One of the competitor addresses isn't a public web address." }, { status: 400 });
  const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 500) : "";
  const brand = typeof body.brandId === "string" ? await loadBrand(body.brandId) : null;
  if (!brand) return Response.json({ error: "Pick a board." }, { status: 404 });
  if (await limited(`campaign:${admin.id}`, 12, 3_600_000)) {
    return Response.json({ error: "That's a lot of campaigns this hour. Wait a while." }, { status: 429 });
  }

  const campaign = await createCampaign({
    brandId: brand.id,
    url: url.toString(),
    goal,
    competitors: competitors.map((item) => item!.toString()),
  });
  await logEvent(admin, "started campaign", brand.clientId, `${url.hostname} on ${brand.name}`);
  // With Inngest, each agent gets its own request (and time limit). Without it (local dev),
  // the whole run happens after this response, inside this route's maxDuration.
  const queued = await enqueue("liftpage/campaign.requested", { campaignId: campaign.id }, campaign.id);
  if (!queued) {
    after(async () => {
      try {
        await runCampaign(campaign.id);
      } catch (error) {
        console.error("campaign run", error);
        await finishCampaign(campaign.id, "failed").catch(() => undefined);
      }
    });
  }
  return Response.json({ campaign }, { status: 202 });
}
