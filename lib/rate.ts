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
  const hops = (list.get("x-forwarded-for") ?? "").split(",").map((hop) => hop.trim()).filter(Boolean);
  // Vercel overwrites x-forwarded-for with the real client, so the first entry is trusted
  // there. Behind any other proxy the first entry is whatever the caller sent; the last is
  // what our own proxy saw, so a forged header can't reset the limits.
  const ip = process.env.VERCEL ? hops[0] : hops.at(-1);
  return ip || list.get("x-real-ip") || "local";
}
