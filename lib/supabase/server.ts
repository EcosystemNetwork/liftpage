import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** The publishable (formerly anon) key. Safe in the browser; RLS keeps it out of every table. */
export function publishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function secretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function supabaseReady(): boolean {
  return Boolean(supabaseUrl() && publishableKey() && secretKey());
}

export class NotConfigured extends Error {
  constructor(what: string) {
    super(`${what} is not configured. See .env.example.`);
    this.name = "NotConfigured";
  }
}

/**
 * Auth client bound to the request's cookies: sign in, sign out, read the session.
 * In a Server Component cookies are read-only, so setAll is a no-op there; the proxy
 * refreshes the session cookies before the page renders.
 */
export async function authClient(): Promise<SupabaseClient> {
  const url = supabaseUrl();
  const key = publishableKey();
  if (!url || !key) throw new NotConfigured("Supabase");
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component. The proxy keeps the session fresh.
        }
      },
    },
  });
}

let admin: SupabaseClient | undefined;

/** Service-role client. Bypasses RLS: only call it after lib/dal.ts has checked the caller. */
export function db(): SupabaseClient {
  const url = supabaseUrl();
  const key = secretKey();
  if (!url || !key) throw new NotConfigured("Supabase");
  admin ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}

/** Throws on a PostgREST error, so callers don't silently treat failures as empty. */
export function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}
