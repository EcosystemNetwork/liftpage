import { notFound } from "next/navigation";
import { CustomerStats } from "@/components/CustomerStats";
import { HoldList } from "@/components/HoldList";
import { MetricForm } from "@/components/MetricForm";
import { loadAccounts } from "@/lib/accounts";
import { requireAdmin } from "@/lib/dal";
import { loadDesk } from "@/lib/store";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/customers/${id}`);
  const [accounts, desk] = await Promise.all([loadAccounts(), loadDesk()]);
  const user = accounts.users.find((item) => item.id === id && item.role === "client");
  if (!user) notFound();
  const metrics = accounts.metrics.filter((m) => m.userId === user.id);
  const holds = desk.holds.filter((hold) => hold.userId === user.id);

  return (
    <>
      <section>
        <p className={`${KICKER} text-tape`}>Customer</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{user.company}</h1>
        <p className="mt-2 text-mute">
          {user.name} · <span className="font-mono text-sm">{user.email}</span>
          {user.disabled ? " · switched off" : ""}
        </p>
      </section>

      <section aria-labelledby="numbers">
        <h2 id="numbers" className="mb-4 text-2xl font-semibold">
          Numbers
        </h2>
        <CustomerStats metrics={metrics} canDelete />
      </section>

      <section aria-labelledby="log" className="max-w-3xl">
        <h2 id="log" className="mb-4 text-2xl font-semibold">
          Log a week for {user.company}
        </h2>
        <MetricForm userId={user.id} today={new Date().toISOString().slice(0, 10)} />
      </section>

      <section aria-labelledby="requests">
        <h2 id="requests" className="mb-4 text-2xl font-semibold">
          Requests
        </h2>
        {holds.length ? <HoldList holds={holds} admin /> : <p className="text-mute">None linked.</p>}
      </section>
    </>
  );
}
