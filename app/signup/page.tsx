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
          <p className={`${KICKER} text-tape`}>Client account</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Track the lift.</h1>
          {signupOpen() ? (
            <>
              <p className="mt-3 text-mute">Your requests and your weekly numbers, in one place.</p>
              <div className="mt-8">
                <SignupForm />
              </div>
            </>
          ) : (
            <p className="mt-6 text-mute">Sign-up is closed. LiftPage sets up accounts for clients.</p>
          )}
          <p className="mt-8 text-sm text-mute">
            Have one?{" "}
            <Link href="/login" className="text-tape underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
