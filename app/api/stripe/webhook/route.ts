import type Stripe from "stripe";
import { track } from "@/lib/analytics";
import { notifyAddress, sendMail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
import { fromMinor, stripe, toMinor, webhookReady } from "@/lib/stripe";
import { db, must } from "@/lib/supabase/server";
import { PACKAGES, type PackageId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe → LiftPage. Verified against STRIPE_WEBHOOK_SECRET on the raw body.
 * 2xx means "handled, don't retry". Anything we failed to do returns 500 so Stripe retries;
 * every step is safe to repeat.
 */
export async function POST(request: Request) {
  if (!webhookReady()) return new Response("Payments aren't configured.", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature.", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }

  const seen = must(await db().from("stripe_events").select("id").eq("id", event.id).maybeSingle(), "check event");
  if (seen) return Response.json({ received: true, duplicate: true });

  let holdId: string | null = null;
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        holdId = session.metadata?.holdId ?? session.client_reference_id ?? null;
        if (session.payment_status === "paid" && holdId) await markPaid(holdId, session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        holdId = session.metadata?.holdId ?? null;
        const to = notifyAddress();
        if (to && holdId) {
          await sendMail({
            to,
            subject: `Payment failed for ${holdId}`,
            lines: [`A delayed payment for request ${holdId} failed. Nothing was charged.`],
            action: { label: "Open admin", url: `${siteUrl()}/admin` },
            idempotencyKey: `pay-failed:${session.id}`,
          });
        }
        break;
      }
      default:
        // Not subscribed on purpose, or new. Acknowledge so Stripe stops sending it.
        break;
    }
  } catch (error) {
    console.error("stripe webhook", event.type, event.id, error);
    return new Response("Handler failed; retry.", { status: 500 });
  }

  // Remember it last: a crash above means Stripe retries and we try again.
  const { error } = await db().from("stripe_events").insert({ id: event.id, type: event.type, hold_id: holdId });
  // 23505: a parallel delivery of the same event got there first. Every step above is safe
  // to repeat, so a failed write asks Stripe to retry rather than going unnoticed.
  if (error && error.code !== "23505") {
    console.error("stripe webhook record", event.id, error.message);
    return new Response("Couldn't record the event; retry.", { status: 500 });
  }
  return Response.json({ received: true });
}

type HoldRow = { id: string; email: string; name: string; company: string; package_id: PackageId; amount: number; paid_at: string | null; stripe_session_id: string | null };

async function markPaid(holdId: string, session: Stripe.Checkout.Session) {
  const paid = fromMinor(session.amount_total);
  // Only the first completed session for a hold wins. paid_at is null exactly once.
  const updated = must(
    await db()
      .from("holds")
      .update({ stripe_session_id: session.id, amount_paid: paid, paid_at: new Date().toISOString(), status: "won" })
      .eq("id", holdId)
      .is("paid_at", null)
      .select("id, email, name, company, package_id, amount, paid_at, stripe_session_id"),
    "mark hold paid",
  ) as HoldRow[];

  if (updated.length === 0) {
    const hold = must(await db().from("holds").select("id, stripe_session_id").eq("id", holdId).maybeSingle(), "load hold") as Pick<HoldRow, "id" | "stripe_session_id"> | null;
    if (!hold) throw new Error(`hold ${holdId} not found for session ${session.id}`);
    if (hold.stripe_session_id === session.id) return; // Same session, retried. Already done.
    await refundDuplicate(holdId, session);
    return;
  }

  const hold = updated[0];
  // An admin can re-price a request while a checkout page is already open on the old price.
  // The money is real, so the request still turns won; the owner hears about the gap.
  if (session.amount_total !== toMinor(hold.amount)) {
    await track(hold.id, "payment_amount_mismatch", { paid, price: hold.amount });
    const to = notifyAddress();
    if (to) {
      await sendMail({
        to,
        subject: `${hold.company} paid $${paid.toLocaleString("en-US")}, but the price is $${hold.amount.toLocaleString("en-US")}`,
        lines: [
          `Request ${hold.id} was re-priced while a checkout page was open on the old price.`,
          "It is marked won at what they paid. Settle the difference by hand, or refund in Stripe.",
        ],
        action: { label: "Open admin", url: `${siteUrl()}/admin` },
        idempotencyKey: `amount-mismatch:${session.id}`,
      });
    }
  }
  const pack = PACKAGES[hold.package_id]?.name ?? "campaign";
  const buyer = session.customer_details?.email ?? hold.email;
  await track(hold.id, "payment_completed", { package: hold.package_id, amount: paid, currency: session.currency ?? "usd" });
  await sendMail({
    to: buyer,
    subject: `Paid: LiftPage ${pack}`,
    lines: [
      `Thanks${hold.name ? `, ${hold.name}` : ""}. We received $${paid.toLocaleString("en-US")} for the ${pack} package for ${hold.company}.`,
      "Stripe sends the card receipt separately. We'll be in touch about the first board.",
    ],
    action: { label: "Open your account", url: `${siteUrl()}/account` },
    idempotencyKey: `receipt:${session.id}`,
  });
  const to = notifyAddress();
  if (to) {
    await sendMail({
      to,
      subject: `${hold.company} paid $${paid.toLocaleString("en-US")} (${pack})`,
      lines: [`Request ${hold.id} is marked won.`, `Stripe session ${session.id}.`],
      action: { label: "Open admin", url: `${siteUrl()}/admin` },
      idempotencyKey: `paid-notice:${session.id}`,
    });
  }
}

/** A second checkout for a hold that's already paid. Give the money back and say so. */
async function refundDuplicate(holdId: string, session: Stripe.Checkout.Session) {
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intent) throw new Error(`duplicate payment on ${holdId} has no payment intent`);
  await stripe().refunds.create(
    { payment_intent: intent, reason: "duplicate", metadata: { holdId } },
    { idempotencyKey: `refund-dup:${session.id}` },
  );
  await track(holdId, "payment_duplicate_refunded", { amount: fromMinor(session.amount_total) });
  const to = notifyAddress();
  if (to) {
    await sendMail({
      to,
      subject: `Refunded a duplicate payment on ${holdId}`,
      lines: [`Request ${holdId} was already paid. Session ${session.id} paid again and was refunded in full.`],
      idempotencyKey: `dup-notice:${session.id}`,
    });
  }
}
