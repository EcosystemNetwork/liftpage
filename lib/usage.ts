import { AsyncLocalStorage } from "node:async_hooks";
import { round, type Usage } from "./usage-format";

export { NO_USAGE, addUsage, usageLabel, type Usage } from "./usage-format";

/*
 * Counts model tokens (and, where we know the price, dollars) for whatever runs inside
 * `metered`. lib/ai.ts reports each response's `usage` block here; calls made outside a
 * meter are simply not counted. Prices come from LIFTPAGE_AI_PRICES, never guessed:
 *   LIFTPAGE_AI_PRICES='{"openai/gpt-5-mini":[0.25,2],"gpt-5.4-mini":[0.4,1.6]}'
 * (US dollars per million input and output tokens). A model without a price counts
 * tokens and shows its cost as unknown.
 */

export type UsageCall = { backend: string; model: string; inputTokens: number; outputTokens: number };


const meter = new AsyncLocalStorage<UsageCall[]>();

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

/** Reads token counts from a chat-completions or Responses-style body. Null when there are none. */
export function usageFrom(backend: string, body: unknown): UsageCall | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const usage = record.usage as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = num(usage.input_tokens) || num(usage.prompt_tokens);
  const outputTokens = num(usage.output_tokens) || num(usage.completion_tokens);
  if (!inputTokens && !outputTokens) return null;
  return { backend, model: typeof record.model === "string" ? record.model.slice(0, 120) : "unknown", inputTokens, outputTokens };
}

/** Called by lib/ai.ts after every successful model response. */
export function recordUsage(backend: string, body: unknown): void {
  const calls = meter.getStore();
  if (!calls) return;
  const call = usageFrom(backend, body);
  if (call) calls.push(call);
}

export function priceTable(raw = process.env.LIFTPAGE_AI_PRICES): Record<string, [number, number]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const table: Record<string, [number, number]> = {};
    for (const [model, price] of Object.entries(parsed)) {
      if (Array.isArray(price) && price.length === 2 && price.every((n) => typeof n === "number" && n >= 0)) table[model] = [price[0], price[1]];
    }
    return table;
  } catch {
    return {};
  }
}

export function summarizeUsage(calls: UsageCall[], prices = priceTable()): Usage {
  const models = new Set<string>();
  let costUsd = 0;
  let unpriced = 0;
  for (const call of calls) {
    models.add(call.model);
    const price = prices[call.model];
    if (price) costUsd += (call.inputTokens * price[0] + call.outputTokens * price[1]) / 1_000_000;
    else unpriced++;
  }
  return {
    calls: calls.length,
    inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
    costUsd: round(costUsd),
    unpriced,
    models: [...models],
  };
}

/** Runs `work` with a fresh meter and returns its result with what it spent. A thrown error carries the spend too. */
export async function metered<T>(work: () => Promise<T>): Promise<{ value: T; usage: Usage }> {
  const calls: UsageCall[] = [];
  try {
    const value = await meter.run(calls, work);
    return { value, usage: summarizeUsage(calls) };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    throw Object.assign(failure, { usage: summarizeUsage(calls) });
  }
}

/** The usage a failed `metered` call carried, if any. */
export function usageOf(error: unknown): Usage | undefined {
  return error && typeof error === "object" && "usage" in error ? (error as { usage?: Usage }).usage : undefined;
}

