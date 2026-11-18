"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { deleteMetric } from "@/app/actions/metrics";
import { change, fmt, inRange, rangeFrom, summarize } from "@/lib/stats";
import { PLATFORM_NAME, type Metric } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { RowButton } from "./forms";
import { ImportForm } from "./MetricForm";
import { RangeBar } from "./RangeBar";
import { WeeklyBars } from "./WeeklyBars";

export function Tile({ label, value, delta, note }: { label: string; value: string; delta?: number | null; note?: string }) {
  return (
    <div className="border border-line p-4">
      <p className={`${KICKER} text-mute`}>{label}</p>
      <p className="mt-2 font-mono text-3xl text-paper">{value}</p>
      <p className="mt-1 font-mono text-xs text-mute">
        {delta === undefined ? note ?? " " : delta === null ? "no prior week" : `${fmt.delta(delta)} vs prior week`}
      </p>
    </div>
  );
}

/**
 * A client's numbers. Reads ?range= from the URL itself, so pages only pass the rows.
 * Pass `userId` when an admin is looking at someone else's account.
 */
export function CustomerStats({ metrics: all, canDelete, userId }: { metrics: Metric[]; canDelete: boolean; userId?: string }) {
  const range = rangeFrom(useSearchParams().get("range"));
  const path = usePathname();
  const owner = userId ?? all[0]?.userId;
  const exportHref = `/export/metrics?range=${range}${owner ? `&user=${encodeURIComponent(owner)}` : ""}`;
  const bar = <RangeBar path={path} range={range} exportHref={exportHref} />;
  const importer = (
    <details className="border border-line p-4">
      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-paper">Import weeks from a CSV</summary>
      <div className="mt-4 max-w-2xl">
        <ImportForm userId={userId} />
      </div>
    </details>
  );
  if (all.length === 0) {
    return (
      <div className="grid gap-6">
        <p className="border border-line px-4 py-6 text-mute">No numbers yet. Import a CSV, or log the first week below.</p>
        {importer}
      </div>
    );
  }
  const metrics = inRange(all, range);
  const s = summarize(metrics);
  if (!s.latest) {
    return (
      <div className="grid gap-6">
        {bar}
        <p className="border border-line px-4 py-6 text-mute">Nothing logged in this range. Pick a longer one.</p>
      </div>
    );
  }
  const { latest, previous } = s;
  const rows = [...metrics].sort((a, b) => b.week.localeCompare(a.week) || a.platform.localeCompare(b.platform));

  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      {bar}
      <p className="font-mono text-xs text-mute">Latest week: {fmt.week(latest.week)}, all platforms</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Followers" value={fmt.compact(latest.followers)} delta={change(latest.followers, previous?.followers)} />
        <Tile label="Impressions" value={fmt.compact(latest.impressions)} delta={change(latest.impressions, previous?.impressions)} />
        <Tile label="Engagement rate" value={s.rate === null ? "—" : fmt.pct(s.rate)} note="engagements ÷ impressions" />
        <Tile label="Link clicks" value={fmt.compact(latest.clicks)} delta={change(latest.clicks, previous?.clicks)} />
        <Tile label="Leads" value={fmt.compact(latest.leads)} delta={change(latest.leads, previous?.leads)} />
      </div>

      {s.weeks.length > 1 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <WeeklyBars weeks={s.weeks} field="impressions" title="Impressions" />
          <WeeklyBars weeks={s.weeks} field="followers" title="Followers" />
        </div>
      ) : null}

      {s.platforms.length > 1 ? (
        <div className="border border-line p-4">
          <p className={`${KICKER} text-mute`}>Impressions by platform, {fmt.week(latest.week)}</p>
          <ul className="mt-3 grid gap-2">
            {s.platforms.map((row) => (
              <li key={row.platform} className="grid grid-cols-[6rem_minmax(0,1fr)_5rem] items-center gap-3 text-sm">
                <span>{PLATFORM_NAME[row.platform]}</span>
                <span className="h-2 bg-line">
                  <span
                    className="block h-2 rounded-r bg-tape"
                    style={{ width: `${latest.impressions ? (row.impressions / latest.impressions) * 100 : 0}%` }}
                  />
                </span>
                <span className="text-right font-mono text-mute">{fmt.compact(row.impressions)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[48rem] text-sm">
          <caption className="sr-only">Every logged week</caption>
          <thead className={`${KICKER} text-mute`}>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2 font-normal">Week</th>
              <th className="px-3 py-2 font-normal">Platform</th>
              <th className="px-3 py-2 text-right font-normal">Followers</th>
              <th className="px-3 py-2 text-right font-normal">Impressions</th>
              <th className="px-3 py-2 text-right font-normal">Engagements</th>
              <th className="px-3 py-2 text-right font-normal">Clicks</th>
              <th className="px-3 py-2 text-right font-normal">Leads</th>
              <th className="px-3 py-2 font-normal">Source</th>
              {canDelete ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-2">{fmt.week(m.week)}</td>
                <td className="px-3 py-2 font-sans">{PLATFORM_NAME[m.platform]}</td>
                <td className="px-3 py-2 text-right">{fmt.whole(m.followers)}</td>
                <td className="px-3 py-2 text-right">{fmt.whole(m.impressions)}</td>
                <td className="px-3 py-2 text-right">{fmt.whole(m.engagements)}</td>
                <td className="px-3 py-2 text-right">{fmt.whole(m.clicks)}</td>
                <td className="px-3 py-2 text-right">{fmt.whole(m.leads)}</td>
                <td className="px-3 py-2 text-xs text-mute">{m.source ?? "manual"}</td>
                {canDelete ? (
                  <td className="px-3 py-1 text-right">
                    <form action={deleteMetric}>
                      <input type="hidden" name="id" value={m.id} />
                      <RowButton tone="heat">Delete</RowButton>
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {importer}
    </div>
  );
}
