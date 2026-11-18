import { adminOrResponse } from "@/lib/dal";
import { loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const desk = await loadDesk();
  return Response.json({ desk });
}
