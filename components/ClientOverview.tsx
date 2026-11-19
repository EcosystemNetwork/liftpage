import type { ReactNode } from "react";
import { WINDOW, type AccountRow, type Overview } from "@/lib/overview";
import { PLAN_STATUS_LABEL, planTerms } from "@/lib/plan";
import { fmt } from "@/lib/stats";
import { formatSlot } from "@/lib/time";
import { PLATFORM_NAME, type Plan, type Project } from "@/lib/types";
import { KICKER } from "@/lib/ui";

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 60) return min < 1 ? "just now" : `${min}m ago`;
  if (min < 1440) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}

/** A thin line of the last few weeks. Decorative: the tile says the number in words. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 120;
  const H = 32;
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-8 w-full max-w-40" aria-hidden="true" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Delta({ value, span }: { value: number | null; span: string }) {
  if (value === null) return <span className="text-muted">no earlier {span} to compare</span>;
  const tone = value > 0 ? "text-accent" : value < 0 ? "text-danger" : "text-muted";
  return (
    <span>
      <span className={tone}>{fmt.delta(value)}</span> <span className="text-muted">vs {span} before</span>
    </span>
  );
}

function Kpi({ label, value, foot, children, wide }: { label: string; value: string; foot: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <div className={`panel flex flex-col p-4 ${wide ? "col-span-2" : ""}`}>
      <p className={`${KICKER} text-muted`}>{label}</p>
      <p className="display mt-2 text-4xl text-ink tabular-nums">{value}</p>
      {children}
      <p className="mt-auto pt-2 text-xs">{foot}</p>
    </div>
  );
}

const STATE: Record<AccountRow["state"], { dot: string; text: string }> = {
  connected: { dot: "bg-accent", text: "Connected" },
  reconnect: { dot: "bg-danger", text: "Needs reconnecting. We’re on it" },
  missing: { dot: "bg-line", text: "Not connected yet" },
};

/**
 * The top of a client's account: who they are, what they're on, which networks we post
 * to, and how the last few weeks went. Details live in the sections below it.
 */
export function ClientOverview({
  company,
  since,
  handle,
  plan,
  projects,
  data,
  preview,
}: {
  company: string;
  /** When the account was made. */
  since: string;
  handle?: string;
  plan: Plan | null;
  projects: Pick<Project, "kind" | "status" | "check">[];
  data: Overview;
  /** Admin looking as the client: no links that act. */
  preview?: boolean;
}) {
  const { now } = data;
  const span = `${WINDOW} weeks`;
  const sites = projects.filter((p) => p.kind === "website" && p.status === "live");
  const down = sites.filter((p) => p.check && !p.check.ok).length;
  const connected = data.accounts.filter((a) => a.state === "connected").length;
  const hasNumbers = data.to !== null;

  return (
    <section aria-labelledby="overview-title" className="grid gap-4 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h2 id="overview-title" className="display text-3xl">
          Overview
        </h2>
        <p className="font-mono text-xs text-muted">
          {hasNumbers ? `${fmt.week(data.from!)} – week of ${fmt.week(data.to!)}` : "No numbers yet"}
          {data.lastSync ? ` · synced ${ago(data.lastSync, now)}` : ""}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <div className="panel grid content-start gap-4 p-5">
          <div>
            <p className={`${KICKER} text-muted`}>Company</p>
            <p className="display mt-2 text-3xl break-words">{company}</p>
            {handle ? <p className="mt-1 font-mono text-sm text-muted">{handle.startsWith("@") ? handle : `@${handle}`}</p> : null}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Plan</dt>
            <dd>
              {plan ? (
                <>
                  {plan.name} · {planTerms(plan, now).price}{" "}
                  <span className={plan.status === "past_due" ? "text-danger" : "text-muted"}>({PLAN_STATUS_LABEL[plan.status]})</span>
                </>
              ) : (
                <span className="text-muted">Not set up yet</span>
              )}
            </dd>
            <dt className="text-muted">Networks</dt>
            <dd>
              {connected} of {data.accounts.length || 0} connected
            </dd>
            {sites.length ? (
              <>
                <dt className="text-muted">Websites</dt>
                <dd>
                  {sites.length} live ·{" "}
                  {down ? <span className="text-danger">{down} down</span> : <span className="text-muted">{sites.length === 1 ? "up" : "all up"}</span>}
                </dd>
              </>
            ) : null}
            <dt className="text-muted">With us since</dt>
            <dd>{longDate(since)}</dd>
          </dl>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
          <Kpi label={`Impressions, ${span}`} value={hasNumbers ? fmt.compact(data.impressions.total) : "—"} foot={hasNumbers ? <Delta value={data.impressions.change} span={span} /> : <span className="text-muted">Shows up after the first week</span>} wide>
            <Spark values={data.impressions.spark} />
          </Kpi>
          <Kpi label="Followers" value={hasNumbers ? fmt.compact(data.followers.total) : "—"} foot={hasNumbers ? <Delta value={data.followers.change} span={span} /> : " "} />
          <Kpi label="Engagement rate" value={data.rate === null ? "—" : fmt.pct(data.rate)} foot={<span className="text-muted">{fmt.compact(data.engagements)} likes, replies and shares</span>} />
          <Kpi label={`Link clicks, ${span}`} value={hasNumbers ? fmt.compact(data.clicks.total) : "—"} foot={hasNumbers ? <Delta value={data.clicks.change} span={span} /> : " "} />
          <Kpi label={`Leads, ${span}`} value={hasNumbers ? fmt.compact(data.leads.total) : "—"} foot={hasNumbers ? <Delta value={data.leads.change} span={span} /> : " "} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <div className="panel p-5">
          <p className={`${KICKER} text-muted`}>Accounts we post to</p>
          {data.accounts.length ? (
            <ul className="mt-3 divide-y divide-line">
              {data.accounts.map((a) => (
                <li key={a.platform} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {PLATFORM_NAME[a.platform]}
                      {a.name ? <span className="ml-2 font-mono text-sm font-normal text-muted break-all">{a.name}</span> : null}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <span className={`inline-block size-2 shrink-0 rounded-full ${STATE[a.state].dot}`} aria-hidden="true" />
                      {STATE[a.state].text}
                      {a.state === "connected" && a.connectedAt ? ` · since ${longDate(a.connectedAt)}` : ""}
                    </p>
                  </div>
                  <p className="text-right font-mono text-sm">
                    {a.followers === null ? "—" : fmt.compact(a.followers)}
                    <span className="block font-sans text-xs text-muted">followers</span>
                  </p>
                  <p className="hidden text-right font-mono text-sm sm:block">
                    {a.impressions === null ? "—" : fmt.compact(a.impressions)}
                    <span className="block font-sans text-xs text-muted">impressions</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-muted">No networks picked yet. We set them up with you when your campaign starts.</p>
          )}
          {!preview && data.accounts.some((a) => a.state === "missing") ? (
            <p className="mt-2 text-sm text-muted">
              Want one of these connected?{" "}
              <a href="#messages" className="link">
                Send us a message
              </a>{" "}
              and we&rsquo;ll walk you through it.
            </p>
          ) : null}
        </div>

        <div className="panel grid content-start gap-4 p-5">
          <div>
            <p className={`${KICKER} text-muted`}>Posts</p>
            <p className="mt-2 text-sm">
              <span className="display text-3xl tabular-nums">{data.posts.published30}</span> <span className="text-muted">published in 30 days</span>
            </p>
            <p className="mt-1 text-sm">
              <span className="display text-3xl tabular-nums">{data.posts.scheduled}</span> <span className="text-muted">scheduled</span>
            </p>
          </div>
          {data.posts.next ? (
            <div className="text-sm">
              <p className={`${KICKER} text-muted`}>Up next</p>
              <p className="mt-1">
                {PLATFORM_NAME[data.posts.next.platform]} · {formatSlot(data.posts.next.slot)}
              </p>
              <p className="mt-0.5 line-clamp-2 text-muted">{data.posts.next.hook}</p>
            </div>
          ) : null}
          {data.posts.last ? (
            <div className="text-sm">
              <p className={`${KICKER} text-muted`}>Latest post</p>
              <p className="mt-1">
                {PLATFORM_NAME[data.posts.last.platform]}
                {data.posts.last.publishedAt ? ` · ${ago(data.posts.last.publishedAt, now)}` : ""}
                {data.posts.last.publishedUrl ? (
                  <>
                    {" · "}
                    <a href={data.posts.last.publishedUrl} target="_blank" rel="noopener noreferrer" className="link">
                      View it
                    </a>
                  </>
                ) : null}
              </p>
              <p className="mt-0.5 line-clamp-2 text-muted">{data.posts.last.hook}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
