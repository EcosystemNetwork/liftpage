"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { sendMessage } from "@/app/actions/messages";
import { formatStamp } from "@/lib/time";
import type { Message, Role } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { Message as Notice, Submit } from "./forms";

const POLL_MS = 15_000;

/**
 * A client's thread with LiftPage. The same component serves both sides: `viewer` decides
 * which messages sit on the right ("mine") and who the other side is. New messages arrive
 * by re-rendering the page every 15 seconds while the tab is visible.
 */
export function MessageThread({
  messages,
  viewer,
  clientId,
  otherName,
}: {
  messages: Message[];
  viewer: Role;
  /** Admins say whose thread they're writing in. Clients always write in their own. */
  clientId?: string;
  otherName: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(sendMessage, undefined);
  const list = useRef<HTMLOListElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  // Keep the newest message in view as the thread grows.
  const last = messages.at(-1)?.id;
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);

  const lastMine = [...messages].reverse().find((m) => m.role === viewer);

  return (
    <div className="grid gap-4">
      {messages.length ? (
        <ol ref={list} aria-label="Messages" className="grid max-h-[28rem] gap-3 overflow-y-auto border border-line p-3">
          {messages.map((m) => {
            const mine = m.role === viewer;
            return (
              <li key={m.id} className={`grid max-w-[85%] gap-1 ${mine ? "justify-self-end text-right" : "justify-self-start"}`}>
                <span className={`${KICKER} text-mute`}>
                  {mine ? "You" : m.role === "admin" ? `${m.authorName} · LiftPage` : m.authorName} · {formatStamp(m.at)}
                </span>
                <p className={`whitespace-pre-wrap break-words px-3 py-2 text-left ${mine ? "bg-tape text-ink" : "border border-line"}`}>{m.text}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="border border-line px-4 py-6 text-mute">No messages yet. Write to {otherName} below.</p>
      )}
      {lastMine ? (
        <p className={`${KICKER} -mt-2 text-right text-mute`} aria-live="polite">
          {lastMine.readAt ? `Seen by ${otherName} · ${formatStamp(lastMine.readAt)}` : "Not seen yet"}
        </p>
      ) : null}

      <form ref={form} action={action} className="grid gap-2">
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
        <label className="grid gap-2 text-sm">
          <span className="sr-only">Message to {otherName}</span>
          <textarea
            name="text"
            required
            rows={3}
            maxLength={4000}
            defaultValue={state?.fields?.text}
            placeholder={`Message ${otherName}`}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                form.current?.requestSubmit();
              }
            }}
            className="border border-line bg-ink px-3 py-2 text-paper"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Submit busy="Sending">Send</Submit>
          <span className="font-mono text-[11px] text-mute">Ctrl/⌘ + Enter</span>
        </div>
        {state?.error ? <Notice state={state} /> : null}
      </form>
    </div>
  );
}
