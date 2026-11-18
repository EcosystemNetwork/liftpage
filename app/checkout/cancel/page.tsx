import Link from "next/link";
import { Header } from "@/components/Header";
import { PayButton } from "@/components/PayButton";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Checkout cancelled" };

export default async function CheckoutCancel({ searchParams }: PageProps<"/checkout/cancel">) {
  const { hold, error } = await searchParams;
  const holdId = typeof hold === "string" && /^hold_[A-Za-z0-9-]{4,40}$/.test(hold) ? hold : null;
  const message = typeof error === "string" ? error.slice(0, 160) : null;

  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-xl">
          <p className={`${KICKER} text-tape`}>Checkout</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{message ? "That didn't go through." : "No charge made."}</h1>
          <p className="mt-4 text-mute">{message ?? "You left checkout before paying. Your request is still on our desk."}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {holdId ? <PayButton holdId={holdId} label="Try again" /> : null}
            <Link href="/" className="text-sm text-mute underline underline-offset-4">
              Home
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
