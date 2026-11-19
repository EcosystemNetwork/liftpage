"use client";

import { useActionState } from "react";
import { addNoteAction, broadcast, draftWeek, setClientTools } from "@/app/actions/clients";
import type { FormState } from "@/app/actions/auth";
import { CLIENT_STAGES } from "@/lib/types";
import { INPUT, LABEL } from "@/lib/ui";
import { Message, RowButton, Submit } from "./forms";

const AREA = "field py-2.5";

/** One button that runs a client tool and says what happened under it. */
export function ToolButton({
  action,
  clientId,
  label,
  hint,
  tone,
  confirm,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  clientId?: string;
  label: string;
  hint: string;
  tone?: "plain" | "heat";
  /** Asked before running, for moves that touch many posts or many people. */
  confirm?: string;
}) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="grid content-start gap-2 panel p-4"
    >
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      <div>
        <RowButton tone={tone}>{label}</RowButton>
      </div>
      <p className="text-xs text-muted">{hint}</p>
      <Message state={state} />
    </form>
  );
}

export function DraftWeekForm({ clientId, brandName }: { clientId: string; brandName: string }) {
  const [state, run] = useActionState(draftWeek, undefined);
  return (
    <form action={run} className="grid gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <label className={LABEL}>
        Brief for {brandName}
        <textarea
          name="brief"
          required
          minLength={8}
          maxLength={4000}
          rows={3}
          placeholder="What this week should push: a launch, an offer, an event, a theme."
          className={AREA}
        />
      </label>
      <label className="inline-flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" name="notify" defaultChecked />
        Email the client that drafts are ready to review
      </label>
      <Message state={state} />
      <Submit busy="Writing the week" className="justify-self-start">
        Draft a week
      </Submit>
    </form>
  );
}

export function NoteForm({ clientId }: { clientId: string }) {
  const [state, run] = useActionState(addNoteAction, undefined);
  return (
    <form action={run} className="grid gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <label className={LABEL}>
        Private note
        <textarea name="text" required maxLength={4000} rows={3} placeholder="Call notes, preferences, what to watch. The client never sees this." className={AREA} />
      </label>
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        Save note
      </Submit>
    </form>
  );
}

const STAGE_LABEL = { all: "Every onboarding and active client", onboarding: "Onboarding only", active: "Active only" } as const;

export function BroadcastForm({ counts }: { counts: Partial<Record<(typeof CLIENT_STAGES)[number], number>> }) {
  const [state, run] = useActionState(broadcast, undefined);
  const total = (counts.onboarding ?? 0) + (counts.active ?? 0);
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (!window.confirm("Send this to every client in the group? It lands in each thread and is emailed.")) event.preventDefault();
      }}
      className="grid gap-3"
    >
      <label className={LABEL}>
        Send to
        <select name="stage" defaultValue="all" className={INPUT}>
          <option value="all">
            {STAGE_LABEL.all} ({total})
          </option>
          <option value="onboarding">
            {STAGE_LABEL.onboarding} ({counts.onboarding ?? 0})
          </option>
          <option value="active">
            {STAGE_LABEL.active} ({counts.active ?? 0})
          </option>
        </select>
      </label>
      <label className={LABEL}>
        Message
        <textarea name="text" required minLength={4} maxLength={4000} rows={4} placeholder="Holiday schedule, a new feature, a reminder to approve next week's board." className={AREA} />
      </label>
      <Message state={state} />
      <Submit busy="Sending" className="justify-self-start">
        Send to clients
      </Submit>
    </form>
  );
}

/** Admin switches for the AI tools a client can run on their own board. */
export function ClientToolsForm({ clientId, tools, on, ready }: { clientId: string; tools: { id: string; label: string; hint: string }[]; on: string[]; ready: boolean }) {
  const [state, run] = useActionState(setClientTools, undefined);
  return (
    <form action={run} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Tools the client can use</legend>
        {tools.map((tool) => (
          <label key={tool.id} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
            <input type="checkbox" name="tool" value={tool.id} defaultChecked={on.includes(tool.id)} className="mt-1" />
            <span>
              <span className="font-medium">{tool.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{tool.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {!ready ? <p className="text-sm text-danger">No AI backend is set up, so switched-on tools won&rsquo;t answer yet.</p> : null}
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        Save tools
      </Submit>
    </form>
  );
}
