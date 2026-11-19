import { previewSecret, signPreview } from "@/lib/harnessrouter";
import { logEvent } from "@/lib/admin";
import { readRequest, studioReader, studioRoute, studioSender } from "@/lib/studio-access";
import { studio, supabaseStudioStore } from "@/lib/studio-store";
import { taskView, threadSummary } from "@/lib/studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** The signed-in person's studio requests, newest activity first. */
export function GET() {
  return studioRoute(async () => {
    const user = await studioReader();
    const service = studio();
    const threads = await supabaseStudioStore.threads(user.id, 50);
    // Settle unfinished ones, so statuses are current even for threads they haven't opened.
    const fresh = await Promise.all(threads.map(async (turns) => [...turns.slice(0, -1), await service.refresh(turns.at(-1)!)]));
    return Response.json({ threads: fresh.map(threadSummary) });
  });
}

/** A new request: one HarnessRouter task on the studio Harness. Returns once it is accepted. */
export function POST(request: Request) {
  return studioRoute(async () => {
    const user = await studioSender();
    const { text, uploads } = await readRequest(request);
    const task = await studio().start(user.id, text, uploads);
    if (user.role === "client") await logEvent(user, "studio request", user.id, text.slice(0, 120)).catch(() => undefined);
    const secret = previewSecret();
    return Response.json({ threadId: task.threadId, task: taskView(task, (id) => signPreview(id, secret)) }, { status: 202 });
  });
}
