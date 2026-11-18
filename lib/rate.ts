import "server-only";
import { db, supabaseReady } from "./supabase/server";

/**
 * Fixed-window limiter kept in Postgres, so it holds across every server instance.
 * Fails open: a database hiccup shouldn't lock everyone out of signing in.
 */
export async function limited(key: string, max: number, windowMs: number): Promise<boolean> {
  if (!supabaseReady()) return false;
  const { data, error } = await db().rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_ms: windowMs });
  if (error) {
    console.error("rate limit", error.message);
    return false;
  }
  return data === true;
}

export async function clearLimit(key: string) {
  if (!supabaseReady()) return;
  await db().from("rate_limits").delete().eq("key", key);
}

export async function clientIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "local";
}
