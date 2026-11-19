import type { CalendarDay, CalendarEntry, Recap, Win } from "@/lib/recap";
import { fmt } from "@/lib/stats";
import { PLATFORM_NAME, type Platform } from "@/lib/types";
import { KICKER } from "@/lib/ui";

/** Milestones and records from their numbers. Renders nothing when there's nothing to celebrate. */
export function Wins({ wins }: { wins: Win[] }) {
  if (!wins.length) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Wins">
      {wins.map((win) => (
        <li key={win.title} className="min-w-0 rounded-2xl border border-accent/30 bg-accent-soft p-4">
          <p className={`${KICKER} text-accent`}>Win</p>
          <p className="display mt-1 text-2xl">{win.title}</p>
          <p className="mt-1 text-sm">{win.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function Change({ value, before }: { value: number; before: number | null }) {
  if (before === null) return <span className="text-muted">first month</span>;
  if (before === 0) return <span className="text-muted">{value ? "new" : "same"}</span>;
  const d = (value - before) / before;
  return <span className={d > 0 ? "text-accent" : d < 0 ? "text-danger" : "text-muted"}>{fmt.delta(d)}</span>;
}

/** This month so far against the same days last month. */
export function MonthRecap({ recap }: { recap: Recap }) {
  return (
    <div className="panel p-5">
      <p className={`${KICKER} text-muted`}>{recap.month} so far, against the same days last month</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {recap.lines.map((line) => (
          <div key={line.label} className="min-w-0">
            <dt className="text-sm text-muted">{line.label}</dt>
            <dd className="display mt-1 text-3xl tabular-nums">{fmt.compact(line.value)}</dd>
            <dd className="text-xs">
              <Change value={line.value} before={line.before} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const ABBR: Record<Platform, string> = { x: "X", instagram: "IG", tiktok: "TT", linkedin: "in", youtube: "YT" };
const CHIP: Record<CalendarEntry["state"], string> = {
  waiting: "border-ink text-ink",
  ready: "border-accent bg-accent text-canvas",
  out: "border-line bg-sunken text-muted",
  failed: "border-danger text-danger",
};
const SAY: Record<CalendarEntry["state"], string> = { waiting: "waiting for you", ready: "approved", out: "posted", failed: "didn’t go out" };

/** The next two weeks, one cell a day, one chip a post. */
export function Calendar({ days }: { days: CalendarDay[] }) {
  return (
    <div>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <li
            key={day.key}
            className={`min-h-20 min-w-0 rounded-xl border p-1.5 sm:p-2 ${day.today ? "border-accent" : "border-line"} ${day.entries.length ? "bg-card" : ""}`}
          >
            <p className="font-mono text-[10px] text-muted uppercase sm:text-xs">
              {day.weekday} <span className={day.today ? "text-accent" : "text-ink"}>{day.day}</span>
            </p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {day.entries.map((entry, i) => (
                <li key={i} className={`rounded border px-1 font-mono text-[10px] leading-4 ${CHIP[entry.state]}`} title={`${PLATFORM_NAME[entry.platform]}, ${SAY[entry.state]}`}>
                  {ABBR[entry.platform]}
                  <span className="sr-only">
                    {" "}
                    {PLATFORM_NAME[entry.platform]}, {SAY[entry.state]}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(Object.keys(SAY) as CalendarEntry["state"][]).map((state) => (
          <span key={state} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-3 rounded border ${CHIP[state]}`} aria-hidden="true" />
            {SAY[state][0].toUpperCase() + SAY[state].slice(1)}
          </span>
        ))}
      </p>
    </div>
  );
}
