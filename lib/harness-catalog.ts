import "server-only";
import { harnessModel, harnessName, harnessReady, tokenReady, type AiBackend, type AiRoute } from "./ai";

/*
 * What HarnessRouter can run: each harness (codex, claude, hermes, …) and the models it
 * offers, read from GET /v1/models. Admins pick from this list; the server checks every pick
 * against it before a call goes out.
 */

export type Harness = { id: string; defaultModel: string; models: string[] };
export type HarnessCatalog = { harnesses: Harness[]; fetchedAt: string; live: boolean };

const BACKENDS = new Set<AiBackend>(["auto", "harnessrouter", "tokenrouter"]);
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const TTL = 10 * 60_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Reads the /v1/models answer. Keeps available models only; drops harnesses with none. */
export function parseCatalog(data: unknown): Harness[] {
  const backends = asRecord(asRecord(data)?.backends);
  if (!backends) return [];
  const harnesses: Harness[] = [];
  for (const [id, raw] of Object.entries(backends)) {
    const entry = asRecord(raw);
    if (!entry || !ID.test(id) || !Array.isArray(entry.models)) continue;
    const models = entry.models
      .map(asRecord)
      .filter((m): m is Record<string, unknown> => Boolean(m) && m!.available !== false && typeof m!.id === "string" && ID.test(m!.id as string))
      .map((m) => m.id as string);
    if (!models.length) continue;
    const named = typeof entry.default === "string" ? entry.default : "";
    harnesses.push({ id, models, defaultModel: models.includes(named) ? named : models[0] });
  }
  return harnesses;
}

/** The env's harness and model, for when the live list can't be read. */
function fallback(): Harness[] {
  return [{ id: harnessName(), defaultModel: harnessModel(), models: [harnessModel()] }];
}

let cached: { at: number; catalog: HarnessCatalog } | undefined;

/** Never throws. Falls back to the env's harness and model when the list can't be read. */
export async function loadHarnessCatalog(now = Date.now()): Promise<HarnessCatalog> {
  if (cached && now - cached.at < TTL) return cached.catalog;
  const base = process.env.HARNESSROUTER_BASE_URL;
  const key = process.env.HARNESSROUTER_API_KEY;
  if (!harnessReady() || !base || !key) return { harnesses: [], fetchedAt: new Date(now).toISOString(), live: false };
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`models ${response.status}`);
    const harnesses = parseCatalog(await response.json());
    if (!harnesses.length) throw new Error("empty model list");
    const catalog = { harnesses, fetchedAt: new Date(now).toISOString(), live: true };
    cached = { at: now, catalog };
    return catalog;
  } catch (error) {
    console.error("harness catalog", error instanceof Error ? error.message : String(error));
    return { harnesses: fallback(), fetchedAt: new Date(now).toISOString(), live: false };
  }
}

/**
 * Turns whatever the browser sent into a route the server will use, or an error to show.
 * The harness and model must be on the list; an empty field keeps the env default.
 */
export function checkRoute(value: unknown, catalog: Pick<HarnessCatalog, "harnesses">): AiRoute | { error: string } {
  const raw = asRecord(value) ?? {};
  const backend = typeof raw.backend === "string" && BACKENDS.has(raw.backend as AiBackend) ? (raw.backend as AiBackend) : "auto";
  const harness = typeof raw.harness === "string" ? raw.harness.trim() : "";
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (backend === "tokenrouter") return { backend };
  if (!harness && !model) return { backend };
  const list = catalog.harnesses.length ? catalog.harnesses : fallback();
  const found = list.find((h) => h.id === (harness || harnessName()));
  if (!found) return { error: `HarnessRouter has no harness called "${harness.slice(0, 40)}".` };
  if (model && !found.models.includes(model)) return { error: `The ${found.id} harness doesn't offer "${model.slice(0, 40)}".` };
  return { backend, harness: found.id, model: model || found.defaultModel };
}

/** Which backends are set up, for the picker. */
export function backendsReady(): { harnessrouter: boolean; tokenrouter: boolean } {
  return { harnessrouter: harnessReady(), tokenrouter: tokenReady() };
}
