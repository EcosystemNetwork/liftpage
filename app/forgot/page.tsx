import { NO_INDEX } from "@/lib/seo";
import Link from "next/link";
import { ForgotForm } from "@/components/AuthForms";
import { Header } from "@/components/Header";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Reset password", robots: NO_INDEX };

export default function ForgotPage() {
  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-md">
          <p className={`${KICKER} text-accent`}>Reset</p>
          <h1 className="mt-3 display text-5xl md:text-6xl">Forgot it.</h1>
          <p className="mt-3 text-muted">We&rsquo;ll email a link that lets you set a new one.</p>
          <div className="mt-8">
            <ForgotForm />
          </div>
          <p className="mt-8 text-sm text-muted">
            <Link href="/login" className="link">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
