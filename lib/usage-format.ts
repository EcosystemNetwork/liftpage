/* Pure usage shapes and formatting, safe to import from client components. */

export type Usage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Dollars for the calls we have prices for. */
  costUsd: number;
  /** Calls whose model has no price set; their cost isn't in costUsd. */
  unpriced: number;
  models: string[];
};

export const NO_USAGE: Usage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpriced: 0, models: [] };

export const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/** Adds usages together (a campaign's steps, or two parallel content calls). */
export function addUsage(...parts: (Usage | undefined | null)[]): Usage {
  const present = parts.filter((part): part is Usage => Boolean(part));
  return {
    calls: present.reduce((sum, part) => sum + part.calls, 0),
    inputTokens: present.reduce((sum, part) => sum + part.inputTokens, 0),
    outputTokens: present.reduce((sum, part) => sum + part.outputTokens, 0),
    costUsd: round(present.reduce((sum, part) => sum + part.costUsd, 0)),
    unpriced: present.reduce((sum, part) => sum + part.unpriced, 0),
    models: [...new Set(present.flatMap((part) => part.models))],
  };
}

/** "$0.0123 · 4.2k tokens", or "price unknown" when nothing was priced. */
export function usageLabel(usage: Usage): string {
  if (!usage.calls) return "no model calls";
  const tokens = usage.inputTokens + usage.outputTokens;
  const size = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k tokens` : `${tokens} tokens`;
  if (usage.unpriced === usage.calls) return `${size} · price unknown`;
  const cost = `$${usage.costUsd < 0.01 ? usage.costUsd.toFixed(4) : usage.costUsd.toFixed(2)}`;
  return usage.unpriced ? `${cost}+ · ${size} (${usage.unpriced} unpriced)` : `${cost} · ${size}`;
}
