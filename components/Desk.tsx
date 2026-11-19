"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CampaignCommand } from "@/components/CampaignCommand";
import { dayKey, formatClock, formatDay, formatSlot } from "@/lib/time";
import { PACKAGES, PLATFORM_NAME, PLATFORMS, type DeskFile, type Platform, type Post, type Status } from "@/lib/types";

const MARK: Record<Platform, string> = {
  x: "X",
  instagram: "IG",
  tiktok: "TT",
  linkedin: "IN",
  youtube: "YT",
};

type Flash = { tone: "ok" | "error"; text: string };

export function Desk({ initial, flash }: { initial: DeskFile; flash?: Flash }) {
  const [desk, setDesk] = useState(initial);
  const [selected, setSelected] = useState(initial.posts[0]?.id ?? "");
  const [draft, setDraft] = useState<Post | undefined>(initial.posts[0]);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(flash?.tone === "error" ? flash.text : "");
  const [notice, setNotice] = useState(flash?.tone === "ok" ? flash.text : "");
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reply, setReply] = useState("");
  const [redrafting, setRedrafting] = useState(false);
  const [instruction, setInstruction] = useState("");
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

  // Load the draft only when the operator picks another line. Saving must not wipe the field they are in.
  function pick(id: string, posts: Post[] = desk.posts) {
    setSelected(id);
    const post = posts.find((item) => item.id === id);
    if (post) setDraft(post);
  }

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

  const brandId = desk.brand.id;

  /** Calls a desk API. Takes the fresh desk even from a failed call, so state stays honest. */
  async function send(url: string, body: unknown, method: "POST" | "PATCH" = "PATCH"): Promise<{ desk: DeskFile; notice?: string }> {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { desk?: DeskFile; error?: string; notice?: string };
    if (payload.desk) {
      setDesk(payload.desk);
      const fresh = payload.desk.posts.find((item) => item.id === selected);
      if (fresh && draft) setDraft({ ...fresh, hook: draft.hook, caption: draft.caption, visual: draft.visual, reply: draft.reply });
    }
    if (!response.ok || !payload.desk) {
      throw new Error(payload.error || "The desk didn't answer.");
    }
    return { desk: payload.desk, notice: payload.notice };
  }

  /** A campaign finished: load the fresh board and open its first draft. */
  const takeCampaign = useCallback(
    async (postIds: string[]) => {
      try {
        const response = await fetch(`/api/desk?board=${encodeURIComponent(brandId)}`);
        const payload = (await response.json()) as { desk?: DeskFile };
        if (!payload.desk) return;
        setDesk(payload.desk);
        const first = postIds.find((id) => payload.desk!.posts.some((post) => post.id === id));
        if (first) {
          setSelected(first);
          setDraft(payload.desk.posts.find((post) => post.id === first));
        }
        setNotice(`Campaign ready: ${postIds.length} drafts on the board. Review and approve before anything is cued.`);
      } catch {
        setError("The campaign finished, but the board didn't reload. Refresh the page.");
      }
    },
    [brandId],
  );

  async function cutWeek() {
    setBusy(true);
    setError("");
    try {
      const { desk: next } = await send("/api/run", { brief, brandId }, "POST");
      const run = next.runs[0];
      const first = run?.postIds[0];
      if (first) pick(first, next.posts);
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
      const { notice } = await send("/api/posts", { id: draft.id, status });
      setNotice(notice ?? `Marked ${status}.`);
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
      const { desk: next } = await send("/api/posts", {
        id: draft.id,
        hook: draft.hook,
        caption: draft.caption,
        visual: draft.visual,
        reply: draft.reply,
      });
      const saved = next.posts.find((item) => item.id === draft.id);
      if (saved) setDraft(saved);
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
      await send("/api/brand", { brandId, voice, offers, platforms: desk.brand.platforms });
      setEditingVoice(false);
      setNotice("Voice card saved. The next cut uses it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice didn't save.");
    }
  }

  async function publishNow() {
    if (!draft) return;
    setPublishing(true);
    setError("");
    try {
      const { notice } = await send("/api/publish", { id: draft.id }, "POST");
      setNotice(notice ?? "Published.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "It didn't publish.");
    } finally {
      setPublishing(false);
    }
  }

  /** Straight to Supabase Storage on a signed URL, then the path goes on the post. */
  async function upload(file: File) {
    if (!draft) return;
    setUploading(true);
    setError("");
    try {
      const response = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: draft.id, type: file.type, size: file.size }),
      });
      const ticket = (await response.json().catch(() => ({}))) as { path?: string; signedUrl?: string; type?: string; error?: string };
      if (!response.ok || !ticket.signedUrl || !ticket.path) throw new Error(ticket.error || "No upload slot.");
      const put = await fetch(ticket.signedUrl, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!put.ok) throw new Error(`Storage refused the file (${put.status}).`);
      await send("/api/posts", { id: draft.id, mediaPath: ticket.path, mediaType: ticket.type });
      setNotice("Media attached.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function dropMedia() {
    if (!draft) return;
    try {
      await send("/api/posts", { id: draft.id, mediaPath: null });
      setNotice("Media removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove it.");
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !reply.trim()) return;
    try {
      await send("/api/notes", { postId: draft.id, text: reply }, "POST");
      setReply("");
      setNotice("Note sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The note didn't save.");
    }
  }

  /** Rewrites the open post against its review notes. Takes the new words into the editor. */
  async function redraft() {
    if (!draft) return;
    setRedrafting(true);
    setError("");
    try {
      const { desk: next, notice } = await send("/api/revise", { postId: draft.id, instruction }, "POST");
      const fresh = next.posts.find((item) => item.id === draft.id);
      if (fresh) setDraft(fresh);
      setInstruction("");
      setNotice(notice ?? "Redrafted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The redraft failed.");
    } finally {
      setRedrafting(false);
    }
  }

  async function askReview() {
    setError("");
    try {
      const { notice } = await send("/api/review-request", { brandId }, "POST");
      setNotice(notice ?? "Asked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't ask the client.");
    }
  }

  async function unplug(platform: Platform) {
    try {
      await send(`/api/social/${platform}/disconnect`, { brandId }, "POST");
      setNotice(`${PLATFORM_NAME[platform]} disconnected.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect.");
    }
  }

  const board = desk.boards.find((item) => item.id === brandId);
  const live = draft ? desk.posts.find((item) => item.id === draft.id) : undefined;

  return (
    <div className="rise">
      <p className="sr-only" role="status">
        {notice}
      </p>
      <div className="grid lg:grid-cols-[16.5rem_minmax(0,1fr)_22rem]">
        <section className="border-b border-line px-4 py-5 lg:col-start-2 lg:row-start-1 lg:border-r lg:px-6" aria-busy={busy}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-lg font-semibold">LaunchLoop</h1>
            {desk.boards.length > 1 ? (
              <nav aria-label="Boards" className="flex flex-wrap gap-1 eyebrow">
                {desk.boards.map((item) => (
                  <Link
                    key={item.id}
                    href={`/desk?board=${item.id}`}
                    aria-current={item.id === brandId ? "page" : undefined}
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 ${item.id === brandId ? "border-ink bg-ink text-canvas" : "border-line text-muted hover:text-ink"}`}
                  >
                    {item.company ?? item.name}
                    {item.clientId ? "" : " · house"}
                  </Link>
                ))}
              </nav>
            ) : null}
            <p className="eyebrow text-muted">
              {clock} PT · {counts.draft} draft · {counts.approved} approved · {counts.cued} cued
            </p>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted">
            {desk.brand.name}
            {board?.clientId ? " · client board. The client reviews it from their account." : " · house board."} Cued lines post at their
            slot on the connected network.
          </p>
          <CampaignCommand brandId={brandId} onDrafts={takeCampaign} />
          <label className="mt-5 grid gap-2 text-sm" htmlFor="brief">
            Brief for the next cut
            <textarea
              id="brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={4}
              placeholder="A customer to name, a feature to show, an offer line, a livestream link."
              className="field py-3"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={cutWeek}
              disabled={busy || brief.trim().length < 8}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? "Cutting" : "Cut the day"}
            </button>
            {board?.clientId ? (
              <button
                type="button"
                onClick={askReview}
                disabled={counts.draft === 0}
                className="btn-ghost"
              >
                Ask the client to review
              </button>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : notice ? (
              <p className="max-w-xl text-sm text-muted">{notice}</p>
            ) : null}
          </div>
          {desk.posts.length === 0 ? (
            <p className="mt-8 panel px-5 py-6 text-sm">
              No cues yet. Drop the day&apos;s notes and cut.
            </p>
          ) : (
            <div className="mt-6">
              {groups.map(([key, posts]) => (
                <section key={key} className="mt-4">
                  <h2 className="eyebrow text-muted">
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
                            onClick={() => pick(post.id)}
                            className={`flex min-h-16 w-full items-center gap-3 px-2 py-2 text-left ${on ? "bg-card shadow-card" : "hover:bg-card"}`}
                          >
                            <span
                              aria-hidden
                              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-sunken font-mono text-[11px]"
                            >
                              {MARK[post.platform]}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="sr-only">{PLATFORM_NAME[post.platform]}</span>
                              <span className="block truncate text-sm">{post.hook}</span>
                              <span className="mt-1 block eyebrow text-muted">
                                {formatSlot(post.slot)}
                                {passed && post.status === "draft" ? " · passed" : ""}
                              </span>
                            </span>
                            <StatusMark status={post.status} publish={post.publishState} notes={post.notes.length} sentBack={post.notes.at(-1)?.kind === "changes" && post.status === "draft"} />
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
                <p className="eyebrow text-muted">
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
                  className="field py-3"
                />
              </label>
              <Field label="Visual" id="visual" value={draft.visual} onChange={(visual) => setDraft({ ...draft, visual })} />
              <Field label="First reply" id="reply" value={draft.reply} onChange={(reply) => setDraft({ ...draft, reply })} />
              <div className="grid gap-2 text-sm">
                <span>Media</span>
                {live?.mediaUrl ? (
                  <div className="grid gap-2">
                    {live.mediaType?.startsWith("video/") ? (
                      <video src={live.mediaUrl} controls className="max-h-56 w-full rounded-xl border border-line bg-card" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={live.mediaUrl} alt={draft.visual || "Post media"} className="max-h-56 w-full rounded-xl border border-line object-contain" />
                    )}
                    <button type="button" onClick={dropMedia} className="min-h-9 justify-self-start eyebrow text-muted">
                      Remove media
                    </button>
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                  disabled={uploading}
                  aria-label="Upload media for this line"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                  className="text-xs text-muted file:mr-3 file:min-h-9 file:rounded-full file:border file:border-line file:bg-card file:px-3 file:text-xs file:font-medium file:text-ink"
                />
                {uploading ? <span className="text-xs text-muted">Uploading…</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-ghost btn-sm"
                >
                  {saving ? "Saving" : "Save line"}
                </button>
                <button type="button" onClick={() => setStatus("approved")} className="btn-ghost btn-sm">
                  Approve
                </button>
                <button type="button" onClick={() => setStatus("cued")} className="btn-primary">
                  Cue
                </button>
                <button type="button" onClick={() => setStatus("draft")} className="min-h-10 px-3 eyebrow text-muted">
                  Draft
                </button>
              </div>
              {live ? (
                <div className="grid gap-2 border-t border-line pt-4 text-sm">
                  <p className="eyebrow text-muted">
                    Network · {PUBLISH_LABEL[live.publishState]}
                  </p>
                  {live.publishedUrl ? (
                    <a href={live.publishedUrl} target="_blank" rel="noreferrer" className="link">
                      See it on {PLATFORM_NAME[live.platform]}
                    </a>
                  ) : null}
                  {live.publishError ? <p className={live.publishState === "failed" ? "text-danger" : "text-muted"}>{live.publishError}</p> : null}
                  {live.publishState !== "published" ? (
                    <button
                      type="button"
                      onClick={publishNow}
                      disabled={publishing || live.publishState === "publishing" || live.status === "draft"}
                      className="btn-ghost btn-sm justify-self-start border-accent text-accent"
                    >
                      {publishing ? "Publishing" : "Publish now"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </form>
          ) : (
            <p className="text-sm text-muted">Select a line on the board.</p>
          )}
          {live && (live.notes.length > 0 || board?.clientId) ? (
            <section aria-labelledby="notes" className="mt-6 border-t border-line pt-4">
              <h3 id="notes" className="eyebrow text-muted">
                Review
              </h3>
              {live.notes.length ? (
                <ul className="mt-2 grid gap-3">
                  {live.notes.map((note) => (
                    <li key={note.id} className="text-sm">
                      <span className={`eyebrow ${note.kind === "changes" ? "text-danger" : note.kind === "approved" ? "text-accent" : "text-muted"}`}>
                        {note.authorName} · {NOTE_LABEL[note.kind]} · {formatSlot(note.at)}
                      </span>
                      {note.text ? <span className="mt-1 block whitespace-pre-wrap">{note.text}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No review yet.</p>
              )}
              <form onSubmit={sendReply} className="mt-3 grid gap-2">
                <label className="grid gap-2 text-sm" htmlFor="reply-note">
                  Note to the client
                  <textarea id="reply-note" value={reply} onChange={(event) => setReply(event.target.value)} rows={2} className="field py-2.5" />
                </label>
                <button type="submit" disabled={!reply.trim()} className="btn-ghost btn-sm justify-self-start">
                  Send note
                </button>
              </form>
              {live.status !== "cued" && live.publishState !== "published" ? (
                <div className="mt-4 grid gap-2 border-t border-line pt-4">
                  <label className="grid gap-2 text-sm" htmlFor="redraft-ask">
                    Redraft with AI
                    <input
                      id="redraft-ask"
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      placeholder="Optional: what else to change"
                      className="field"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={redraft}
                    disabled={redrafting || (!instruction.trim() && !live.notes.some((note) => note.kind !== "approved" && note.text.trim()))}
                    className="btn-ghost btn-sm justify-self-start"
                  >
                    {redrafting ? "Redrafting" : "Redraft from the notes"}
                  </button>
                  <p className="text-xs text-muted">Rewrites this post against the review above. It stays a draft until the client approves again.</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>

        <aside className="border-b border-line px-4 py-5 lg:col-start-1 lg:row-start-1 lg:border-r lg:px-5">
          <p className="eyebrow text-accent">{board?.clientId ? "Client board" : "House board"}</p>
          <h2 className="mt-2 text-xl font-semibold leading-tight">{desk.brand.name}</h2>
          <p className="mt-1 font-mono text-[11px] text-muted">{desk.brand.handle}</p>
          <p className="mt-4 text-sm text-ink">{desk.brand.offers}</p>
          {editingVoice ? (
            <form onSubmit={saveVoice} className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm" htmlFor="voice">
                Voice
                <textarea id="voice" value={voice} onChange={(event) => setVoice(event.target.value)} rows={4} className="field py-2.5" />
              </label>
              <label className="grid gap-2 text-sm" htmlFor="offers">
                Offer
                <textarea id="offers" value={offers} onChange={(event) => setOffers(event.target.value)} rows={3} className="field py-2.5" />
              </label>
              <button type="submit" className="justify-self-start btn-primary">
                Save voice
              </button>
            </form>
          ) : (
            <>
              <p className="mt-4 text-sm text-muted">{desk.brand.voice}</p>
              <button type="button" onClick={() => setEditingVoice(true)} className="mt-3 min-h-10 eyebrow text-ink">
                Edit voice
              </button>
            </>
          )}
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="eyebrow text-muted">Networks</h3>
            <ul className="mt-2 grid gap-2">
              {PLATFORMS.filter((platform) => desk.brand.platforms.includes(platform) || desk.connections.some((c) => c.platform === platform)).map((platform) => {
                const link = desk.connections.find((c) => c.platform === platform);
                const can = desk.connectable.includes(platform);
                return (
                  <li key={platform} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-sm">
                    <span>
                      <span className="eyebrow text-muted">{MARK[platform]} </span>
                      {link ? link.accountName : <span className="text-muted">{PLATFORM_NAME[platform]} · not connected</span>}
                    </span>
                    <span className="flex gap-2 eyebrow">
                      {can ? (
                        <a href={`/api/social/${platform}/connect?board=${encodeURIComponent(brandId)}`} className="inline-flex min-h-9 items-center text-accent">
                          {link ? "Reconnect" : "Connect"}
                        </a>
                      ) : link ? null : (
                        <span className="inline-flex min-h-9 items-center text-muted" title="Set this network's app keys and LIFTPAGE_TOKEN_KEY">
                          No app keys
                        </span>
                      )}
                      {link ? (
                        <button type="button" onClick={() => unplug(platform)} className="min-h-9 uppercase text-muted">
                          Drop
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="eyebrow text-muted">Last cut</h3>
            <p className="mt-2 text-sm">{desk.runs[0]?.note ?? "No cut yet."}</p>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="eyebrow text-muted">Requests</h3>
            {desk.holds.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None yet. The public page takes them.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {desk.holds.slice(0, 6).map((hold) => (
                  <li key={hold.id} className="text-sm">
                    {hold.company}
                    <span className="mt-1 block eyebrow text-muted">
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
        className="field"
      />
    </label>
  );
}

const PUBLISH_LABEL: Record<Post["publishState"], string> = {
  idle: "not sent",
  scheduled: "scheduled for the slot",
  publishing: "publishing",
  published: "published",
  failed: "failed",
};

const NOTE_LABEL = { approved: "approved", changes: "asked for changes", comment: "comment" } as const;

function StatusMark({ status, publish, notes, sentBack }: { status: Status; publish: Post["publishState"]; notes: number; sentBack: boolean }) {
  const label = publish === "published" ? "live" : publish === "failed" ? "failed" : sentBack ? "changes" : status;
  const strong = status === "cued" || publish === "published";
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 eyebrow text-[10px] ${
        publish === "failed" || sentBack ? "bg-danger-soft text-danger" : strong ? "bg-ink text-canvas" : "text-muted"
      }`}
    >
      {label}
      {notes ? <span aria-label={`${notes} review notes`}>· {notes}</span> : null}
    </span>
  );
}
