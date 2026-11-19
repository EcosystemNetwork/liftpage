"use client";

import { useState } from "react";

/**
 * Sends the buyer to Stripe Checkout for one hold. The server prices it from the hold row;
 * nothing about the amount comes from here.
 */
export function PayButton({ holdId, label = "Pay now", className = "" }: { holdId: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId }),
      });
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(body.error || "Checkout didn't open. Try again.");
        setBusy(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Checkout didn't answer. Try again.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-grid gap-2">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className={`btn-primary disabled:opacity-60 ${className}`}
      >
        {busy ? "Opening checkout" : label}
      </button>
      {error ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
