import "server-only";
import { currentUser } from "./dal";
import { limited } from "./rate";
import { boardForClient } from "./store";
import { AI_HOURLY, canUse, type ClientTool } from "./tools";
import type { User } from "./types";

/**
 * For AI route handlers. Admins may use any tool on any board. A client may use a tool an
 * admin switched on, and only on their own board (`boardId`). Counts against the hourly cap.
 * Returns a Response to send back when the caller can't go ahead.
 */
export async function aiCaller(tool: ClientTool): Promise<{ user: User; boardId?: string } | Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canUse(user, tool)) return Response.json({ error: "That tool isn't switched on for your account. Ask LiftPage." }, { status: 403 });
  let boardId: string | undefined;
  if (user.role !== "admin") {
    const board = await boardForClient(user.id);
    if (!board) return Response.json({ error: "No board yet. LiftPage opens one when your campaign starts." }, { status: 404 });
    boardId = board.brand.id;
  }
  if (await limited(`ai:${user.id}`, AI_HOURLY[user.role], 3_600_000)) {
    return Response.json({ error: "That's a lot of AI calls this hour. Wait a while." }, { status: 429 });
  }
  return { user, boardId };
}
