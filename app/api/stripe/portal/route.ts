import { currentUser } from "@/lib/dal";
import { planCustomer } from "@/lib/projects";
import { limited } from "@/lib/rate";
import { siteUrl } from "@/lib/site";
import { stripe, stripeReady } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST (form) → 303 to the Stripe customer portal, where a client updates their card,
 * downloads invoices, or cancels. The customer id comes from their plan row, never the
 * browser. What they change there comes back through customer.subscription.* webhooks.
 */
export async function POST() {
  const back = (code?: string) => Response.redirect(new URL(`/account${code ? `?plan=${code}` : ""}#plan`, siteUrl()), 303);
  const me = await currentUser();
  if (!me) return Response.redirect(new URL("/login?next=/account", siteUrl()), 303);
  if (me.role !== "client") return back("not-client");
  if (!stripeReady()) return back("no-payments");
  if (await limited(`portal:${me.id}`, 20, 60 * 60_000)) return back("too-many");

  const customer = await planCustomer(me.id);
  if (!customer) return back("no-billing");

  const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${siteUrl()}/account#plan` });
  return Response.redirect(session.url, 303);
}
