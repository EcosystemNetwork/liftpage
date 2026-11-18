import Link from "next/link";
import { Header } from "@/components/Header";
import { fromMinor, stripe, stripeReady } from "@/lib/stripe";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Paid" };
export const dynamic = "force-dynamic";

/**
 * Where Stripe sends the buyer back. Asks Stripe what happened rather than trusting the
 * URL. The hold itself is marked paid by the webhook, not by this page.
 */
export default async function CheckoutSuccess({ searchParams }: PageProps<"/checkout/success">) {
  const { session_id } = await searchParams;
  let state: "paid" | "pending" | "unknown" = "unknown";
  let amount = 0;
  let product = "";

  if (stripeReady() && typeof session_id === "string" && /^cs_[A-Za-z0-9_]+$/.test(session_id)) {
    try {
      const session = await stripe().checkout.sessions.retrieve(session_id, { expand: ["line_items"] });
      state = session.payment_status === "paid" ? "paid" : session.status === "complete" ? "pending" : "unknown";
      amount = fromMinor(session.amount_total);
      product = session.line_items?.data[0]?.description ?? "";
    } catch {
      state = "unknown";
    }
  }

  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-xl">
          <p className={`${KICKER} text-accent`}>Checkout</p>
          {state === "paid" ? (
            <>
              <h1 className="mt-3 display text-5xl md:text-6xl">Paid. Thank you.</h1>
              <p className="mt-4 text-muted">
                {product ? `${product} · ` : ""}
                <span className="font-mono text-ink">${amount.toLocaleString("en-US")}</span>. A receipt is on its way to your inbox.
                We&rsquo;ll reach out about the first board.
              </p>
            </>
          ) : state === "pending" ? (
            <>
              <h1 className="mt-3 display text-5xl md:text-6xl">Payment is processing.</h1>
              <p className="mt-4 text-muted">Some payment methods take a little while to clear. We&rsquo;ll email you when it does.</p>
            </>
          ) : (
            <>
              <h1 className="mt-3 display text-5xl md:text-6xl">We couldn&rsquo;t confirm that payment.</h1>
              <p className="mt-4 text-muted">If you were charged, the receipt from Stripe is the record. Reply to it and we&rsquo;ll sort it out.</p>
            </>
          )}
          <p className="mt-8 flex flex-wrap gap-4 text-sm">
            <Link href="/account" className="link">
              Your account
            </Link>
            <Link href="/" className="text-muted underline underline-offset-4">
              Home
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
