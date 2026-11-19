import { FORMATS, type FormatId } from "./formats";
import type { User } from "./types";

/*
 * The AI tools a client can be given. Admins always have all of them; a client has the ones
 * an admin switched on, and only on their own board. Everything a client makes is a draft.
 */

export type ClientTool = "week" | "redraft" | FormatId;

export const CLIENT_TOOLS: { id: ClientTool; label: string; hint: string }[] = [
  { id: "week", label: "Draft a week of posts", hint: "Writes drafts onto their board from a brief. LiftPage still approves and schedules." },
  { id: "redraft", label: "Redraft a post", hint: "Rewrites one of their draft posts from their own note." },
  ...(Object.entries(FORMATS) as [FormatId, (typeof FORMATS)[FormatId]][]).map(([id, f]) => ({ id, label: f.label, hint: `Writer: ${f.service}.` })),
];

const IDS = new Set<string>(CLIENT_TOOLS.map((t) => t.id));

export function isClientTool(value: unknown): value is ClientTool {
  return typeof value === "string" && IDS.has(value);
}

/** Only known ids, each once, in the list's order. */
export function cleanTools(values: unknown): ClientTool[] {
  if (!Array.isArray(values)) return [];
  const picked = new Set(values.filter(isClientTool));
  return CLIENT_TOOLS.map((t) => t.id).filter((id) => picked.has(id));
}

export function canUse(user: Pick<User, "role" | "disabled" | "tools">, tool: ClientTool): boolean {
  if (user.disabled) return false;
  return user.role === "admin" || user.tools.includes(tool);
}

/** AI calls per hour, shared across every tool. */
export const AI_HOURLY = { admin: 40, client: 15 } as const;
