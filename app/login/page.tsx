import { KICKER } from "@/lib/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { Header } from "@/components/Header";
import { hasAdminEnv, loadAccounts, signupOpen } from "@/lib/accounts";
import { currentUser, safeNext } from "@/lib/dal";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const user = await currentUser();
  if (user) redirect(safeNext(next, user.role === "admin" ? "/admin" : "/account"));
  const noOwner = !hasAdminEnv() && !(await loadAccounts()).users.some((item) => item.role === "admin");

  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-md">
          <p className={`${KICKER} text-tape`}>Sign in</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your desk.</h1>
          <p className="mt-3 text-mute">Clients see their requests and their numbers. LiftPage runs the board.</p>
          {noOwner ? (
            <p className="mt-6 border border-heat px-3 py-2 text-sm">
              No admin yet. Set <code className="font-mono">LIFTPAGE_ADMIN_EMAIL</code> and{" "}
              <code className="font-mono">LIFTPAGE_ADMIN_PASSWORD</code> in <code className="font-mono">.env.local</code> and
              restart.
            </p>
          ) : null}
          <div className="mt-8">
            <LoginForm next={typeof next === "string" ? safeNext(next, "") || undefined : undefined} />
          </div>
          {signupOpen() ? (
            <p className="mt-8 text-sm text-mute">
              New client?{" "}
              <Link href="/signup" className="text-tape underline underline-offset-4">
                Create an account
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
