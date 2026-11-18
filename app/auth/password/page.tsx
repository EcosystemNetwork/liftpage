import { SetPasswordForm } from "@/components/AuthForms";
import { Header } from "@/components/Header";
import { requireUser } from "@/lib/dal";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Set your password" };

export default async function SetPasswordPage() {
  const user = await requireUser("/auth/password");
  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-md">
          <p className={`${KICKER} text-tape`}>{user.email}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Set your password.</h1>
          <p className="mt-3 text-mute">You&rsquo;ll sign in with it from now on. Other devices get signed out.</p>
          <div className="mt-8">
            <SetPasswordForm />
          </div>
        </div>
      </main>
    </>
  );
}
