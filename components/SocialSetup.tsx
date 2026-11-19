"use client";

import { useActionState, useState } from "react";
import { finishSetupAction, saveSocialSetup } from "@/app/actions/client";
import { SETUP_NAME, SETUP_PLATFORMS, type SetupAsk, type SetupPlatform, type SocialSetup } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { Message, RowButton, Submit } from "./forms";

const ASK_LABEL: Record<SetupAsk, string> = { have: "I have one", make: "Make one for me", skip: "Not needed" };

export function setupLine(s: SocialSetup): string {
  if (s.ask === "skip") return "Not needed";
  if (s.ask === "have") return s.status === "done" ? `@${s.handle} · we're set up` : `@${s.handle} · we're getting access`;
  return s.status === "done" ? (s.handle ? `Made for you: @${s.handle}` : "Made for you") : "We're making it";
}

/**
 * Onboarding for a client's social accounts. For each network: here's mine (handle or
 * link), make one for me, or skip. Never asks for passwords: LiftPage gets access the
 * network's own way (page roles, business manager, or by connecting on the desk).
 */
export function SocialSetupForm({ setup, clientId }: { setup: SocialSetup[]; clientId?: string }) {
  const [state, run] = useActionState(saveSocialSetup, undefined);
  const saved = new Map(setup.map((s) => [s.platform, s]));
  return (
    <form action={run} className="grid gap-4">
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      <ul className="grid gap-3">
        {SETUP_PLATFORMS.map((platform) => (
          <SetupRow key={platform} platform={platform} saved={saved.get(platform)} />
        ))}
      </ul>
      <p className="text-xs text-muted">Never send us passwords. Once we know your accounts, we&rsquo;ll show you how to give LiftPage access safely.</p>
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        Save social accounts
      </Submit>
    </form>
  );
}

function SetupRow({ platform, saved }: { platform: SetupPlatform; saved?: SocialSetup }) {
  const [ask, setAsk] = useState<SetupAsk | "">(saved?.ask ?? "");
  const name = SETUP_NAME[platform];
  return (
    <li className="panel grid gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{name}</p>
        {saved ? <span className={`${KICKER} ${saved.status === "done" ? "text-accent" : "text-muted"}`}>{setupLine(saved)}</span> : null}
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{name}</legend>
        {(["have", "make", "skip"] as const).map((value) => (
          <label key={value} className="btn-ghost btn-sm cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-ink">
            <input type="radio" name={`ask_${platform}`} value={value} checked={ask === value} onChange={() => setAsk(value)} className="sr-only" />
            {ASK_LABEL[value]}
          </label>
        ))}
      </fieldset>
      {ask === "have" ? (
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Your {name} handle or link</span>
          <input
            name={`handle_${platform}`}
            required
            maxLength={200}
            defaultValue={saved?.ask === "have" ? saved.handle : ""}
            placeholder={platform === "google" || platform === "facebook" ? "Page name or link" : "@yourbusiness"}
            className="field"
          />
        </label>
      ) : null}
      {ask === "have" || ask === "make" ? (
        <label className="grid gap-1 text-sm">
          <span className="text-muted">{ask === "make" ? "Any name you'd like? (optional)" : "Anything we should know? (optional)"}</span>
          <input name={`note_${platform}`} maxLength={1000} defaultValue={saved?.ask === ask ? saved.note : ""} className="field" />
        </label>
      ) : null}
    </li>
  );
}

/** LiftPage's side: mark each network handled, and fill in the handle of one it made. */
export function SocialSetupAdmin({ setup, clientId }: { setup: SocialSetup[]; clientId: string }) {
  const open = setup.filter((s) => s.status === "open");
  if (!setup.length) return <p className="text-muted">They haven&rsquo;t told us about their social accounts yet.</p>;
  return (
    <div className="grid gap-2">
      <p className={`${KICKER} text-accent`}>{open.length ? `${open.length} to handle` : "All handled"}</p>
      <ul className="grid gap-2">
        {setup.map((s) => (
          <li key={s.platform} className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="font-medium">
                {SETUP_NAME[s.platform]} · <span className="text-muted">{ASK_LABEL[s.ask]}</span>
              </p>
              <p className={`${KICKER} ${s.status === "done" ? "text-accent" : "text-muted"}`}>{setupLine(s)}</p>
              {s.note ? <p className="mt-1 whitespace-pre-wrap text-sm">{s.note}</p> : null}
            </div>
            {s.ask === "skip" ? null : (
              <form action={finishSetupAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="platform" value={s.platform} />
                <input type="hidden" name="status" value={s.status === "done" ? "open" : "done"} />
                {s.ask === "make" && s.status === "open" ? (
                  <input name="handle" maxLength={200} placeholder="New handle" aria-label={`New ${SETUP_NAME[s.platform]} handle`} className="field min-h-9 w-40 text-sm" />
                ) : null}
                <RowButton>{s.status === "done" ? "Reopen" : s.ask === "make" ? "Made it" : "Have access"}</RowButton>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
