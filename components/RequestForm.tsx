"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PACKAGES, type PackageId } from "@/lib/types";
import { PayButton } from "./PayButton";

const ORDER: PackageId[] = ["event", "starter", "growth", "accelerator"];
/** Same rule as EMAIL in lib/accounts (server-only, so it can't be imported here). The server still checks. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "name" | "email" | "company";
type Errors = Partial<Record<Field, string>>;

function isPackage(value: string | null): value is PackageId {
  return !!value && (ORDER as string[]).includes(value);
}

function check(data: FormData): Errors {
  const value = (key: Field) => String(data.get(key) ?? "").trim();
  const errors: Errors = {};
  if (!value("name")) errors.name = "Add your name.";
  if (!value("email")) errors.email = "Add your email.";
  else if (!EMAIL.test(value("email")) || value("email").length > 120) errors.email = "That email doesn't look usable.";
  if (!value("company")) errors.company = "Add your company.";
  return errors;
}

/**
 * The "Start a campaign" form. With `fromUrl`, a pricing button's `?package=growth`
 * preselects that package. That reads search params, so render it inside <Suspense>.
 */
export function RequestForm({ fromUrl = false }: { fromUrl?: boolean }) {
  return fromUrl ? <FromUrl /> : <Form initial="event" />;
}

function FromUrl() {
  const wanted = useSearchParams().get("package");
  return <Form initial={isPackage(wanted) ? wanted : "event"} />;
}

function Form({ initial }: { initial: PackageId }) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [holdId, setHoldId] = useState("");
  const [packageId, setPackageId] = useState<PackageId>(initial);
  const form = useRef<HTMLFormElement>(null);

  // A later pricing click changes the URL without remounting the form.
  useEffect(() => setPackageId(initial), [initial]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const found = check(data);
    setErrors(found);
    const first = (Object.keys(found) as Field[])[0];
    if (first) {
      form.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
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
      const body = (await response.json().catch(() => ({}))) as { error?: string; holdId?: string };
      if (!response.ok) {
        setStatus("error");
        setError(body.error || "The request didn't send.");
        return;
      }
      setHoldId(body.holdId ?? "");
      setStatus("done");
    } catch {
      setStatus("error");
      setError("That didn't go through. Check your connection and send it again.");
    }
  }

  if (status === "done") {
    return (
      <div role="status" className="grid gap-3 rounded-xl border border-accent/30 bg-accent-soft px-5 py-5 text-ink">
        <p>Requested. A confirmation is on its way to that email, and we&apos;ll answer within a business day. Nothing was charged.</p>
        {holdId ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted">Want the slot held now? Pay the deposit and we start on the brief.</p>
            <PayButton holdId={holdId} label="Pay deposit" />
          </div>
        ) : null}
      </div>
    );
  }

  const input = (name: Field, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="grid gap-2 text-sm" htmlFor={name}>
      {label}
      <input
        id={name}
        name={name}
        required
        className="field"
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        onChange={
          errors[name]
            ? () =>
                setErrors((current) => {
                  const next = { ...current };
                  delete next[name];
                  return next;
                })
            : undefined
        }
        {...props}
      />
      {errors[name] ? (
        <span id={`${name}-error`} className="text-sm text-danger">
          {errors[name]}
        </span>
      ) : null}
    </label>
  );

  return (
    <form ref={form} onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {input("name", "Name", { autoComplete: "name" })}
        {input("email", "Email", { type: "email", autoComplete: "email" })}
      </div>
      {input("company", "Company", { autoComplete: "organization" })}
      <label className="grid gap-2 text-sm" htmlFor="packageId">
        Package
        <select
          id="packageId"
          name="packageId"
          value={packageId}
          onChange={(event) => setPackageId(event.target.value as PackageId)}
          className="field"
        >
          {ORDER.map((id) => (
            <option key={id} value={id}>
              {PACKAGES[id].name} · {PACKAGES[id].price}
            </option>
          ))}
        </select>
      </label>
      {status === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "sending"}
        className="justify-self-start btn-primary disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Start a campaign"}
      </button>
    </form>
  );
}
