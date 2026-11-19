import { currentUser } from "@/lib/dal";
import { canSubscribe, stripeTrialEnd, type PlanNotice } from "@/lib/plan";
import { loadPlan, planCustomer } from "@/lib/projects";
import { limited } from "@/lib/rate";
import { siteUrl } from "@/lib/site";
import { currency, customerFor, stripe, stripeReady, taxOn, toMinor } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST (form) → 303 to Stripe Checkout for the signed-in client's monthly plan.
 *
 * Price and free month come from the plan row the admin set, never the browser. A free
 * month passes through as the subscription's trial_end, so the card goes on file now and
 * the first charge lands the day the free month ends. A locked price is just the price;
 * Stripe keeps billing it until someone changes the subscription.
 */
export async function POST() {
  const fail = (code: PlanNotice) => Response.redirect(new URL(`/account?plan=${code}#plan`, siteUrl()), 303);
  const me = await currentUser();
  if (!me) return Response.redirect(new URL("/login?next=/account", siteUrl()), 303);
  if (me.role !== "client") return fail("not-client");
  if (!stripeReady()) return fail("no-payments");
  if (await limited(`subscribe:${me.id}`, 10, 60 * 60_000)) return fail("too-many");

  const plan = await loadPlan(me.id);
  if (!plan || !canSubscribe(plan)) return fail("no-plan");

  const trialEnd = stripeTrialEnd(plan);
  const base = siteUrl();
  // Reuse the client's Stripe customer (from an earlier plan or an invoice) so their
  // billing history stays in one place instead of a new customer per checkout.
  const customer = await customerFor(me.email, { known: await planCustomer(me.id), clientId: me.id });
  const tax = taxOn();
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    metadata: { clientId: me.id, kind: "plan" },
    subscription_data: {
      metadata: { clientId: me.id },
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency(),
          unit_amount: toMinor(plan.monthly),
          recurring: { interval: "month" },
          ...(tax ? { tax_behavior: "exclusive" as const } : {}),
          product_data: { name: `LiftPage ${plan.name}` },
        },
      },
    ],
    customer,
    ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const, name: "auto" as const } } : {}),
    success_url: `${base}/account?plan=started#plan`,
    cancel_url: `${base}/account#plan`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  });

  if (!session.url) return fail("stripe-failed");
  return Response.redirect(session.url, 303);
}
