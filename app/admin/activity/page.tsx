import Link from "next/link";
import { loadAccounts } from "@/lib/accounts";
import { loadEvents } from "@/lib/admin";
import { requireAdmin } from "@/lib/dal";
import { formatStamp } from "@/lib/time";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Activity" };

export default async function ActivityPage() {
  await requireAdmin("/admin/activity");
  const [events, { users }] = await Promise.all([loadEvents({ limit: 300 }), loadAccounts()]);
  const company = new Map(users.map((u) => [u.id, u.company || u.email]));

  return (
    <>
      <section>
        <p className={`${KICKER} text-accent`}>Activity</p>
        <h1 className="mt-3 display text-5xl md:text-6xl">What was done, for whom.</h1>
        <p className="mt-3 text-muted">Every admin action that changes an account, a request, a board, or a client. The latest 300.</p>
      </section>

      <section aria-label="Log">
        {events.length ? (
          <div className="overflow-x-auto panel">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className={`${KICKER} text-muted`}>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-normal">When</th>
                  <th className="px-3 py-2 font-normal">Action</th>
                  <th className="px-3 py-2 font-normal">Client</th>
                  <th className="px-3 py-2 font-normal">Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-line align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">{formatStamp(event.at)}</td>
                    <td className="px-3 py-2 font-mono text-xs uppercase text-accent">{event.action}</td>
                    <td className="px-3 py-2">
                      {event.clientId && company.has(event.clientId) ? (
                        <Link href={`/admin/customers/${event.clientId}`} className="link">
                          {company.get(event.clientId)}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted">{event.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel px-5 py-6 text-muted">Nothing logged yet. Run the admin-tools migration if this stays empty after you act.</p>
        )}
      </section>
    </>
  );
}
