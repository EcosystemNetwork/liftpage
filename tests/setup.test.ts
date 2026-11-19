import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envChecks } from "@/lib/setup";

const ALL = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SITE_URL", "RESEND_API_KEY", "EMAIL_FROM", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY",
  "INNGEST_DEV", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "LIFTPAGE_TOKEN_KEY", "X_CLIENT_ID", "X_CLIENT_SECRET",
  "HARNESSROUTER_API_KEY", "TOKENROUTER_API_KEY", "NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN",
];
function clean() {
  for (const name of ALL) vi.stubEnv(name, "");
}
const state = (id: string, production = false) => envChecks("https://lp.test", production).find((c) => c.id === id)!;

describe("setup checks", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Supabase is required; everything else is off, not broken, in development", () => {
    clean();
    const checks = envChecks("https://lp.test", false);
    expect(checks.filter((c) => c.state === "broken").map((c) => c.id)).toEqual(["supabase"]);
  });

  it("accepts the legacy anon / service-role key names", () => {
    clean();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://p.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "srv");
    expect(state("supabase").state).toBe("on");
  });

  it("flags half-configured services", () => {
    clean();
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("X_CLIENT_ID", "id");
    expect(state("email").state).toBe("broken");
    expect(state("stripe").state).toBe("broken");
    expect(state("x").state).toBe("broken");
  });

  it("network keys without a token key are broken; with one, on", () => {
    clean();
    vi.stubEnv("X_CLIENT_ID", "id");
    vi.stubEnv("X_CLIENT_SECRET", "secret");
    expect(state("x").state).toBe("broken");
    vi.stubEnv("LIFTPAGE_TOKEN_KEY", randomBytes(32).toString("base64"));
    expect(state("x").state).toBe("on");
    expect(state("x").todo).toContain("Redirect URI: https://lp.test/api/social/x/callback");
  });

  it("production wants the site URL and the Inngest signing key", () => {
    clean();
    vi.stubEnv("INNGEST_EVENT_KEY", "evt");
    expect(state("site", true).state).toBe("broken");
    expect(state("jobs", true).state).toBe("broken");
    expect(state("jobs", false).state).toBe("on");
  });

  it("never echoes a secret", () => {
    clean();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_SUPERSECRET");
    vi.stubEnv("RESEND_API_KEY", "re_SUPERSECRET");
    expect(JSON.stringify(envChecks("https://lp.test"))).not.toContain("SUPERSECRET");
  });
});
