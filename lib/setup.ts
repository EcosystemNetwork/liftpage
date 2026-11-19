import "server-only";
import { tokenKeyReady } from "./social/crypto";
import { credentials, PROVIDERS } from "./social/providers";
import { PLATFORM_NAME, PLATFORMS } from "./types";

export type Check = {
  id: string;
  name: string;
  /** on: working. off: optional and not set. broken: set but wrong, or required and missing. */
  state: "on" | "off" | "broken";
  detail: string;
  /** What to set, or where to register a URL. */
  todo?: string[];
};

const has = (name: string) => Boolean(process.env[name]?.trim());
const missing = (names: string[]) => names.filter((name) => !has(name));

/**
 * Every integration, read from the environment. Pure: takes the env and the site URL, so
 * the admin page and the tests read the same answers. The live database probe is separate.
 */
export function envChecks(site: string, production = process.env.NODE_ENV === "production"): Check[] {
  const checks: Check[] = [];

  const supa = missing(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]).filter(
    (name) => !(name === "SUPABASE_SECRET_KEY" && has("SUPABASE_SERVICE_ROLE_KEY")),
  );
  if (!has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") && !has("NEXT_PUBLIC_SUPABASE_ANON_KEY")) supa.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  checks.push({
    id: "supabase",
    name: "Supabase",
    state: supa.length ? "broken" : "on",
    detail: supa.length ? "Required. Accounts, boards, and requests live here." : "Keys set.",
    todo: supa.length
      ? [`Set ${supa.join(", ")}.`, "Run supabase/migrations/*.sql in order."]
      : [`Auth > URL Configuration: site ${site}, redirect ${site}/auth/confirm`],
  });

  checks.push({
    id: "site",
    name: "Site URL",
    state: has("NEXT_PUBLIC_SITE_URL") ? "on" : production ? "broken" : "off",
    detail: has("NEXT_PUBLIC_SITE_URL") ? site : `Not set. Using ${site}.`,
    todo: has("NEXT_PUBLIC_SITE_URL") ? undefined : ["Set NEXT_PUBLIC_SITE_URL. Email links and OAuth redirects are built from it."],
  });

  const ai = has("HARNESSROUTER_API_KEY") || has("TOKENROUTER_API_KEY");
  checks.push({
    id: "ai",
    name: "HarnessRouter",
    state: ai ? "on" : "off",
    detail: ai ? "Cuts use the model." : "Cuts use the local operator.",
    todo: ai ? undefined : ["Set HARNESSROUTER_API_KEY (or TOKENROUTER_API_KEY)."],
  });

  const mail = missing(["RESEND_API_KEY", "EMAIL_FROM"]);
  checks.push({
    id: "email",
    name: "Resend",
    state: mail.length === 2 ? "off" : mail.length ? "broken" : "on",
    detail: mail.length ? "Admins get one-time links to pass on; Supabase sends its own reset email." : `Sending as ${process.env.EMAIL_FROM}.`,
    todo: mail.length ? [`Set ${mail.join(", ")}. Verify the sending domain in Resend.`] : undefined,
  });

  const jobs = has("INNGEST_EVENT_KEY") || has("INNGEST_DEV");
  const jobsBroken = production && has("INNGEST_EVENT_KEY") && !has("INNGEST_SIGNING_KEY");
  checks.push({
    id: "jobs",
    name: "Inngest",
    state: jobsBroken ? "broken" : jobs ? "on" : "off",
    detail: jobsBroken
      ? "The event key is set but the signing key isn't, so Inngest can't call back."
      : jobs
        ? has("INNGEST_DEV")
          ? "Local dev server."
          : "Cloud."
        : "Cued posts wait for Publish now. No daily insight sync.",
    todo: jobs && !jobsBroken ? [`Sync the app in Inngest: ${site}/api/inngest`] : ["Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY, or INNGEST_DEV=1 locally."],
  });

  const pay = has("STRIPE_SECRET_KEY");
  const hook = has("STRIPE_WEBHOOK_SECRET");
  checks.push({
    id: "stripe",
    name: "Stripe",
    state: pay && hook ? "on" : pay ? "broken" : "off",
    detail: pay && hook ? "Deposits on." : pay ? "Checkout works, but nothing marks a request paid." : "No deposit button.",
    todo: pay && hook
      ? [`Webhook: ${site}/api/stripe/webhook`]
      : [
          ...(pay ? [] : ["Set STRIPE_SECRET_KEY."]),
          `Add a webhook to ${site}/api/stripe/webhook for checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, then set STRIPE_WEBHOOK_SECRET.`,
        ],
  });

  checks.push({
    id: "posthog",
    name: "PostHog",
    state: has("NEXT_PUBLIC_POSTHOG_KEY") ? "on" : "off",
    detail: has("NEXT_PUBLIC_POSTHOG_KEY") ? "Pageviews and server events." : "No product analytics.",
    todo: has("NEXT_PUBLIC_POSTHOG_KEY") ? undefined : ["Set NEXT_PUBLIC_POSTHOG_KEY."],
  });

  const sentry = has("NEXT_PUBLIC_SENTRY_DSN") || has("SENTRY_DSN");
  checks.push({
    id: "sentry",
    name: "Sentry",
    state: sentry ? "on" : "off",
    detail: sentry ? (has("SENTRY_AUTH_TOKEN") ? "Errors, with source maps." : "Errors, without source maps.") : "No error reporting.",
    todo: sentry ? undefined : ["Set NEXT_PUBLIC_SENTRY_DSN and SENTRY_DSN."],
  });

  const key = tokenKeyReady();
  const rawKey = has("LIFTPAGE_TOKEN_KEY");
  for (const platform of PLATFORMS) {
    const p = PROVIDERS[platform];
    const creds = credentials(platform);
    const partial = !creds && (has(p.env.id) || has(p.env.secret));
    const keyBroken = Boolean(creds) && !key;
    checks.push({
      id: platform,
      name: PLATFORM_NAME[platform],
      state: partial || keyBroken ? "broken" : creds ? "on" : "off",
      detail: keyBroken
        ? rawKey
          ? "LIFTPAGE_TOKEN_KEY is not 32 bytes of base64."
          : "App keys set, but LIFTPAGE_TOKEN_KEY isn't, so tokens can't be stored."
        : creds
          ? "Ready to connect from a board."
          : partial
            ? "Only half the app keys are set."
            : "Not set up.",
      todo: [
        ...(creds ? [] : [`Set ${p.env.id} and ${p.env.secret}.`]),
        ...(key ? [] : ["Set LIFTPAGE_TOKEN_KEY: openssl rand -base64 32"]),
        `Redirect URI: ${site}/api/social/${platform}/callback`,
      ],
    });
  }
  return checks;
}
