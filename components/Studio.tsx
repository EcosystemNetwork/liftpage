"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/*
 * Content studio: ask the content agent for posts, carousels or video scripts, watch it work,
 * read the drafts and files, and send feedback as follow-ups. Talks only to /api/studio/*.
 */

type FileView = { index: number; name: string; path: string; bytes: number; kind: "image" | "pdf" | "office" | "html" | "text" | "other"; url: string; viewUrl: string | null; previewUrl: string | null };
type Turn = {
  id: string;
  status: "starting" | "in_progress" | "completed" | "incomplete" | "failed" | "cancelled";
  input: string;
  attachments: string[];
  answer: string | null;
  error: string | null;
  notice: string | null;
  files: FileView[];
  createdAt: string;
};
type Thread = { threadId: string; turns: Turn[]; canContinue: boolean };
type Summary = { id: string; title: string; status: Turn["status"]; turns: number; updatedAt: string };

const TERMINAL = new Set(["completed", "incomplete", "failed", "cancelled"]);
const LABEL: Record<Turn["status"], string> = {
  starting: "Starting", in_progress: "Working", completed: "Done", incomplete: "Stopped early", failed: "Didn't finish", cancelled: "Cancelled",
};
const PILL: Record<Turn["status"], string> = {
  starting: "bg-accent-soft text-accent", in_progress: "bg-accent-soft text-accent", completed: "bg-sunken text-ink",
  incomplete: "bg-sunken text-muted", failed: "bg-danger-soft text-danger", cancelled: "bg-sunken text-muted",
};
const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv";
const MAX_TOTAL = 4 * 1024 * 1024;

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || "Something went wrong. Try again.");
  return body;
}

/** Phone photos are big; the server takes about 4 MB per request. Shrink large images first. */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_200_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function Composer({ kind, disabled, hint, onSent, threadId }: { kind: "new" | "follow"; disabled?: boolean; hint?: string; threadId?: string; onSent: (threadId: string) => void }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const shrunk = await Promise.all([...list].map(shrink));
    setFiles((now) => [...now, ...shrunk]);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return setError("Tell the agent what you want to make.");
    if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) return setError("Those files are too big together. Keep them under 4 MB, or send fewer.");
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("text", text.trim());
    for (const f of files) form.append("files", f, f.name);
    try {
      const path = kind === "new" ? "/api/studio/threads" : `/api/studio/threads/${encodeURIComponent(threadId!)}`;
      const out = await api<{ threadId: string }>(path, { method: "POST", body: form });
      setText("");
      setFiles([]);
      onSent(out.threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send. Try again."); // the text stays put
    } finally {
      setBusy(false);
    }
  }

  const id = `studio-${kind}`;
  return (
    <form
      onSubmit={send}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void add(e.dataTransfer.files);
      }}
      className={`panel grid gap-3 p-4 ${drag ? "ring-2 ring-accent" : ""}`}
    >
      <label htmlFor={id} className="sr-only">
        {kind === "new" ? "What should the agent make?" : "Feedback or changes"}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        rows={kind === "new" ? 7 : 3}
        maxLength={20000}
        placeholder={
          kind === "new"
            ? "Which company is this for, and what should people do after seeing it? Add the platform (LinkedIn, Instagram, TikTok or Reels), a website link, a brief, or past posts."
            : "Give feedback or ask for changes, e.g. “Make draft 2 shorter and more playful.”"
        }
        className="field py-2.5"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={disabled || busy}>
          Attach files
        </button>
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        <ul className="flex flex-1 flex-wrap gap-1.5" aria-label="Attached files">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full border border-line bg-sunken px-2.5 py-0.5 text-xs">
              {f.name} · {size(f.size)}
              <button type="button" aria-label={`Remove ${f.name}`} className="text-muted hover:text-ink" onClick={() => setFiles((now) => now.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="submit" className="btn-primary" disabled={disabled || busy || !text.trim()}>
          {busy ? "Sending" : kind === "new" ? "Make drafts" : "Send feedback"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </form>
  );
}

function Files({ files }: { files: FileView[] }) {
  const [open, setOpen] = useState<Record<number, string | true>>({});
  if (!files.length) return null;

  async function toggle(f: FileView) {
    if (open[f.index]) {
      return setOpen((o) => {
        const next = { ...o };
        delete next[f.index];
        return next;
      });
    }
    if (f.kind !== "text") return setOpen((o) => ({ ...o, [f.index]: true }));
    setOpen((o) => ({ ...o, [f.index]: "Loading…" }));
    try {
      const res = await fetch(f.viewUrl!, { credentials: "same-origin" });
      const text = res.ok ? await res.text() : "This file has no preview. Download it instead.";
      setOpen((o) => ({ ...o, [f.index]: text }));
    } catch {
      setOpen((o) => ({ ...o, [f.index]: "Couldn't load the preview." }));
    }
  }

  return (
    <div className="mt-5 grid gap-3 border-t border-line pt-4">
      <p className="eyebrow text-muted">{files.length === 1 ? "1 file" : `${files.length} files`}</p>
      {files.map((f) => {
        const shown = open[f.index];
        return (
          <div key={f.index} className="grid gap-3 rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm break-all">{f.path}</span>
              <span className="text-xs text-muted">{size(f.bytes)}</span>
              <span className="ml-auto flex gap-3 text-sm">
                {f.kind !== "image" && f.kind !== "other" ? (
                  <button type="button" className="link" onClick={() => void toggle(f)}>
                    {shown ? "Hide" : "Preview"}
                  </button>
                ) : null}
                {f.previewUrl ? (
                  <a className="link" href={f.previewUrl} target="_blank" rel="noopener noreferrer">
                    Open in new tab
                  </a>
                ) : null}
                <a className="link" href={f.url}>
                  Download
                </a>
              </span>
            </div>
            {f.kind === "image" && f.viewUrl ? (
              <a href={f.viewUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, owner-checked bytes; not for the image optimizer */}
                <img src={f.viewUrl} alt={f.name} loading="lazy" className="max-h-96 rounded-lg" />
              </a>
            ) : null}
            {shown && f.kind === "html" && f.previewUrl ? (
              <iframe title={f.name} src={f.previewUrl} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="h-[520px] w-full rounded-lg border border-line bg-white" />
            ) : null}
            {shown && (f.kind === "pdf" || f.kind === "office") && f.viewUrl ? (
              <iframe title={f.name} src={f.viewUrl} className="h-[520px] w-full rounded-lg border border-line bg-white" />
            ) : null}
            {typeof shown === "string" ? <pre className="max-h-96 overflow-auto rounded-lg bg-sunken p-3 font-mono text-xs whitespace-pre-wrap">{shown}</pre> : null}
          </div>
        );
      })}
    </div>
  );
}

function Working({ since, onCancel }: { since: string; onCancel: () => Promise<void> }) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status">
      <span className="inline-block size-3 animate-spin rounded-full border-2 border-accent-soft border-t-accent motion-reduce:animate-none" aria-hidden="true" />
      <span>
        The agent is working · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </span>
      <button
        type="button"
        className="link ml-auto"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onCancel().finally(() => setBusy(false));
        }}
      >
        Cancel
      </button>
    </div>
  );
}

function TurnCard({ turn, onCancel }: { turn: Turn; onCancel: (id: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const running = !TERMINAL.has(turn.status);
  return (
    <article className="grid gap-3">
      <div className="justify-self-end rounded-2xl bg-sunken px-4 py-3 md:max-w-[85%]">
        <p className="eyebrow mb-1 text-muted">You</p>
        <p className="whitespace-pre-wrap">{turn.input}</p>
        {turn.attachments.length ? <p className="mt-2 text-xs text-muted">Attached: {turn.attachments.join(", ")}</p> : null}
      </div>
      <div className="panel p-5">
        <p className="eyebrow mb-3 flex items-center gap-2 text-muted">
          Content agent <span className={`rounded-full px-2 py-0.5 text-[11px] tracking-normal normal-case ${PILL[turn.status]}`}>{LABEL[turn.status]}</span>
        </p>
        {running ? <Working since={turn.createdAt} onCancel={() => onCancel(turn.id)} /> : null}
        {turn.notice ? <p className="mb-3 rounded-lg bg-sunken px-3 py-2 text-sm">{turn.notice}</p> : null}
        {turn.error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {turn.error}
          </p>
        ) : null}
        {turn.answer ? (
          <>
            <div className="studio-md">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="link">
                      {children}
                    </a>
                  ),
                  img: () => null,
                }}
              >
                {turn.answer}
              </ReactMarkdown>
            </div>
            <button
              type="button"
              className="btn-ghost btn-sm mt-3"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(turn.answer ?? "");
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                } catch {
                  // no clipboard: the text is on screen to select
                }
              }}
            >
              {copied ? "Copied" : "Copy text"}
            </button>
          </>
        ) : null}
        <Files files={turn.files} />
      </div>
    </article>
  );
}

export function Studio({ ready, initialThread }: { ready: boolean; initialThread?: string }) {
  const [threads, setThreads] = useState<Summary[]>([]);
  const [current, setCurrent] = useState<string | null>(initialThread ?? null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");
  // Bumped after feedback is sent, so polling starts again on the same thread.
  const [poll, setPoll] = useState(0);

  // Bumped to reload the list of requests.
  const [listVersion, setListVersion] = useState(0);
  const reloadList = useCallback(() => setListVersion((n) => n + 1), []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const t = await api<Thread>(`/api/studio/threads/${encodeURIComponent(id)}`);
      setThread(t);
      setError("");
      return t;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That request couldn't be loaded.");
      return null;
    }
  }, []);

  const open = useCallback((id: string | null) => {
    setCurrent(id);
    setThread(null);
    setError("");
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("t", id);
    else url.searchParams.delete("t");
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    let live = true;
    api<{ threads: Summary[] }>("/api/studio/threads")
      .then((r) => {
        if (live) setThreads(r.threads);
      })
      .catch(() => undefined); // the list is a convenience; the open thread still works
    return () => {
      live = false;
    };
  }, [listVersion]);

  // Load the open thread, then poll while a task runs: every 3 s, then every 8 s after a minute.
  useEffect(() => {
    if (!current) return;
    let live = true;
    let timer: number | undefined;
    const started = Date.now();
    const tick = () => {
      api<Thread>(`/api/studio/threads/${encodeURIComponent(current)}`)
        .then((t) => {
          if (!live) return;
          setThread(t);
          setError("");
          if (t.turns.some((x) => !TERMINAL.has(x.status))) timer = window.setTimeout(tick, Date.now() - started > 60_000 ? 8000 : 3000);
          else setListVersion((n) => n + 1);
        })
        .catch((err: unknown) => {
          if (live) setError(err instanceof Error ? err.message : "That request couldn't be loaded.");
        });
    };
    tick();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [current, poll]);

  async function cancel(taskId: string) {
    try {
      await api(`/api/studio/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't cancel.");
    }
    if (current) await loadThread(current);
  }

  const busy = thread?.turns.some((t) => !TERMINAL.has(t.status)) ?? false;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr] [&>*]:min-w-0">
      <nav aria-label="Your requests" className="grid content-start gap-2">
        <button type="button" className="btn-primary" onClick={() => open(null)}>
          New request
        </button>
        <p className="eyebrow mt-3 text-muted">Your requests</p>
        {threads.length ? (
          <ul className="grid gap-1">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => open(t.id)}
                  aria-current={t.id === current ? "page" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${t.id === current ? "bg-card shadow-[var(--shadow)]" : "hover:bg-sunken"}`}
                >
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${PILL[t.status]}`}>{LABEL[t.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-sm text-muted">Nothing yet.</p>
        )}
      </nav>

      <div className="grid content-start gap-6">
        {!ready ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            The content agent isn&rsquo;t connected yet. LiftPage needs to add its HarnessRouter key.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {!current ? (
          <section aria-labelledby="studio-new" className="grid gap-3">
            <h2 id="studio-new" className="display text-3xl">
              What are we making?
            </h2>
            <p className="max-w-[70ch] text-muted">
              Name the company and what you want people to do after seeing the content. With no format, you get three posts for the platform you pick: a customer
              question answered, the product in action, and an invitation to take the next step.
            </p>
            <Composer kind="new" disabled={!ready} onSent={(id) => { open(id); reloadList(); }} />
            <p className="text-xs text-muted">Drafts only. Nothing is published or scheduled unless you approve the exact post, account and time.</p>
          </section>
        ) : thread ? (
          <>
            <div className="grid gap-8" aria-live="polite">
              {thread.turns.map((turn) => (
                <TurnCard key={turn.id} turn={turn} onCancel={cancel} />
              ))}
            </div>
            <Composer
              kind="follow"
              threadId={thread.threadId}
              disabled={!ready || !thread.canContinue}
              hint={
                busy
                  ? "You can send feedback once the agent finishes."
                  : thread.canContinue
                    ? "Feedback keeps this request's context. For another company or campaign, start a new request."
                    : "This request never got going. Start a new request instead."
              }
              onSent={() => {
                setPoll((n) => n + 1);
                reloadList();
              }}
            />
          </>
        ) : !error ? (
          <p className="text-muted" role="status">
            Loading…
          </p>
        ) : null}
      </div>
    </div>
  );
}
