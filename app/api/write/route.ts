import { aiCaller } from "@/lib/access";
import { logEvent } from "@/lib/admin";
import { loadBrand } from "@/lib/store";
import { FORMATS, isFormat, writePiece } from "@/lib/write";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Campaign and long-form copy for one board. Returns text only; nothing is stored or sent.
 * Admins write for any board; a client with the format switched on writes for their own.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { brandId?: unknown; format?: unknown; brief?: unknown };
  if (!isFormat(body.format)) return Response.json({ error: "Pick what to write." }, { status: 400 });
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 8) return Response.json({ error: "The brief needs a real note. Eight characters at least." }, { status: 400 });
  if (brief.length > 6000) return Response.json({ error: "Keep the brief under 6,000 characters." }, { status: 400 });
  const caller = await aiCaller(body.format);
  if (caller instanceof Response) return caller;
  const brandId = caller.boardId ?? (typeof body.brandId === "string" ? body.brandId : "");
  const brand = brandId ? await loadBrand(brandId) : null;
  if (!brand) return Response.json({ error: "Pick a board." }, { status: 404 });
  const result = await writePiece(body.format, brand, brief);
  if ("error" in result) return Response.json({ error: result.error }, { status: 502 });
  if (caller.boardId) await logEvent(caller.user, "client wrote", caller.user.id, FORMATS[body.format].label);
  return Response.json(result);
}
