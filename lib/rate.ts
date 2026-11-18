/**
 * In-memory fixed-window limiter. One process, one window. Good enough for a single
 * node; put it behind a shared store before running more than one.
 */
const hits = new Map<string, { count: number; reset: number }>();

export function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

export function clearLimit(key: string) {
  hits.delete(key);
}
