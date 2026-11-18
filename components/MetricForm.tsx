"use client";

import { useActionState } from "react";
import { saveMetric } from "@/app/actions/metrics";
import { PLATFORMS, PLATFORM_NAME } from "@/lib/types";
import { INPUT, LABEL } from "@/lib/ui";
import { Message, Submit } from "./forms";

const FIELDS = [
  ["followers", "Followers"],
  ["impressions", "Impressions"],
  ["engagements", "Engagements"],
  ["clicks", "Link clicks"],
  ["leads", "Leads"],
] as const;

export function MetricForm({ userId, today }: { userId?: string; today: string }) {
  const [state, action] = useActionState(saveMetric, undefined);
  return (
    <form action={action} className="grid gap-4">
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Week of
          <input name="week" type="date" max={today} defaultValue={state?.fields?.week ?? today} required className={INPUT} />
        </label>
        <label className={LABEL}>
          Platform
          <select name="platform" defaultValue={state?.fields?.platform ?? "instagram"} className={INPUT}>
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_NAME[platform]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {FIELDS.map(([name, label]) => (
          <label key={name} className={LABEL}>
            {label}
            <input name={name} inputMode="numeric" pattern="[0-9,]*" placeholder="0" defaultValue={state?.fields?.[name]} className={`${INPUT} font-mono`} />
          </label>
        ))}
      </div>
      <p className="text-xs text-mute">Any date in the week works; it files under that Monday. Same week and platform overwrites.</p>
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        Save week
      </Submit>
    </form>
  );
}
