import Link from "next/link";
import { rotateKey, saveLead } from "@/app/actions/growth";
import { formatMoney, LEAD_STATUSES, rates, revenue, type Funnel } from "@/lib/attribution";
import { boardReport, listLeads, trackKeyFor } from "@/lib/attribution-store";
import { requireAdmin } from "@/lib/dal";
import { siteUrl } from "@/lib/site";
import { listBoards } from "@/lib/store";
import { formatStamp } from "@/lib/time";
import { PLATFORM_NAME } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { usageLabel } from "@/lib/usage-format";

export const metadata = { title: "Growth" };

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

function FunnelRow({ funnel }: { funnel: Funnel }) {
  const r = rates(funnel);
  return (
    <>
      <td className="px-3 py-2 tabular-nums">{funnel.visits}</td>
      <td className="px-3 py-2 tabular-nums">
        {funnel.leads} <span className="text-muted">{pct(r.visitToLead)}</span>
      </td>
      <td className="px-3 py-2 tabular-nums">
        {funnel.conversions + funnel.wonDeals} <span className="text-muted">{pct(r.leadToSale)}</span>
      </td>
      <td className="px-3 py-2 tabular-nums">{formatMoney(revenue(funnel))}</td>
    </>
  );
}

const HEAD = (
  <>
    <th className="px-3 py-2 font-normal">Visits</th>
    <th className="px-3 py-2 font-normal">Leads</th>
    <th className="px-3 py-2 font-normal">Sales</th>
    <th className="px-3 py-2 font-normal">Revenue</th>
  </>
);

export default async function GrowthPage({ searchParams }: PageProps<"/admin/growth">) {
  await requireAdmin("/admin/growth");
  const boards = await listBoards();
  const asked = (await searchParams).board;
  const board = boards.find((b) => b.id === asked) ?? boards[0];
  if (!board) return <p className="panel px-5 py-6 text-muted">No boards yet.</p>;
  const [report, leads, key] = await Promise.all([boardReport(board.id), listLeads(board.id), trackKeyFor(board.id)]);
  const snippet = key ? `<script src="${siteUrl()}/lp.js" data-key="${key}" async></script>` : "";

  return (
    <>
      <section>
        <p className={`${KICKER} text-accent`}>Growth</p>
        <h1 className="mt-3 display text-5xl md:text-6xl">From post to revenue.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Visits from tagged links, the leads they became, and the sales that followed, per campaign and per post. Credit goes to the last LiftPage link a
          visitor came through, within 30 days. Revenue is what the client&apos;s site reports plus deals marked won below.
        </p>
        <nav aria-label="Boards" className="mt-5 flex flex-wrap gap-2">
          {boards.map((b) => (
            <Link
              key={b.id}
              href={`/admin/growth?board=${encodeURIComponent(b.id)}`}
              aria-current={b.id === board.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${b.id === board.id ? "border-ink bg-ink text-canvas" : "border-line text-muted hover:text-ink"}`}
            >
              {b.company ? `${b.company} · ${b.name}` : b.name}
            </Link>
          ))}
        </nav>
      </section>

      <section aria-labelledby="install" className="panel px-5 py-5">
        <h2 id="install" className="font-semibold">
          Tracking on {board.name}&apos;s site
        </h2>
        {key ? (
          <>
            <p className="mt-2 text-sm text-muted">Paste once before &lt;/body&gt;. Then call these where the site knows a sign-up or sale happened:</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-sunken p-3 text-xs">{`${snippet}

window.liftpage.lead({ email, name, company })
window.liftpage.convert({ value: 49.99, currency: "usd", orderId, email })`}</pre>
            <p className="mt-2 text-sm text-muted">No cookies, no visitor ids. The key can only add events to this board, so it&apos;s safe in page source.</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">No key yet. Make one to get the snippet.</p>
        )}
        <form action={rotateKey} className="mt-3">
          <input type="hidden" name="brandId" value={board.id} />
          <button type="submit" className="btn-ghost text-sm">
            {key ? "Replace key (old snippet stops counting)" : "Make a tracking key"}
          </button>
        </form>
      </section>

      <section aria-labelledby="campaigns">
        <h2 id="campaigns" className="font-semibold">
          Campaigns
        </h2>
        {report.campaigns.length ? (
          <div className="mt-3 grid gap-4">
            {report.campaigns.map((item) => (
              <article key={item.tag} className="panel overflow-x-auto px-4 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {item.campaign ? item.campaign.url : "Campaign not on this board"} <code className="text-xs text-muted">{item.tag}</code>
                  </p>
                  {item.campaign ? (
                    <p className="eyebrow text-muted">
                      {formatStamp(item.campaign.createdAt)} · AI {usageLabel(item.campaign.usage)}
                    </p>
                  ) : null}
                </div>
                <table className="mt-3 w-full min-w-[40rem] text-sm">
                  <thead className={`${KICKER} text-muted`}>
                    <tr className="border-b border-line text-left">
                      <th className="px-3 py-2 font-normal">Post</th>
                      {HEAD}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-line font-medium">
                      <td className="px-3 py-2">Whole campaign</td>
                      <FunnelRow funnel={item.funnel} />
                    </tr>
                    {item.posts.map((post) => (
                      <tr key={post.content || "none"} className="border-b border-line align-top last:border-0">
                        <td className="px-3 py-2">
                          {post.platform ? <span className="eyebrow text-muted">{PLATFORM_NAME[post.platform]} · day {post.day} </span> : null}
                          {post.hook ?? <code className="text-xs text-muted">{post.content || "no utm_content"}</code>}
                        </td>
                        <FunnelRow funnel={post.funnel} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 panel px-5 py-6 text-muted">No campaigns on this board yet.</p>
        )}
        {report.unattributed.leads || report.unattributed.conversions ? (
          <p className="mt-3 text-sm text-muted">
            Not from a LiftPage link: {report.unattributed.leads} leads, {report.unattributed.conversions} sales, {formatMoney(revenue(report.unattributed))}.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="leads">
        <h2 id="leads" className="font-semibold">
          Leads
        </h2>
        {leads.length ? (
          <div className="mt-3 overflow-x-auto panel">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className={`${KICKER} text-muted`}>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-normal">Lead</th>
                  <th className="px-3 py-2 font-normal">Came from</th>
                  <th className="px-3 py-2 font-normal">Status, deal value, notes</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-line align-top last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium">{lead.name || lead.email}</p>
                      <p className="text-muted">
                        {lead.name ? lead.email : ""}
                        {lead.company ? ` · ${lead.company}` : ""}
                      </p>
                      <p className="font-mono text-xs text-muted">{formatStamp(lead.createdAt)}</p>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {lead.touch.campaign ? (
                        <>
                          {lead.touch.source || "?"} / {lead.touch.content || "?"}
                          <code className="block text-xs">{lead.touch.campaign}</code>
                        </>
                      ) : (
                        "Not a LiftPage link"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <form action={saveLead} className="flex flex-wrap items-start gap-2">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <label className="sr-only" htmlFor={`status-${lead.id}`}>
                          Status
                        </label>
                        <select id={`status-${lead.id}`} name="status" defaultValue={lead.status} className="field w-32">
                          {LEAD_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <label className="sr-only" htmlFor={`value-${lead.id}`}>
                          Deal value ({lead.currency.toUpperCase()})
                        </label>
                        <input
                          id={`value-${lead.id}`}
                          name="value"
                          inputMode="decimal"
                          placeholder={`Value, ${lead.currency.toUpperCase()}`}
                          defaultValue={lead.valueCents === undefined ? "" : (lead.valueCents / 100).toString()}
                          className="field w-32"
                        />
                        <label className="sr-only" htmlFor={`notes-${lead.id}`}>
                          Notes
                        </label>
                        <input id={`notes-${lead.id}`} name="notes" defaultValue={lead.notes} placeholder="Notes" className="field min-w-0 flex-1" />
                        <button type="submit" className="btn-ghost text-sm">
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 panel px-5 py-6 text-muted">No leads yet. They arrive when the site calls window.liftpage.lead().</p>
        )}
      </section>
    </>
  );
}
