import { studioReader, studioRoute } from "@/lib/studio-access";
import { studio } from "@/lib/studio-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(_request: Request, ctx: RouteContext<"/api/studio/tasks/[taskId]/cancel">) {
  return studioRoute(async () => {
    const user = await studioReader();
    const { taskId } = await ctx.params;
    const task = await studio().cancel(user.id, taskId);
    return Response.json({ status: task.status });
  });
}
