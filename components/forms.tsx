"use client";

import { useFormStatus } from "react-dom";


export function Submit({ children, busy, className = "" }: { children: React.ReactNode; busy?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn-primary disabled:opacity-60 ${className}`}
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
      className={`${tone === "heat" ? "btn-danger" : "btn-ghost"} btn-sm`}
    >
      {children}
    </button>
  );
}

export function Message({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-ink">
        {state.ok}
      </p>
    );
  return null;
}
