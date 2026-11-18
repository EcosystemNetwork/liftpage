import { cutWeek } from "@/lib/cut";
import { adminOrResponse } from "@/lib/dal";
import { addRun, loadBrand, loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  let body: { brief?: unknown; brandId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send a brief." }, { status: 400 });
  }
  const brand = typeof body.brandId === "string" ? await loadBrand(body.brandId) : null;
  if (!brand) return Response.json({ error: "Pick a board." }, { status: 404 });
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 8) {
    return Response.json({ error: "The brief needs a real note. Eight characters at least." }, { status: 400 });
  }
  if (brief.length > 4000) {
    return Response.json({ error: "Keep the brief under 4,000 characters." }, { status: 400 });
  }
  const cut = await cutWeek(brief, brand);
  await addRun(brand.id, brief, cut);
  return Response.json({ desk: await loadDesk(brand.id) });
}
