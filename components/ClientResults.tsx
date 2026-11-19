import { formatMoney, rates, revenue, type Lead } from "@/lib/attribution";
import type { BoardReport } from "@/lib/attribution-store";
import { formatStamp } from "@/lib/time";
import { PLATFORM_NAME } from "@/lib/types";

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

/**
 * The client's own results: each campaign's funnel from post to revenue, its best posts, and
 * their newest leads. What they paid for, in their numbers. AI spend is internal and stays
 * on the admin side.
 */
export function ClientResults({ report, leads, tracking }: { report: BoardReport; leads: Lead[]; tracking: boolean }) {
  const campaigns = report.campaigns.filter((item) => item.campaign);
  if (!campaigns.length && !leads.length) {
    return (
      <p className="panel px-5 py-6 text-muted">
        {tracking
          ? "No campaign results yet. They show here once people start arriving from LiftPage links."
          : "Results show here once LiftPage tracking is on your site. Ask us for the snippet."}
      </p>
    );
  }
  return (
    <div className="grid gap-4">
      {campaigns.map((item) => {
        const r = rates(item.funnel);
        const best = item.posts
          .filter((post) => post.hook && (post.funnel.visits || post.funnel.leads))
          .sort((a, b) => b.funnel.leads - a.funnel.leads || b.funnel.visits - a.funnel.visits)
          .slice(0, 3);
        return (
          <article key={item.tag} className="panel px-5 py-5">
            <p className="eyebrow text-muted">
              {formatStamp(item.campaign!.createdAt)}
              {item.campaign!.goal ? ` · ${item.campaign!.goal}` : ""}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Visits", String(item.funnel.visits)],
                ["Leads", `${item.funnel.leads}`, pct(r.visitToLead)],
                ["Sales", `${item.funnel.conversions + item.funnel.wonDeals}`, pct(r.leadToSale)],
                ["Revenue", formatMoney(revenue(item.funnel))],
              ].map(([label, value, rate]) => (
                <div key={label}>
                  <dt className="eyebrow text-muted">{label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {value} {rate && rate !== "—" ? <span className="text-sm font-normal text-muted">{rate}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            {best.length ? (
              <div className="mt-4">
                <p className="eyebrow text-muted">What worked best</p>
                <ol className="mt-1 grid gap-1 text-sm">
                  {best.map((post) => (
                    <li key={post.content}>
                      {post.platform ? <span className="eyebrow text-muted">{PLATFORM_NAME[post.platform]} </span> : null}
                      {post.hook} <span className="text-muted">· {post.funnel.visits} visits, {post.funnel.leads} leads</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </article>
        );
      })}
      {leads.length ? (
        <div className="panel px-5 py-5">
          <p className="eyebrow text-muted">Newest leads</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {leads.slice(0, 10).map((lead) => (
              <li key={lead.id}>
                <strong>{lead.name || lead.email}</strong>
                {lead.company ? ` · ${lead.company}` : ""} <span className="text-muted">· {lead.status} · {formatStamp(lead.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        Counted from LiftPage links: credit goes to the last one a visitor came through, within 30 days. Revenue is what your site reports plus deals marked
        won.
      </p>
    </div>
  );
}
