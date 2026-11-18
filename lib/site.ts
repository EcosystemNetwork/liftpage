import "server-only";

/**
 * The public origin, for links in emails and OAuth redirects. Taken from config, never
 * from the Host header: a forged Host would otherwise put an attacker's domain in a
 * password-reset email.
 */
export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NODE_ENV === "production") throw new Error("Set NEXT_PUBLIC_SITE_URL in production.");
  return "http://localhost:3070";
}
