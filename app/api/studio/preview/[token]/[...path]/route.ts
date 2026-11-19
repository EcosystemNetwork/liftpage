import { HarnessRouter, PREVIEW_HEADERS, PREVIEW_TYPES, previewSecret, safeRelPath, verifyPreview } from "@/lib/harnessrouter";
import { extOf } from "@/lib/studio";
import { supabaseStudioStore } from "@/lib/studio-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Generated HTML in a sandbox. A sandboxed frame sends no cookies, so the signed, short-lived
 * token (issued by the owner-checked thread route) is the authorization, for one task only.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/studio/preview/[token]/[...path]">) {
  try {
    const { token, path } = await ctx.params;
    const taskId = verifyPreview(token, previewSecret());
    const task = taskId ? await supabaseStudioStore.get(taskId) : null;
    const rel = safeRelPath(path.map((p) => decodeURIComponent(p)).join("/"));
    const type = rel ? PREVIEW_TYPES[extOf(rel)] : undefined;
    if (!task?.sessionId || !rel || !type) return notFound();
    const hr = new HarnessRouter();
    const file = (await hr.listFiles(task.sessionId)).find((f) => f.path === rel);
    if (!file) return notFound();
    const { bytes } = await hr.fetchFile(task.sessionId, file.id);
    return new Response(Buffer.from(bytes), { headers: { ...PREVIEW_HEADERS, "Content-Type": type } });
  } catch {
    return notFound();
  }
}
