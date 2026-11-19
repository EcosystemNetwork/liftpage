import type { Flag } from "@/lib/health";

const TONE = {
  heat: "border-danger/30 bg-danger-soft text-danger",
  tape: "border-accent/30 bg-accent-soft text-accent",
  mute: "border-line text-muted",
} as const;

/** Health flags as small chips, worst first. */
export function FlagList({ flags }: { flags: Flag[] }) {
  const order = { heat: 0, tape: 1, mute: 2 } as const;
  return (
    <ul className="flex flex-wrap gap-2">
      {[...flags]
        .sort((a, b) => order[a.tone] - order[b.tone])
        .map((flag) => (
          <li key={flag.key} className={`rounded-full border px-2.5 py-1 text-xs ${TONE[flag.tone]}`}>
            {flag.text}
          </li>
        ))}
    </ul>
  );
}
