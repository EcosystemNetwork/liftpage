import { cutWeek } from "@/lib/cut";
import { nid } from "@/lib/id";
import { updateDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { brief?: unknown };
  try {
    body = (await request.json()) as { brief?: unknown };
  } catch {
    return Response.json({ error: "Send a brief." }, { status: 400 });
  }
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 8) {
    return Response.json({ error: "The brief needs a real note. Eight characters at least." }, { status: 400 });
  }
  if (brief.length > 4000) {
    return Response.json({ error: "Keep the brief under 4,000 characters." }, { status: 400 });
  }

  const desk = await updateDesk(async (current) => {
    const cut = await cutWeek(brief, current.brand);
    current.posts.push(...cut.posts);
    current.runs.unshift({
      id: nid("run"),
      at: new Date().toISOString(),
      brief,
      via: cut.via,
      note: cut.note,
      postIds: cut.posts.map((post) => post.id),
    });
    current.runs = current.runs.slice(0, 40);
  });

  return Response.json({ desk });
}
