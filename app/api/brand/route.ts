import { updateDesk } from "@/lib/store";
import { PLATFORMS, type Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  let body: { voice?: unknown; offers?: unknown; platforms?: unknown };
  try {
    body = (await request.json()) as { voice?: unknown; offers?: unknown; platforms?: unknown };
  } catch {
    return Response.json({ error: "Send the voice card." }, { status: 400 });
  }
  const voice = typeof body.voice === "string" ? body.voice.trim().slice(0, 500) : "";
  const offers = typeof body.offers === "string" ? body.offers.trim().slice(0, 500) : "";
  if (voice.length < 8 || offers.length < 8) {
    return Response.json({ error: "Voice and offer both need a real line." }, { status: 400 });
  }
  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter((item): item is Platform => typeof item === "string" && PLATFORMS.includes(item as Platform))
    : [];

  const desk = await updateDesk((current) => {
    current.brand.voice = voice;
    current.brand.offers = offers;
    if (platforms.length) current.brand.platforms = platforms;
  });

  return Response.json({ desk });
}
