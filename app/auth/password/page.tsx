import { NO_INDEX } from "@/lib/seo";
import { SetPasswordForm } from "@/components/AuthForms";
import { Header } from "@/components/Header";
import { requireUser } from "@/lib/dal";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Set your password", robots: NO_INDEX };

export default async function SetPasswordPage() {
  const user = await requireUser("/auth/password");
  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-md">
          <p className={`${KICKER} text-accent`}>{user.email}</p>
          <h1 className="mt-3 display text-5xl md:text-6xl">Set your password.</h1>
          <p className="mt-3 text-muted">You&rsquo;ll sign in with it from now on. Other devices get signed out.</p>
          <div className="mt-8">
            <SetPasswordForm />
          </div>
        </div>
      </main>
    </>
  );
}
