"use client";

import { useActionState } from "react";
import { startCampaign } from "@/app/actions/client";
import { PACKAGES, type PackageId } from "@/lib/types";
import { LABEL } from "@/lib/ui";
import { Message, Submit } from "./forms";
import { PayButton } from "./PayButton";

const ORDER: PackageId[] = ["starter", "growth", "accelerator", "event"];

/** Start a campaign from the account: no name, email, or company to type; we have them. */
export function CampaignForm() {
  const [state, run] = useActionState(startCampaign, undefined);
  if (state?.ok) {
    return (
      <div role="status" className="grid gap-3 rounded-xl border border-accent/30 bg-accent-soft px-5 py-5 text-ink">
        <p>{state.ok}</p>
        {state.holdId ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted">Want the slot held now? Pay the deposit and we start on the brief.</p>
            <PayButton holdId={state.holdId} label="Pay deposit" />
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <form action={run} className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className={`${LABEL} mb-2`}>Package</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ORDER.map((id) => (
            <label key={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name="packageId" value={id} required defaultChecked={(state?.fields?.packageId ?? "starter") === id} className="mt-1" />
              <span className="grid gap-0.5">
                <span className="font-medium">
                  {PACKAGES[id].name} · <span className="font-mono text-sm">{PACKAGES[id].price}</span>
                </span>
                <span className="text-sm text-muted">{PACKAGES[id].deliver}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={LABEL}>
        What&rsquo;s it for?
        <textarea
          name="brief"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          defaultValue={state?.fields?.brief}
          placeholder="Grand opening on March 3. We want more people at the door that week, mostly locals, mostly on Instagram."
          className="field py-2.5"
        />
      </label>
      <p className="-mt-2 text-xs text-muted">Dates, what you&rsquo;re promoting, who it&rsquo;s for. Add photos below and we&rsquo;ll use them.</p>
      <Message state={state} />
      <Submit busy="Sending" className="justify-self-start">
        Start campaign
      </Submit>
    </form>
  );
}
