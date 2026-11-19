import { adminOrResponse } from "@/lib/dal";
import { loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  const board = new URL(request.url).searchParams.get("board") ?? undefined;
  return Response.json({ desk: await loadDesk(board) });
}
