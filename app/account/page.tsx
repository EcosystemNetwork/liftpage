import Link from "next/link";
import { PasswordForm } from "@/components/AuthForms";
import { CustomerStats } from "@/components/CustomerStats";
import { Header } from "@/components/Header";
import { MetricForm } from "@/components/MetricForm";
import { HoldList } from "@/components/HoldList";
import { loadAccounts } from "@/lib/accounts";
import { requireUser } from "@/lib/dal";
import { loadDesk } from "@/lib/store";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const isClient = user.role === "client";
  const [accounts, desk] = await Promise.all([loadAccounts(), loadDesk()]);
  const metrics = accounts.metrics.filter((m) => m.userId === user.id);
  const holds = desk.holds.filter((hold) => hold.userId === user.id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Header />
      <main id="main" className="mx-auto grid max-w-6xl gap-12 px-4 py-10 md:px-8 [&>*]:min-w-0">
        <section>
          <p className={`${KICKER} text-tape`}>{user.company}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{user.name}</h1>
          <p className="mt-2 font-mono text-sm text-mute">{user.email}</p>
          {!isClient ? (
            <p className="mt-4 text-mute">
              Admin account. Client numbers live in{" "}
              <Link href="/admin" className="text-tape underline underline-offset-4">
                Admin
              </Link>
              .
            </p>
          ) : null}
        </section>

        {isClient ? (
          <>
            <section aria-labelledby="numbers">
              <h2 id="numbers" className="mb-4 text-2xl font-semibold">
                Your numbers
              </h2>
              <CustomerStats metrics={metrics} canDelete />
            </section>

            <section aria-labelledby="log" className="max-w-3xl">
              <h2 id="log" className="text-2xl font-semibold">
                Log a week
              </h2>
              <p className="mt-2 mb-4 text-mute">Pull these from each platform&rsquo;s insights. LiftPage reads the same table.</p>
              <MetricForm today={today} />
            </section>

            <section aria-labelledby="requests">
              <h2 id="requests" className="mb-4 text-2xl font-semibold">
                Requests
              </h2>
              {holds.length ? (
                <HoldList holds={holds} />
              ) : (
                <p className="text-mute">
                  None on this account yet.{" "}
                  <Link href="/#start" className="text-tape underline underline-offset-4">
                    Start a campaign
                  </Link>
                </p>
              )}
            </section>
          </>
        ) : null}

        <section aria-labelledby="password" className="max-w-md">
          <h2 id="password" className="mb-4 text-2xl font-semibold">
            Password
          </h2>
          <PasswordForm />
        </section>
      </main>
    </>
  );
}
