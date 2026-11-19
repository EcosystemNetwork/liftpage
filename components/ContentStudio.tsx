"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { deleteContentDraft, saveContentDraft, updateContentDraft } from "@/app/actions/content";
import type { ContentDraft } from "@/lib/content-drafts";
import type { Harness } from "@/lib/harness-catalog";
import { PLATFORM_NAME, type Platform } from "@/lib/types";
import { INPUT, LABEL } from "@/lib/ui";

type Board = { id: string; label: string; platforms: Platform[] };
type Format = { id: string; label: string; hint?: string };
type Backend = "auto" | "harnessrouter" | "tokenrouter";
type Route = { backend: Backend; harness: string; model: string };
type Generated = { id: string; platform: Platform; slot: string; hook: string; caption: string };
type Piece = { text: string; note: string; via: string; harness: string; model: string; format: string; brief: string; brandId: string };

const ROUTE_KEY = "liftpage.content.route";
const BACKENDS: { id: Backend; label: string }[] = [
  { id: "auto", label: "HarnessRouter, then TokenRouter" },
  { id: "harnessrouter", label: "HarnessRouter only" },
  { id: "tokenrouter", label: "TokenRouter only" },
];

function storedRaw(): string | null {
  try {
    return window.localStorage.getItem(ROUTE_KEY);
  } catch {
    return null;
  }
}

function onStorage(change: () => void) {
  window.addEventListener("storage", change);
  return () => window.removeEventListener("storage", change);
}

function parseStored(raw: string | null): Partial<Route> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Route>;
  } catch {
    return {};
  }
}

function writeRoute(route: Route) {
  try {
    window.localStorage.setItem(ROUTE_KEY, JSON.stringify(route));
  } catch {
    /* private window or blocked storage: the pick just isn't remembered */
  }
}

/** A stored or picked route, held to what this catalog and these backends can do. */
function resolveRoute(want: Partial<Route>, fallback: Route, harnesses: Harness[], ready: { harnessrouter: boolean; tokenrouter: boolean }): Route {
  const backendOk = (b: unknown): b is Backend => b === "auto" || ((b === "harnessrouter" || b === "tokenrouter") && ready[b]);
  const harness = harnesses.find((h) => h.id === want.harness);
  return {
    backend: backendOk(want.backend) ? want.backend : fallback.backend,
    harness: harness?.id ?? fallback.harness,
    model: harness ? (want.model && harness.models.includes(want.model) ? want.model : harness.defaultModel) : fallback.model,
  };
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Admin content studio. Pick the backend, harness, and model once; then write long-form
 * pieces (saved per board) or social posts (straight onto the board as drafts).
 */
export function ContentStudio({
  boards,
  formats,
  harnesses,
  catalogLive,
  ready,
  defaults,
  initialDrafts,
}: {
  boards: Board[];
  formats: Format[];
  harnesses: Harness[];
  catalogLive: boolean;
  ready: { harnessrouter: boolean; tokenrouter: boolean };
  defaults: { harness: string; model: string };
  initialDrafts: ContentDraft[];
}) {
  const startHarness = harnesses.find((h) => h.id === defaults.harness) ?? harnesses[0];
  const fallbackRoute: Route = {
    backend: ready.harnessrouter ? "auto" : "tokenrouter",
    harness: startHarness?.id ?? "",
    model: startHarness?.models.includes(defaults.model) ? defaults.model : (startHarness?.defaultModel ?? ""),
  };
  // The last pick, from this browser. Null on the server, so the first render matches.
  const stored = useSyncExternalStore(onStorage, storedRaw, () => null);
  const [picked, setPicked] = useState<Route | null>(null);
  const route = resolveRoute(picked ?? parseStored(stored), fallbackRoute, harnesses, ready);
  const [mode, setMode] = useState<"long" | "posts">("long");
  const [brandId, setBrandId] = useState(boards[0]?.id ?? "");
  const [format, setFormat] = useState(formats[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(6);
  const [platforms, setPlatforms] = useState<Platform[]>(boards[0]?.platforms ?? []);
  const [piece, setPiece] = useState<Piece | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [posts, setPosts] = useState<{ list: Generated[]; note: string; brandId: string } | null>(null);
  const [drafts, setDrafts] = useState<ContentDraft[]>(initialDrafts);
  const [onlyBoard, setOnlyBoard] = useState(false);
  const [busy, setBusy] = useState<"" | "write" | "posts" | "save">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const harness = harnesses.find((h) => h.id === route.harness);
  const board = boards.find((b) => b.id === brandId);
  const boardLabel = useMemo(() => new Map(boards.map((b) => [b.id, b.label])), [boards]);
  const formatLabel = useMemo(() => new Map(formats.map((f) => [f.id, f.label])), [formats]);
  const shownDrafts = onlyBoard ? drafts.filter((d) => d.brandId === brandId) : drafts;
  const usesHarness = route.backend !== "tokenrouter";
  const backendOk = route.backend === "auto" ? ready.harnessrouter || ready.tokenrouter : ready[route.backend];

  function pickRoute(next: Partial<Route>) {
    const merged = { ...route, ...next };
    if (next.harness && next.harness !== route.harness) {
      merged.model = harnesses.find((h) => h.id === next.harness)?.defaultModel ?? "";
    }
    writeRoute(merged);
    setPicked(merged);
  }

  function pickBoard(id: string) {
    setBrandId(id);
    setPlatforms(boards.find((b) => b.id === id)?.platforms ?? []);
  }

  function routeBody() {
    return usesHarness ? route : { backend: route.backend };
  }

  async function post<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  async function write(event: React.FormEvent) {
    event.preventDefault();
    setBusy("write");
    setError("");
    setNotice("");
    try {
      const out = await post<{ text: string; note: string; via: string; harness: string; model: string }>("/api/write", {
        brandId,
        format,
        brief,
        route: routeBody(),
      });
      setPiece({ ...out, format, brief, brandId });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The write failed.");
    } finally {
      setBusy("");
    }
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy("posts");
    setError("");
    setNotice("");
    try {
      const out = await post<{ posts: Generated[]; note: string }>("/api/content/posts", { brandId, brief, count, platforms, route: routeBody() });
      setPosts({ list: out.posts, note: out.note, brandId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generating failed.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!piece) return;
    setBusy("save");
    setError("");
    setNotice("");
    const result = editingId
      ? await updateContentDraft(editingId, piece.text)
      : await saveContentDraft({ brandId: piece.brandId, format: piece.format, brief: piece.brief, body: piece.text, via: piece.via, harness: piece.harness, model: piece.model });
    setBusy("");
    if ("error" in result) return setError(result.error);
    setDrafts((list) => [result.draft, ...list.filter((d) => d.id !== result.draft.id)]);
    setEditingId(result.draft.id);
    setNotice(editingId ? "Changes saved." : `Saved to ${boardLabel.get(result.draft.brandId) ?? "the board"}.`);
  }

  function open(draft: ContentDraft) {
    setMode("long");
    setPiece({
      text: draft.body,
      note: `Saved ${day(draft.updatedAt)}.`,
      via: draft.via,
      harness: draft.harness,
      model: draft.model,
      format: draft.format,
      brief: draft.brief,
      brandId: draft.brandId,
    });
    setEditingId(draft.id);
    setError("");
    setNotice("");
  }

  async function remove(draft: ContentDraft) {
    if (!window.confirm(`Delete "${draft.title}"? This can't be undone.`)) return;
    const result = await deleteContentDraft(draft.id);
    if ("error" in result) return setError(result.error);
    setDrafts((list) => list.filter((d) => d.id !== draft.id));
    if (editingId === draft.id) {
      setEditingId(null);
      setPiece(null);
    }
  }

  async function copy() {
    if (!piece) return;
    try {
      await navigator.clipboard.writeText(piece.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't reach the clipboard. Select the text and copy it.");
    }
  }

  const canRun = backendOk && brief.trim().length >= 8 && Boolean(brandId) && !busy;

  return (
    <div className="grid gap-8">
      {/* Routing */}
      <fieldset className="grid gap-3 panel p-4 md:grid-cols-3">
        <legend className="sr-only">Model routing</legend>
        <label className={LABEL} htmlFor="studio-backend">
          Backend
          <select id="studio-backend" value={route.backend} onChange={(e) => pickRoute({ backend: e.target.value as Backend })} className={INPUT}>
            {BACKENDS.map((b) => (
              <option key={b.id} value={b.id} disabled={b.id !== "auto" && !ready[b.id]}>
                {b.label}
                {b.id !== "auto" && !ready[b.id] ? " (not set up)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL} htmlFor="studio-harness">
          Harness
          <select
            id="studio-harness"
            value={route.harness}
            onChange={(e) => pickRoute({ harness: e.target.value })}
            disabled={!usesHarness || !harnesses.length}
            className={INPUT}
          >
            {harnesses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.id}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL} htmlFor="studio-model">
          Model
          <select
            id="studio-model"
            value={route.model}
            onChange={(e) => pickRoute({ model: e.target.value })}
            disabled={!usesHarness || !harness}
            className={INPUT}
          >
            {(harness?.models ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
                {m === harness?.defaultModel ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted md:col-span-3">
          {!ready.harnessrouter
            ? "HarnessRouter isn't set up. Set HARNESSROUTER_BASE_URL and HARNESSROUTER_API_KEY to pick a harness."
            : catalogLive
              ? `${harnesses.length} harnesses from HarnessRouter. The harness and model apply to HarnessRouter calls; TokenRouter uses its own model.`
              : "Couldn't read HarnessRouter's model list, so only the harness and model from the environment are offered."}
        </p>
      </fieldset>

      {/* Mode and board */}
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="What to make" className="flex gap-1 rounded-full border border-line p-1">
          {(
            [
              ["long", "Long-form"],
              ["posts", "Social posts"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm transition-colors ${mode === id ? "bg-ink text-canvas" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className={`${LABEL} min-w-56 flex-1 sm:flex-none`} htmlFor="studio-board">
          Board
          <select id="studio-board" value={brandId} onChange={(e) => pickBoard(e.target.value)} className={INPUT}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      ) : null}

      {mode === "long" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={write} className="grid content-start gap-3 panel p-4">
            <label className={LABEL} htmlFor="studio-format">
              What to write
              <select id="studio-format" value={format} onChange={(e) => setFormat(e.target.value)} className={INPUT}>
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL} htmlFor="studio-brief">
              Brief
              <textarea
                id="studio-brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={8}
                maxLength={6000}
                placeholder="The facts: what's happening, when, who it's for, links, numbers, names. The model won't invent any."
                className="field py-2.5"
              />
            </label>
            <button type="submit" disabled={!canRun} className="btn-primary justify-self-start">
              {busy === "write" ? "Writing" : "Write it"}
            </button>
          </form>
          <div className="grid content-start gap-2 panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow text-muted">{editingId ? "Saved draft" : "Draft"}</p>
              <div className="flex gap-2">
                <button type="button" onClick={copy} disabled={!piece?.text} className="btn-ghost btn-sm">
                  {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" onClick={save} disabled={!piece?.text.trim() || busy === "save"} className="btn-primary btn-sm">
                  {busy === "save" ? "Saving" : editingId ? "Save changes" : "Save to board"}
                </button>
              </div>
            </div>
            <label htmlFor="studio-out" className="sr-only">
              Draft
            </label>
            <textarea
              id="studio-out"
              value={piece?.text ?? ""}
              onChange={(e) => setPiece((p) => (p ? { ...p, text: e.target.value } : p))}
              disabled={!piece}
              rows={20}
              placeholder="The draft lands here. Edit it, then save it to the board or copy it out."
              className="field py-2.5 font-mono text-xs"
            />
            {piece ? (
              <p className="text-xs text-muted">
                {boardLabel.get(piece.brandId)} · {formatLabel.get(piece.format) ?? piece.format}
                {piece.harness ? ` · ${piece.harness} · ${piece.model}` : piece.via ? ` · ${piece.via}` : ""}. {piece.note}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={generate} className="grid content-start gap-3 panel p-4">
            <label className={LABEL} htmlFor="studio-post-brief">
              Brief
              <textarea
                id="studio-post-brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={7}
                maxLength={4000}
                placeholder="What the posts are about: the news, the offer, the dates, the link. Facts only."
                className="field py-2.5"
              />
            </label>
            <label className={LABEL} htmlFor="studio-count">
              How many
              <select id="studio-count" value={count} onChange={(e) => setCount(Number(e.target.value))} className={INPUT}>
                {[3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} posts
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-2 text-sm">
              <legend className="mb-2 font-medium">Networks</legend>
              {board?.platforms.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {board.platforms.map((p) => (
                    <label key={p} className="inline-flex min-h-10 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={platforms.includes(p)}
                        onChange={(e) => setPlatforms((list) => (e.target.checked ? [...list, p] : list.filter((x) => x !== p)))}
                      />
                      {PLATFORM_NAME[p]}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-muted">This board has no networks yet. Add them on the desk.</p>
              )}
            </fieldset>
            <button type="submit" disabled={!canRun || !platforms.length} className="btn-primary justify-self-start">
              {busy === "posts" ? "Generating" : "Generate drafts"}
            </button>
            <p className="text-xs text-muted">Posts land on the board as drafts. Nothing is approved or scheduled until someone does it on the desk.</p>
          </form>
          <div className="grid content-start gap-3 panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow text-muted">On the board</p>
              {posts ? (
                <Link href={`/desk?board=${encodeURIComponent(posts.brandId)}`} className="btn-ghost btn-sm">
                  Open the desk
                </Link>
              ) : null}
            </div>
            {posts ? (
              <>
                <ol className="grid gap-3">
                  {posts.list.map((p) => (
                    <li key={p.id} className="grid gap-1 border-t border-line pt-3 first:border-0 first:pt-0">
                      <p className="font-mono text-xs text-muted">
                        {PLATFORM_NAME[p.platform]} · {day(p.slot)}
                      </p>
                      <p className="text-sm font-medium">{p.hook}</p>
                      <p className="whitespace-pre-line text-sm text-muted">{p.caption}</p>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-muted">{posts.note}</p>
              </>
            ) : (
              <p className="text-sm text-muted">Generated drafts show up here, and on the board.</p>
            )}
          </div>
        </div>
      )}

      {/* Saved long-form */}
      <section aria-labelledby="saved" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="saved" className="display text-3xl">
            Saved
          </h2>
          <label className="inline-flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyBoard} onChange={(e) => setOnlyBoard(e.target.checked)} />
            This board only
          </label>
        </div>
        {shownDrafts.length ? (
          <ul className="grid gap-2">
            {shownDrafts.map((d) => (
              <li key={d.id} className={`flex flex-wrap items-center justify-between gap-3 panel p-3 ${editingId === d.id ? "border-ink" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="font-mono text-xs text-muted">
                    {boardLabel.get(d.brandId) ?? d.brandId} · {formatLabel.get(d.format) ?? d.format} · {day(d.updatedAt)}
                    {d.harness ? ` · ${d.harness} · ${d.model}` : d.via ? ` · ${d.via}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => open(d)} className="btn-ghost btn-sm">
                    Open
                  </button>
                  <button type="button" onClick={() => remove(d)} className="btn-danger btn-sm" aria-label={`Delete ${d.title}`}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing saved{onlyBoard ? " for this board" : ""} yet. Write a piece and press Save to board.</p>
        )}
      </section>
    </div>
  );
}
