"use client";

import { useActionState } from "react";
import { runAutopilotNow, saveAutopilotAction } from "@/app/actions/clients";
import { GUIDANCE_MAX, PENDING_LIMIT, WEEKDAYS, type AutopilotSettings } from "@/lib/autopilot-plan";
import { INPUT, KICKER, LABEL } from "@/lib/ui";
import { Message, RowButton, Submit } from "./forms";

/** The admin's controls for one client's content autopilot: on/off, day, standing instructions, Run now. */
export function AutopilotPanel({
  clientId,
  brandName,
  settings,
  lastRun,
  ready,
  jobs,
}: {
  clientId: string;
  brandName: string;
  settings: AutopilotSettings;
  /** Last run, already formatted on the server. */
  lastRun?: string;
  ready: boolean;
  jobs: boolean;
}) {
  const [saved, save] = useActionState(saveAutopilotAction, undefined);
  const [ran, run] = useActionState(runAutopilotNow, undefined);
  return (
    <div className="grid gap-5">
      <form action={save} className="grid gap-3">
        <input type="hidden" name="clientId" value={clientId} />
        <label className="inline-flex min-h-9 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
          Draft next week for {brandName} automatically
        </label>
        <label className={`${LABEL} max-w-xs`}>
          Day it runs (afternoon, Pacific)
          <select name="weekday" defaultValue={settings.weekday} className={INPUT}>
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Standing instructions
          <textarea
            name="guidance"
            defaultValue={settings.guidance}
            maxLength={GUIDANCE_MAX}
            rows={4}
            placeholder="Tone, topics to push or stay away from, this month's offer, dates to mention."
            className="field py-2.5"
          />
        </label>
        <label className="inline-flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="notify" defaultChecked={settings.notify} />
          Email the client when drafts are ready to review
        </label>
        <p className="text-xs text-muted">
          Each run reads what the client approved and sent back, last week&rsquo;s numbers by network, and these instructions, then writes the week as drafts.
          Nothing is approved, scheduled or posted without a person. It holds off while {PENDING_LIMIT} or more drafts are waiting on review.
        </p>
        {!ready ? <p className="text-sm text-danger">No AI backend is set up, so autopilot will skip every run.</p> : null}
        {!jobs ? <p className="text-sm text-muted">Background jobs are off: the weekly run won&rsquo;t fire. Run now still works.</p> : null}
        <Message state={saved} />
        <Submit busy="Saving" className="justify-self-start">
          Save autopilot
        </Submit>
      </form>

      <form action={run} className="grid gap-2 border-t border-line pt-4">
        <input type="hidden" name="clientId" value={clientId} />
        <p className={`${KICKER} text-muted`}>
          {settings.enabled ? `On · ${WEEKDAYS[settings.weekday]}s` : "Off"}
          {lastRun ? ` · last ran ${lastRun}` : " · hasn't run yet"}
        </p>
        {settings.lastResult ? <p className="text-sm">{settings.lastResult}</p> : null}
        <div>
          <RowButton>Run now</RowButton>
        </div>
        <Message state={ran} />
      </form>
    </div>
  );
}
