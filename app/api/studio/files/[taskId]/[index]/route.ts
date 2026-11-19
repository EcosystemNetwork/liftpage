import { HarnessRouter } from "@/lib/harnessrouter";
import { studioReader, studioRoute } from "@/lib/studio-access";
import { studio } from "@/lib/studio-store";
import { StudioError, extOf, fileKind, outputFiles } from "@/lib/studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const INLINE: Readonly<Record<string, string>> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
};
const TEXT_LIMIT = 512 * 1024;
// Generated files never run as part of the site. PDFs skip the sandbox: browsers won't render
// a PDF in a sandboxed document, and their viewers isolate PDF scripts on their own.
const SANDBOX = "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";

/** One file a task made: inline view (images, PDFs, Office as PDF, text) or ?download=1. Owner only. */
export function GET(request: Request, ctx: RouteContext<"/api/studio/files/[taskId]/[index]">) {
  return studioRoute(async () => {
    const user = await studioReader();
    const { taskId, index } = await ctx.params;
    const task = await studio().owned(user.id, taskId);
    const file = task && /^\d+$/.test(index) ? outputFiles(task)[Number(index)] : undefined;
    if (!task?.sessionId || !file) throw new StudioError(404, "Not found.");
    const hr = new HarnessRouter();
    const name = file.filename.replace(/["\r\n\\]/g, "_");
    const kind = fileKind(file.path);
    const base = { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" };

    if (new URL(request.url).searchParams.get("download")) {
      const { bytes, type } = await hr.fetchFile(task.sessionId, file.id);
      return new Response(Buffer.from(bytes), {
        headers: { ...base, "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Content-Security-Policy": SANDBOX },
      });
    }
    if (kind === "office") {
      const { bytes } = await hr.fetchFile(task.sessionId, file.id, "pdf");
      return new Response(Buffer.from(bytes), {
        headers: { ...base, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name.replace(/\.[^.]+$/, "")}.pdf"` },
      });
    }
    if (kind === "text") {
      if (file.bytes > TEXT_LIMIT) throw new StudioError(413, "This file is too big to preview. Download it instead.");
      const { bytes } = await hr.fetchFile(task.sessionId, file.id);
      return new Response(Buffer.from(bytes), { headers: { ...base, "Content-Type": "text/plain; charset=utf-8", "Content-Security-Policy": SANDBOX } });
    }
    const type = INLINE[extOf(file.path)];
    if (!type) throw new StudioError(404, "Not found.");
    const { bytes } = await hr.fetchFile(task.sessionId, file.id);
    return new Response(Buffer.from(bytes), {
      headers: { ...base, "Content-Type": type, "Content-Disposition": `inline; filename="${name}"`, ...(kind === "pdf" ? {} : { "Content-Security-Policy": SANDBOX }) },
    });
  });
}
