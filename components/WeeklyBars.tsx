import { fmt, type WeekTotals } from "@/lib/stats";
import type { MetricField } from "@/lib/types";

const W = 640;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 24, left: 44 };

/** One series, one axis. Hover a week for its value. The table below is the accessible view. */
export function WeeklyBars({ weeks, field, title }: { weeks: WeekTotals[]; field: MetricField; title: string }) {
  const rows = weeks.slice(-52);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((row) => row[field]));
  const top = niceCeil(max);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / rows.length;
  const barW = Math.min(36, slot - 2);
  const ticks = [0, top / 2, top];
  // Label the latest week, then every `step` back, so labels never crowd.
  const step = rows.length <= 7 ? 1 : Math.ceil(rows.length / 7);

  return (
    <figure className="border border-line p-3">
      <figcaption className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">{title} by week</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${title} by week`}>
        {ticks.map((tick) => {
          const y = PAD.top + plotH - (tick / top) * plotH;
          return (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--mute)" fontFamily="var(--font-mono-face)">
                {fmt.compact(tick)}
              </text>
            </g>
          );
        })}
        {rows.map((row, i) => {
          const value = row[field];
          const h = Math.max(value > 0 ? 2 : 0, (value / top) * plotH);
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const y = PAD.top + plotH - h;
          const r = Math.min(4, h / 2, barW / 2);
          return (
            <g key={row.week} className="group">
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              <path d={topRounded(x, y, barW, h, r)} fill="var(--tape)" className="opacity-85 group-hover:opacity-100" />
              {(rows.length - 1 - i) % step === 0 ? (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--mute)" fontFamily="var(--font-mono-face)">
                  {fmt.week(row.week)}
                </text>
              ) : null}
              <g className="pointer-events-none opacity-0 group-hover:opacity-100">
                <rect
                  x={clamp(x + barW / 2 - 50, PAD.left, W - PAD.right - 100)}
                  y={Math.max(0, y - 30)}
                  width={100}
                  height={24}
                  fill="var(--panel)"
                  stroke="var(--line)"
                />
                <text
                  x={clamp(x + barW / 2, PAD.left + 50, W - PAD.right - 50)}
                  y={Math.max(0, y - 30) + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--paper)"
                  fontFamily="var(--font-mono-face)"
                >
                  {fmt.week(row.week)} · {fmt.compact(value)}
                </text>
              </g>
              <title>{`Week of ${fmt.week(row.week)}: ${fmt.whole(value)}`}</title>
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--mute)" strokeWidth={1} />
      </svg>
    </figure>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function niceCeil(n: number): number {
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

/** Rounded data end, square at the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
