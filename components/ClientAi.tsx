"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LABEL } from "@/lib/ui";

async function post(url: string, body: unknown): Promise<string> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => ({}))) as { notice?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || "That didn't work. Try again.");
  return payload.notice ?? "Done.";
}

/** A client drafting a week onto their own board. LiftPage reviews before anything is scheduled. */
export function ClientWeekForm() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg({});
    try {
      setMsg({ ok: await post("/api/run", { brief }) });
      setBrief("");
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof Error ? err.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 panel p-4">
      <label className={LABEL} htmlFor="client-week">
        Draft a week of posts
        <textarea
          id="client-week"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="What this week should push: a launch, an offer, an event. Give the facts; nothing gets made up."
          className="field py-2.5"
        />
      </label>
      <button type="submit" disabled={busy || brief.trim().length < 8} className="btn-primary justify-self-start">
        {busy ? "Writing the week" : "Draft the week"}
      </button>
      {msg.ok ? <p className="text-sm text-accent">{msg.ok}</p> : null}
      {msg.error ? (
        <p role="alert" className="text-sm text-danger">
          {msg.error}
        </p>
      ) : null}
    </form>
  );
}

/** Under one of the client's draft posts: say what to change, get a rewrite. */
export function RedraftPost({ postId }: { postId: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg({});
    try {
      setMsg({ ok: await post("/api/revise", { postId, instruction: ask }) });
      setAsk("");
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof Error ? err.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2 border-t border-line pt-3">
      <label className="grid gap-1 text-xs text-muted" htmlFor={`redraft-${postId}`}>
        Redraft with AI
        <input
          id={`redraft-${postId}`}
          value={ask}
          onChange={(event) => setAsk(event.target.value)}
          maxLength={600}
          placeholder="What to change"
          className="field text-sm"
        />
      </label>
      <button type="submit" disabled={busy || ask.trim().length < 3} className="btn-ghost btn-sm justify-self-start">
        {busy ? "Redrafting" : "Redraft"}
      </button>
      {msg.ok ? <p className="text-xs text-accent">{msg.ok}</p> : null}
      {msg.error ? (
        <p role="alert" className="text-xs text-danger">
          {msg.error}
        </p>
      ) : null}
    </form>
  );
}
