import Link from "next/link";
import { RANGES, type RangeKey } from "@/lib/stats";
import { KICKER } from "@/lib/ui";

/** The one filter row above the charts: range links, then the export. */
export function RangeBar({ path, range, exportHref }: { path: string; range: RangeKey; exportHref: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${KICKER}`}>
      <nav aria-label="Date range" className="flex flex-wrap gap-1">
        {RANGES.map(([key, label]) => {
          const on = key === range;
          return (
            <Link
              key={key}
              href={`${path}?range=${key}`}
              scroll={false}
              aria-current={on ? "true" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs transition-colors ${on ? "border-ink bg-ink text-canvas" : "border-line text-ink hover:border-ink"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <a href={exportHref} className="btn-ghost btn-sm" download>
        Export CSV
      </a>
    </div>
  );
}
