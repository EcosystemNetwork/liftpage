import Link from "next/link";
import { ForgotForm } from "@/components/AuthForms";
import { Header } from "@/components/Header";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-md">
          <p className={`${KICKER} text-tape`}>Reset</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Forgot it.</h1>
          <p className="mt-3 text-mute">We&rsquo;ll email a link that lets you set a new one.</p>
          <div className="mt-8">
            <ForgotForm />
          </div>
          <p className="mt-8 text-sm text-mute">
            <Link href="/login" className="text-tape underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
