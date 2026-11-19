import { parseTrack } from "@/lib/attribution";
import { brandForKey, recordTrack } from "@/lib/attribution-store";
import { clientIp, limited } from "@/lib/rate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * Public, write-only intake for /lp.js on clients' sites. Any origin may call it (the key is
 * public by design and can only add events to one board), no cookies are read or set, and
 * nothing is sent back but a status. Bodies arrive as text/plain JSON from sendBeacon,
 * which skips the CORS preflight.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const MAX_BODY = 4096;

/** Per IP per hour. Visits are cheap; leads and sales are rarer and worth more to fake. */
const LIMITS = { visit: 300, lead: 20, conversion: 30 } as const;

function answer(status: number, error?: string) {
  return error ? Response.json({ error }, { status, headers: CORS }) : new Response(null, { status, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return answer(413, "Too big.");
  const text = (await request.text()).slice(0, MAX_BODY + 1);
  if (text.length > MAX_BODY) return answer(413, "Too big.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return answer(400, "Send JSON.");
  }
  const event = parseTrack(body);
  if ("error" in event) return answer(400, event.error);
  if (await limited(`track:${event.kind}:${await clientIp()}`, LIMITS[event.kind], 3_600_000)) return answer(429, "Slow down.");
  const brandId = await brandForKey(event.key);
  if (!brandId) return answer(400, "Unknown key.");
  try {
    await recordTrack(brandId, event);
  } catch (error) {
    console.error("track", error);
    return answer(500, "Not saved.");
  }
  return answer(204);
}
