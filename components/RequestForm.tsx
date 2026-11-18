"use client";

import { useState } from "react";
import { PACKAGES, type PackageId } from "@/lib/types";

const ORDER: PackageId[] = ["event", "starter", "growth", "accelerator"];

export function RequestForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          company: data.get("company"),
          packageId: data.get("packageId"),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus("error");
        setError(body.error || "The request didn't send.");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setError("The desk didn't answer. Send it again.");
    }
  }

  if (status === "done") {
    return (
      <p role="status" className="border border-tape px-4 py-4 text-paper">
        Requested. We'll answer that email. Nothing was charged.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm" htmlFor="name">
          Name
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            className="min-h-10 border border-line bg-ink px-3 text-paper"
          />
        </label>
        <label className="grid gap-2 text-sm" htmlFor="email">
          Email
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="min-h-10 border border-line bg-ink px-3 text-paper"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm" htmlFor="company">
        Company
        <input
          id="company"
          name="company"
          autoComplete="organization"
          required
          className="min-h-10 border border-line bg-ink px-3 text-paper"
        />
      </label>
      <label className="grid gap-2 text-sm" htmlFor="packageId">
        Package
        <select
          id="packageId"
          name="packageId"
          defaultValue="event"
          className="min-h-10 border border-line bg-ink px-3 text-paper"
        >
          {ORDER.map((id) => (
            <option key={id} value={id}>
              {PACKAGES[id].name} · {PACKAGES[id].price}
            </option>
          ))}
        </select>
      </label>
      {status === "error" ? (
        <p role="alert" className="text-sm text-heat">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "sending"}
        className="min-h-10 justify-self-start bg-tape px-4 font-mono text-xs uppercase tracking-[0.14em] text-ink disabled:opacity-60"
      >
        {status === "sending" ? "Sending" : "Start a campaign"}
      </button>
    </form>
  );
}
