import { KICKER } from "@/lib/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/AuthForms";
import { Header } from "@/components/Header";
import { signupOpen } from "@/lib/accounts";
import { currentUser } from "@/lib/dal";

export const metadata = { title: "Create an account" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/account");

  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-md">
          <p className={`${KICKER} text-accent`}>Client account</p>
          <h1 className="mt-3 display text-5xl md:text-6xl">Track the lift.</h1>
          {signupOpen() ? (
            <>
              <p className="mt-3 text-muted">Your requests and your weekly numbers, in one place.</p>
              <div className="mt-8">
                <SignupForm />
              </div>
            </>
          ) : (
            <p className="mt-6 text-muted">Sign-up is closed. LiftPage sets up accounts for clients.</p>
          )}
          <p className="mt-8 text-sm text-muted">
            Have one?{" "}
            <Link href="/login" className="link">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
