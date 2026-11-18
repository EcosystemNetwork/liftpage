"use client";

import { useEffect, useMemo, useState } from "react";
import { dayKey, formatClock, formatDay, formatSlot } from "@/lib/time";
import { PACKAGES, PLATFORM_NAME, type DeskFile, type Platform, type Post, type Status } from "@/lib/types";

const MARK: Record<Platform, string> = {
  x: "X",
  instagram: "IG",
  tiktok: "TT",
  linkedin: "IN",
  youtube: "YT",
};

export function Desk({ initial }: { initial: DeskFile }) {
  const [desk, setDesk] = useState(initial);
  const [selected, setSelected] = useState(initial.posts[0]?.id ?? "");
  const [draft, setDraft] = useState<Post | undefined>(initial.posts[0]);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState("");
  const [editingVoice, setEditingVoice] = useState(false);
  const [voice, setVoice] = useState(initial.brand.voice);
  const [offers, setOffers] = useState(initial.brand.offers);

  useEffect(() => {
    const tick = () => setClock(formatClock());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const post = desk.posts.find((item) => item.id === selected);
    if (post) setDraft(post);
    // Only when the operator picks another line. Saving must not wipe the field they are in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const groups = useMemo(() => {
    const map = new Map<string, Post[]>();
    const sorted = [...desk.posts].sort((a, b) => a.slot.localeCompare(b.slot));
    for (const post of sorted) {
      const key = dayKey(post.slot);
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [desk.posts]);

  const counts = {
    draft: desk.posts.filter((post) => post.status === "draft").length,
    approved: desk.posts.filter((post) => post.status === "approved").length,
    cued: desk.posts.filter((post) => post.status === "cued").length,
  };

  async function send(url: string, body: unknown) {
    const response = await fetch(url, {
      method: url.endsWith("/run") || url.endsWith("/hold") ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { desk?: DeskFile; error?: string };
    if (!response.ok || !payload.desk) {
      throw new Error(payload.error || "The desk didn't answer.");
    }
    return payload.desk;
  }

  async function cutWeek() {
    setBusy(true);
    setError("");
    try {
      const next = await send("/api/run", { brief });
      setDesk(next);
      const run = next.runs[0];
      const first = run?.postIds[0];
      if (first) setSelected(first);
      setNotice(run?.note || "Week cut.");
      setBrief("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The cut failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: Status) {
    if (!draft) return;
    setError("");
    try {
      const next = await send("/api/posts", { id: draft.id, status });
      setDesk(next);
      setNotice(status === "cued" ? "Cued on this desk. Nothing was sent to a network." : `Marked ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status didn't save.");
    }
  }

  async function saveLine(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const next = await send("/api/posts", {
        id: draft.id,
        hook: draft.hook,
        caption: draft.caption,
        visual: draft.visual,
        reply: draft.reply,
      });
      setDesk(next);
      setNotice("Line saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The line didn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function saveVoice(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const next = await send("/api/brand", { voice, offers, platforms: desk.brand.platforms });
      setDesk(next);
      setEditingVoice(false);
      setNotice("Voice card saved. The next cut uses it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice didn't save.");
    }
  }

  return (
    <div className="rise">
      <p className="sr-only" role="status">
        {notice}
      </p>
      <div className="grid lg:grid-cols-[16.5rem_minmax(0,1fr)_22rem]">
        <section className="border-b border-line px-4 py-5 lg:col-start-2 lg:row-start-1 lg:border-r lg:px-6" aria-busy={busy}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-lg font-semibold">LaunchLoop</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
              {clock} PT · {counts.draft} draft · {counts.approved} approved · {counts.cued} cued
            </p>
          </div>
          <p className="mt-2 max-w-xl text-sm text-mute">
            {desk.brand.name} · four-day pilot. Cued means cleared on this desk. Nothing posts to a network yet.
          </p>
          <label className="mt-5 grid gap-2 text-sm" htmlFor="brief">
            Brief for the next cut
            <textarea
              id="brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={4}
              placeholder="A judge to name, a team to show, a prize line, a livestream link."
              className="border border-line bg-ink px-3 py-3 text-paper"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={cutWeek}
              disabled={busy || brief.trim().length < 8}
              className="min-h-10 bg-tape px-4 font-mono text-xs uppercase tracking-[0.14em] text-ink disabled:opacity-50"
            >
              {busy ? "Cutting" : "Cut the day"}
            </button>
            {error ? (
              <p role="alert" className="text-sm text-heat">
                {error}
              </p>
            ) : notice ? (
              <p className="max-w-xl text-sm text-mute">{notice}</p>
            ) : null}
          </div>
          {desk.posts.length === 0 ? (
            <p className="mt-8 border border-line px-4 py-6 text-sm">
              No cues yet. Drop the day's notes and cut.
            </p>
          ) : (
            <div className="mt-6">
              {groups.map(([key, posts]) => (
                <section key={key} className="mt-4">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
                    {formatDay(posts[0].slot)}
                  </h2>
                  <ul className="mt-2 border-t border-line">
                    {posts.map((post) => {
                      const on = post.id === selected;
                      const passed = new Date(post.slot).getTime() < Date.now();
                      return (
                        <li key={post.id} className="border-b border-line">
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => setSelected(post.id)}
                            className={`flex min-h-16 w-full items-center gap-3 px-2 py-2 text-left ${on ? "bg-panel" : "bg-ink"}`}
                          >
                            <span
                              aria-hidden
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-line font-mono text-[11px]"
                            >
                              {MARK[post.platform]}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="sr-only">{PLATFORM_NAME[post.platform]}</span>
                              <span className="block truncate text-sm">{post.hook}</span>
                              <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-mute">
                                {formatSlot(post.slot)}
                                {passed && post.status === "draft" ? " · passed" : ""}
                              </span>
                            </span>
                            <StatusMark status={post.status} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside className="border-b border-line px-4 py-5 lg:col-start-3 lg:row-start-1 lg:px-5">
          {draft ? (
            <form onSubmit={saveLine} className="grid gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
                  {PLATFORM_NAME[draft.platform]} · {formatSlot(draft.slot)}
                </p>
                <h2 className="mt-2 text-lg font-semibold">The line</h2>
              </div>
              <Field label="Hook" id="hook" value={draft.hook} onChange={(hook) => setDraft({ ...draft, hook })} />
              <label className="grid gap-2 text-sm" htmlFor="caption">
                Caption
                <textarea
                  id="caption"
                  value={draft.caption}
                  onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
                  rows={7}
                  className="border border-line bg-ink px-3 py-3 text-paper"
                />
              </label>
              <Field label="Visual" id="visual" value={draft.visual} onChange={(visual) => setDraft({ ...draft, visual })} />
              <Field label="First reply" id="reply" value={draft.reply} onChange={(reply) => setDraft({ ...draft, reply })} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-10 border border-line px-3 font-mono text-[11px] uppercase tracking-[0.14em] disabled:opacity-50"
                >
                  {saving ? "Saving" : "Save line"}
                </button>
                <button type="button" onClick={() => setStatus("approved")} className="min-h-10 border border-line px-3 font-mono text-[11px] uppercase tracking-[0.14em]">
                  Approve
                </button>
                <button type="button" onClick={() => setStatus("cued")} className="min-h-10 bg-tape px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink">
                  Cue
                </button>
                <button type="button" onClick={() => setStatus("draft")} className="min-h-10 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                  Draft
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-mute">Select a line on the board.</p>
          )}
        </aside>

        <aside className="border-b border-line px-4 py-5 lg:col-start-1 lg:row-start-1 lg:border-r lg:px-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-tape">First campaign</p>
          <h2 className="mt-2 text-xl font-semibold leading-tight">{desk.brand.name}</h2>
          <p className="mt-1 font-mono text-[11px] text-mute">{desk.brand.handle}</p>
          <p className="mt-4 text-sm text-paper">{desk.brand.offers}</p>
          {editingVoice ? (
            <form onSubmit={saveVoice} className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm" htmlFor="voice">
                Voice
                <textarea id="voice" value={voice} onChange={(event) => setVoice(event.target.value)} rows={4} className="border border-line bg-ink px-3 py-2 text-paper" />
              </label>
              <label className="grid gap-2 text-sm" htmlFor="offers">
                Offer
                <textarea id="offers" value={offers} onChange={(event) => setOffers(event.target.value)} rows={3} className="border border-line bg-ink px-3 py-2 text-paper" />
              </label>
              <button type="submit" className="min-h-10 justify-self-start bg-tape px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink">
                Save voice
              </button>
            </form>
          ) : (
            <>
              <p className="mt-4 text-sm text-mute">{desk.brand.voice}</p>
              <button type="button" onClick={() => setEditingVoice(true)} className="mt-3 min-h-10 font-mono text-[11px] uppercase tracking-[0.14em] text-paper">
                Edit voice
              </button>
            </>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
            {desk.brand.platforms.map((platform) => (
              <div key={platform} className="border border-line px-2 py-2">
                <dt className="text-mute">{MARK[platform]}</dt>
                <dd>{PLATFORM_NAME[platform]}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Last cut</h3>
            <p className="mt-2 text-sm">{desk.runs[0]?.note ?? "No cut yet."}</p>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Requests</h3>
            {desk.holds.length === 0 ? (
              <p className="mt-2 text-sm text-mute">None yet. The public page takes them.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {desk.holds.slice(0, 6).map((hold) => (
                  <li key={hold.id} className="text-sm">
                    {hold.company}
                    <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-mute">
                      {PACKAGES[hold.packageId].name} · {hold.email}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm" htmlFor={id}>
      {label}
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 border border-line bg-ink px-3 text-paper"
      />
    </label>
  );
}

function StatusMark({ status }: { status: Status }) {
  const cued = status === "cued";
  return (
    <span
      className={`inline-flex min-h-10 items-center px-2 font-mono text-[11px] uppercase tracking-[0.14em] ${cued ? "bg-tape text-ink" : "text-mute"}`}
    >
      {status}
    </span>
  );
}
