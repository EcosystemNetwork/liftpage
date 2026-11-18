import { loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const desk = await loadDesk();
  return Response.json({ desk });
}
