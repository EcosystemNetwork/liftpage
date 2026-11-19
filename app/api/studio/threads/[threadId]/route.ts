import { previewSecret, signPreview } from "@/lib/harnessrouter";
import { readRequest, studioReader, studioRoute, studioSender } from "@/lib/studio-access";
import { studio } from "@/lib/studio-store";
import { StudioError, canContinue, taskView } from "@/lib/studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** One request and its follow-ups. The page polls this while a task runs. */
export function GET(_request: Request, ctx: RouteContext<"/api/studio/threads/[threadId]">) {
  return studioRoute(async () => {
    const user = await studioReader();
    const { threadId } = await ctx.params;
    const turns = await studio().refreshThread(user.id, threadId);
    if (!turns.length) throw new StudioError(404, "Not found.");
    const secret = previewSecret();
    return Response.json({
      threadId,
      turns: turns.map((t) => taskView(t, (id) => signPreview(id, secret))),
      canContinue: canContinue(turns),
    });
  });
}

/** Feedback on the result: continues the same HarnessRouter session. */
export function POST(request: Request, ctx: RouteContext<"/api/studio/threads/[threadId]">) {
  return studioRoute(async () => {
    const user = await studioSender();
    const { threadId } = await ctx.params;
    const { text, uploads } = await readRequest(request);
    const task = await studio().followUp(user.id, threadId, text, uploads);
    const secret = previewSecret();
    return Response.json({ threadId, task: taskView(task, (id) => signPreview(id, secret)) }, { status: 202 });
  });
}
