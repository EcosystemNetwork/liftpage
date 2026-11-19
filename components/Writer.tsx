"use client";

import { useState } from "react";
import { INPUT, LABEL } from "@/lib/ui";

type Option = { id: string; label: string; hint?: string };

/** Admin writing desk: pick a board and a format, give a brief, get copy back to edit and send. */
export function Writer({ boards, formats, ready }: { boards: Option[]; formats: Option[]; ready: boolean }) {
  const [brandId, setBrandId] = useState(boards[0]?.id ?? "");
  const [format, setFormat] = useState(formats[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function write(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, format, brief }),
      });
      const payload = (await response.json().catch(() => ({}))) as { text?: string; note?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || "Nothing came back.");
      setText(payload.text);
      setNote(payload.note ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The write failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't reach the clipboard. Select the text and copy it.");
    }
  }

  const hint = formats.find((f) => f.id === format)?.hint;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={write} className="grid content-start gap-3 panel p-4">
        {boards.length > 1 ? (
        <label className={LABEL} htmlFor="writer-board">
          Board
          <select id="writer-board" value={brandId} onChange={(event) => setBrandId(event.target.value)} className={INPUT}>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.label}
              </option>
            ))}
          </select>
        </label>
        ) : null}
        <label className={LABEL} htmlFor="writer-format">
          What to write
          <select id="writer-format" value={format} onChange={(event) => setFormat(event.target.value)} className={INPUT}>
            {formats.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {hint ? <p className="-mt-1 text-xs text-muted">For {hint}.</p> : null}
        <label className={LABEL} htmlFor="writer-brief">
          Brief
          <textarea
            id="writer-brief"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            rows={7}
            maxLength={6000}
            placeholder="The facts: what's happening, when, who it's for, links, numbers, names. The model won't invent any."
            className="field py-2.5"
          />
        </label>
        <button type="submit" disabled={busy || !ready || brief.trim().length < 8 || !brandId} className="btn-primary justify-self-start">
          {busy ? "Writing" : "Write it"}
        </button>
        {!ready ? <p className="text-sm text-danger">Set TOKENROUTER_API_KEY or HARNESSROUTER_API_KEY to turn this on.</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
      <div className="grid content-start gap-2 panel p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow text-muted">Draft</p>
          <button type="button" onClick={copy} disabled={!text} className="btn-ghost btn-sm">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <label htmlFor="writer-out" className="sr-only">
          Draft
        </label>
        <textarea
          id="writer-out"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={18}
          placeholder="The draft lands here. Edit it before it goes anywhere."
          className="field py-2.5 font-mono text-xs"
        />
        {note ? <p className="text-xs text-muted">{note}</p> : null}
      </div>
    </div>
  );
}
