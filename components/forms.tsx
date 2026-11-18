"use client";

import { useFormStatus } from "react-dom";


export function Submit({ children, busy, className = "" }: { children: React.ReactNode; busy?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-10 bg-tape px-4 font-mono text-xs uppercase tracking-[0.14em] text-ink disabled:opacity-60 ${className}`}
    >
      {pending ? busy || "Working" : children}
    </button>
  );
}

/** A quiet button for row actions. */
export function RowButton({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "heat" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-9 border px-2 font-mono text-[11px] uppercase tracking-[0.12em] disabled:opacity-60 ${
        tone === "heat" ? "border-heat text-heat" : "border-line text-paper"
      }`}
    >
      {children}
    </button>
  );
}

export function Message({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error)
    return (
      <p role="alert" className="text-sm text-heat">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="border border-tape px-3 py-2 text-sm text-paper">
        {state.ok}
      </p>
    );
  return null;
}
