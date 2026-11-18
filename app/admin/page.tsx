import Link from "next/link";
import { Tile } from "@/components/CustomerStats";
import { HoldList } from "@/components/HoldList";
import { loadAccounts } from "@/lib/accounts";
import { requireAdmin } from "@/lib/dal";
import { unreadForAdmins } from "@/lib/messages";
import { envChecks } from "@/lib/setup";
import { siteUrl } from "@/lib/site";
import { bookStats, change, fmt } from "@/lib/stats";
import { loadDesk } from "@/lib/store";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Admin" };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default async function AdminPage() {
  await requireAdmin("/admin");
  const [accounts, desk, unread] = await Promise.all([loadAccounts(), loadDesk(), unreadForAdmins()]);
  const broken = envChecks(siteUrl()).filter((check) => check.state === "broken");
  const { clients, active, byStatus, pipeline, closed, recent, board, customers } = bookStats(accounts, desk);

  return (
    <>
      <section>
        <p className={`${KICKER} text-tape`}>Admin</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">The whole book.</h1>
        {unread ? (
          <p role="status" className="mt-4 border border-tape px-3 py-2 text-sm">
            {unread} unread client message{unread === 1 ? "" : "s"}.{" "}
            <Link href="/admin/messages" className="text-tape underline underline-offset-4">
              Open Messages
            </Link>
          </p>
        ) : null}
        {broken.length ? (
          <p role="status" className="mt-4 border border-heat px-3 py-2 text-sm">
            {broken.map((check) => check.name).join(", ")} {broken.length === 1 ? "needs" : "need"} fixing.{" "}
            <Link href="/admin/setup" className="text-tape underline underline-offset-4">
              Open Setup
            </Link>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="totals" className="grid gap-3">
        <h2 id="totals" className="sr-only">
          Totals
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Clients" value={fmt.whole(clients.length)} note={`${active} signed in this week`} />
          <Tile label="Open pipeline" value={fmt.money(pipeline)} note={plural(byStatus.requested.count + byStatus.contacted.count, "open request")} />
          <Tile
            label="Won"
            value={fmt.money(byStatus.won.amount)}
            note={closed ? `${fmt.pct(byStatus.won.count / closed, 0)} of closed requests` : "nothing closed yet"}
          />
          <Tile label="Requests, 30 days" value={fmt.whole(recent)} note={`${desk.holds.length} all time`} />
        </div>
        <p className="font-mono text-xs text-mute">
          Board: {board.draft} draft · {board.approved} approved · {board.cued} cued · {desk.runs.length} runs.{" "}
          <Link href="/desk" className="text-tape underline underline-offset-4">
            Open the desk
          </Link>
        </p>
      </section>

      <section aria-labelledby="customers">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="customers" className="text-2xl font-semibold">
            Customers
          </h2>
          <Link href="/admin/users" className={`${KICKER} text-tape`}>
            Add a client
          </Link>
        </div>
        {customers.length === 0 ? (
          <p className="border border-line px-4 py-6 text-mute">No client accounts yet. Make one from a request below, or under Users.</p>
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className={`${KICKER} text-mute`}>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-normal">Client</th>
                  <th className="px-3 py-2 font-normal">Latest week</th>
                  <th className="px-3 py-2 text-right font-normal">Impressions</th>
                  <th className="px-3 py-2 text-right font-normal">Change</th>
                  <th className="px-3 py-2 text-right font-normal">Followers</th>
                  <th className="px-3 py-2 text-right font-normal">Eng. rate</th>
                  <th className="px-3 py-2 text-right font-normal">Leads</th>
                  <th className="px-3 py-2 font-normal">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(({ user, s }) => {
                  const delta = change(s.latest?.impressions, s.previous?.impressions);
                  return (
                    <tr key={user.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/admin/customers/${user.id}`} className="text-tape underline underline-offset-4">
                          {user.company}
                        </Link>
                        <span className="block text-mute">
                          {user.name}
                          {user.disabled ? " · off" : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-mute">{s.latest ? fmt.week(s.latest.week) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{s.latest ? fmt.compact(s.latest.impressions) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-mute">{delta === null ? "—" : fmt.delta(delta)}</td>
                      <td className="px-3 py-2 text-right font-mono">{s.latest ? fmt.compact(s.latest.followers) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{s.rate === null ? "—" : fmt.pct(s.rate)}</td>
                      <td className="px-3 py-2 text-right font-mono">{s.latest ? fmt.whole(s.latest.leads) : "—"}</td>
                      <td className="px-3 py-2 font-mono text-mute">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "never"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="requests">
        <h2 id="requests" className="mb-1 text-2xl font-semibold">
          Requests
        </h2>
        <p className="mb-4 text-sm text-mute">From the pilot form on the home page. Nothing is charged.</p>
        {desk.holds.length ? <HoldList holds={desk.holds} admin /> : <p className="text-mute">No requests yet.</p>}
      </section>
    </>
  );
}
