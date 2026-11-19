import { currentUser } from "@/lib/dal";
import { clientIp, limited } from "@/lib/rate";
import { siteUrl } from "@/lib/site";
import { PAYABLE, currency, stripe, stripeReady, toMinor } from "@/lib/stripe";
import { db, must } from "@/lib/supabase/server";
import { PACKAGES, type PackageId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST {holdId} → {url} for Stripe Checkout. A plain form post gets a 303 to the same URL.
 *
 * The price always comes from the hold row. A hold id is enough to pay for it (that's how
 * the public request form gets here), but the buyer's email is only prefilled for the
 * client who owns the hold or an admin, so a guessed id can't reveal whose request it is.
 */
export async function POST(request: Request) {
  const form = !(request.headers.get("content-type") ?? "").includes("application/json");
  const fail = (error: string, status: number) =>
    form ? Response.redirect(new URL(`/checkout/cancel?error=${encodeURIComponent(error)}`, siteUrl()), 303) : Response.json({ error }, { status });

  if (!stripeReady()) return fail("Payments aren't switched on yet.", 503);
  if (await limited(`checkout:${await clientIp()}`, 20, 60 * 60_000)) return fail("Too many tries. Wait a while.", 429);

  let holdId = "";
  try {
    if (form) holdId = String((await request.formData()).get("holdId") ?? "");
    else holdId = String(((await request.json()) as { holdId?: unknown }).holdId ?? "");
  } catch {
    return fail("Send the request id.", 400);
  }
  if (!/^hold_[A-Za-z0-9-]{4,40}$/.test(holdId)) return fail("That request id doesn't look right.", 400);

  const hold = must(
    await db().from("holds").select("id, email, company, package_id, amount, status, user_id, paid_at").eq("id", holdId).maybeSingle(),
    "load hold",
  ) as {
    id: string;
    email: string;
    company: string;
    package_id: PackageId;
    amount: number;
    status: string;
    user_id: string | null;
    paid_at: string | null;
  } | null;
  if (!hold) return fail("That request is gone.", 404);
  if (hold.paid_at) return fail("That request is already paid.", 409);
  if (!PAYABLE.has(hold.status)) return fail("That request is closed.", 409);
  if (!Number.isInteger(hold.amount) || hold.amount < 1) return fail("That request has no price.", 409);

  const me = await currentUser();
  const trusted = me && (me.role === "admin" || me.id === hold.user_id);
  const pack = PACKAGES[hold.package_id];
  const base = siteUrl();

  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: hold.id,
      metadata: { holdId: hold.id },
      payment_intent_data: { metadata: { holdId: hold.id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency(),
            unit_amount: toMinor(hold.amount),
            product_data: { name: `LiftPage ${pack?.name ?? "campaign"}`, description: pack?.deliver },
          },
        },
      ],
      ...(trusted ? { customer_email: hold.email } : {}),
      success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/checkout/cancel?hold=${encodeURIComponent(hold.id)}`,
      // Short-lived, so a stale tab can't pay long after the request changed.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    // No idempotency key: two open sessions for one hold are allowed, and the webhook
    // refunds whichever completes second.
  );

  if (!session.url) return fail("Stripe didn't return a checkout page.", 502);
  return form ? Response.redirect(session.url, 303) : Response.json({ url: session.url });
}
