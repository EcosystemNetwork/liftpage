import type Stripe from "stripe";
import { track } from "@/lib/analytics";
import { notifyAddress, sendMail } from "@/lib/email";
import { fromStripeStatus } from "@/lib/plan";
import { planBySubscription, recordSubscription } from "@/lib/projects";
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
        if (session.mode === "subscription") {
          await planStarted(session);
          break;
        }
        holdId = session.metadata?.holdId ?? session.client_reference_id ?? null;
        if (session.payment_status === "paid" && holdId) await markPaid(holdId, fromSession(session));
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Only invoices an admin sent for a request carry a holdId. Plan invoices don't.
        holdId = invoice.metadata?.holdId ?? null;
        if (holdId && invoice.id) await markPaid(holdId, fromInvoice(invoice));
        break;
      }
      case "invoice.payment_failed": {
        await planPaymentFailed(event.data.object as Stripe.Invoice);
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
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const clientId = (await planBySubscription(sub.id)) ?? sub.metadata?.clientId ?? null;
        if (clientId) await recordSubscription(clientId, { status: event.type === "customer.subscription.deleted" ? "canceled" : fromStripeStatus(sub.status) });
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

/** A client finished checkout for their monthly plan. The client id was set by our server. */
async function planStarted(session: Stripe.Checkout.Session) {
  const clientId = session.metadata?.clientId;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!clientId || !subscriptionId) return;
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const found = await recordSubscription(clientId, { status: fromStripeStatus(sub.status), customerId, subscriptionId });
  if (!found) throw new Error(`no plan for client ${clientId} (subscription ${subscriptionId})`);
  await track(clientId, "plan_started", { status: sub.status });
  const to = notifyAddress();
  if (to) {
    await sendMail({
      to,
      subject: `Plan started: ${session.customer_details?.email ?? clientId}`,
      lines: [`A client put a card on file for their monthly plan. Stripe status: ${sub.status}.`],
      action: { label: "Open the customer", url: `${siteUrl()}/admin/customers/${clientId}#plan` },
      idempotencyKey: `plan-started:${session.id}`,
    });
  }
}

/** A client's plan payment failed. Stripe retries on its schedule; the client gets a way to fix the card. */
async function planPaymentFailed(invoice: Stripe.Invoice) {
  const sub = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof sub === "string" ? sub : sub?.id;
  if (!subscriptionId) return; // Request invoices are send_invoice: the client pays when ready.
  const clientId = await planBySubscription(subscriptionId);
  const amount = `$${fromMinor(invoice.amount_due).toLocaleString("en-US")}`;
  const retry = invoice.next_payment_attempt
    ? `Stripe will try again on ${new Date(invoice.next_payment_attempt * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
    : "Stripe won't retry on its own.";
  if (invoice.customer_email) {
    await sendMail({
      to: invoice.customer_email,
      subject: "Your LiftPage payment didn't go through",
      lines: [`We couldn't charge your card ${amount} for your LiftPage plan. ${retry}`, "Update your card from your account to keep things running."],
      action: { label: "Update card", url: `${siteUrl()}/account#plan` },
      idempotencyKey: `plan-failed:${invoice.id}:${invoice.attempt_count}`,
    });
  }
  const to = notifyAddress();
  if (to) {
    await sendMail({
      to,
      subject: `Plan payment failed: ${invoice.customer_email ?? clientId ?? subscriptionId}`,
      lines: [`Attempt ${invoice.attempt_count} for ${amount} failed. ${retry}`],
      action: clientId ? { label: "Open the customer", url: `${siteUrl()}/admin/customers/${clientId}#plan` } : undefined,
      idempotencyKey: `plan-failed-notice:${invoice.id}:${invoice.attempt_count}`,
    });
  }
}

type HoldRow = {
  id: string;
  email: string;
  name: string;
  company: string;
  package_id: PackageId;
  amount: number;
  paid_at: string | null;
  stripe_session_id: string | null;
  stripe_invoice_id: string | null;
};

/** What paid a request: a Checkout session or a Stripe invoice. Amounts in minor units. */
type Payment = {
  /** cs_... or in_...; stored in holds.stripe_session_id as "what paid this". */
  ref: string;
  total: number | null;
  /** Before tax, so a tax-inclusive total isn't mistaken for a price mismatch. */
  subtotal: number | null;
  currency: string | null;
  email: string | null;
  intent: () => Promise<string | undefined>;
};

function fromSession(session: Stripe.Checkout.Session): Payment {
  return {
    ref: session.id,
    total: session.amount_total,
    subtotal: session.amount_subtotal,
    currency: session.currency,
    email: session.customer_details?.email ?? null,
    intent: async () => (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id),
  };
}

function fromInvoice(invoice: Stripe.Invoice): Payment {
  return {
    ref: invoice.id!,
    total: invoice.amount_paid,
    subtotal: invoice.subtotal,
    currency: invoice.currency,
    email: invoice.customer_email,
    intent: async () => {
      const paid = await stripe().invoicePayments.list({ invoice: invoice.id!, status: "paid", limit: 1 });
      const pi = paid.data[0]?.payment.payment_intent;
      return typeof pi === "string" ? pi : pi?.id;
    },
  };
}

async function markPaid(holdId: string, pay: Payment) {
  const paid = fromMinor(pay.total);
  // Only the first payment for a hold wins. paid_at is null exactly once.
  const updated = must(
    await db()
      .from("holds")
      .update({ stripe_session_id: pay.ref, amount_paid: paid, paid_at: new Date().toISOString(), status: "won" })
      .eq("id", holdId)
      .is("paid_at", null)
      .select("id, email, name, company, package_id, amount, paid_at, stripe_session_id, stripe_invoice_id"),
    "mark hold paid",
  ) as HoldRow[];

  if (updated.length === 0) {
    const hold = must(await db().from("holds").select("id, stripe_session_id").eq("id", holdId).maybeSingle(), "load hold") as Pick<HoldRow, "id" | "stripe_session_id"> | null;
    if (!hold) throw new Error(`hold ${holdId} not found for ${pay.ref}`);
    if (hold.stripe_session_id === pay.ref) return; // Same payment, retried. Already done.
    await refundDuplicate(holdId, pay);
    return;
  }

  const hold = updated[0];
  // Checkout paid first while an invoice was out: void it so it can't be paid twice.
  if (hold.stripe_invoice_id && hold.stripe_invoice_id !== pay.ref) {
    const out = await stripe().invoices.retrieve(hold.stripe_invoice_id);
    if (out.status === "open") await stripe().invoices.voidInvoice(hold.stripe_invoice_id);
  }
  // An admin can re-price a request while a checkout page or invoice is already out on the
  // old price. The money is real, so the request still turns won; the owner hears about the gap.
  if (pay.subtotal !== toMinor(hold.amount)) {
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
        idempotencyKey: `amount-mismatch:${pay.ref}`,
      });
    }
  }
  const pack = PACKAGES[hold.package_id]?.name ?? "campaign";
  const buyer = pay.email ?? hold.email;
  await track(hold.id, "payment_completed", { package: hold.package_id, amount: paid, currency: pay.currency ?? "usd" });
  await sendMail({
    to: buyer,
    subject: `Paid: LiftPage ${pack}`,
    lines: [
      `Thanks${hold.name ? `, ${hold.name}` : ""}. We received $${paid.toLocaleString("en-US")} for the ${pack} package for ${hold.company}.`,
      "Stripe sends the card receipt separately. We'll be in touch about the first board.",
    ],
    action: { label: "Open your account", url: `${siteUrl()}/account` },
    idempotencyKey: `receipt:${pay.ref}`,
  });
  const to = notifyAddress();
  if (to) {
    await sendMail({
      to,
      subject: `${hold.company} paid $${paid.toLocaleString("en-US")} (${pack})`,
      lines: [`Request ${hold.id} is marked won.`, `Stripe payment ${pay.ref}.`],
      action: { label: "Open admin", url: `${siteUrl()}/admin` },
      idempotencyKey: `paid-notice:${pay.ref}`,
    });
  }
}

/** A second checkout for a hold that's already paid. Give the money back and say so. */
async function refundDuplicate(holdId: string, pay: Payment) {
  const intent = await pay.intent();
  if (!intent) throw new Error(`duplicate payment on ${holdId} has no payment intent`);
  await stripe().refunds.create(
    { payment_intent: intent, reason: "duplicate", metadata: { holdId } },
    { idempotencyKey: `refund-dup:${pay.ref}` },
  );
  await track(holdId, "payment_duplicate_refunded", { amount: fromMinor(pay.total) });
  const to = notifyAddress();
  if (to) {
    await sendMail({
      to,
      subject: `Refunded a duplicate payment on ${holdId}`,
      lines: [`Request ${holdId} was already paid. Payment ${pay.ref} paid again and was refunded in full.`],
      idempotencyKey: `dup-notice:${pay.ref}`,
    });
  }
}
