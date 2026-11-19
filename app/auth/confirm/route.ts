import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/dal";
import { authClient, supabaseReady } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/**
 * Lands every email link: invites and resets we send through Resend (token_hash), and
 * Supabase's own emails (token_hash with the SSR template, or a PKCE code).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"), "/account");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  let ok = false;
  const supabase = supabaseReady() ? await authClient() : null;
  if (!supabase) {
    // Falls through to the error redirect.
  } else if (tokenHash && type && TYPES.has(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", "link");
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
