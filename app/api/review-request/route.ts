import { adminOrResponse } from "@/lib/dal";
import { mailReadyForReview } from "@/lib/review-mail";
import { loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Desk → client: "these drafts are ready for you". */
export async function POST(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const { brandId } = (await request.json().catch(() => ({}))) as { brandId?: unknown };
  if (typeof brandId !== "string") return Response.json({ error: "Pick a board." }, { status: 400 });
  const desk = await loadDesk(brandId);
  if (desk.brand.id !== brandId || !desk.brand.clientId) {
    return Response.json({ error: "Only client boards have someone to ask." }, { status: 400 });
  }
  const drafts = desk.posts.filter((post) => post.status === "draft" && post.publishState !== "published").length;
  if (!drafts) return Response.json({ error: "No drafts waiting. Cut or move a line back to draft first." }, { status: 409 });
  const outcome = await mailReadyForReview(brandId, drafts);
  const notice = {
    sent: `Emailed the client: ${drafts} draft${drafts === 1 ? "" : "s"} ready.`,
    throttled: "Already asked in the last ten minutes.",
    "no-client": "That client account is gone or switched off.",
    "no-email": "Email isn't set up. Tell the client their board is ready at /account.",
  }[outcome];
  if (outcome === "no-client") return Response.json({ desk, error: notice }, { status: 409 });
  return Response.json({ desk, notice });
}
