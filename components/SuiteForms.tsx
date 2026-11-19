"use client";

import { useActionState } from "react";
import { requestGeneralChange } from "@/app/actions/client";
import { checkNow, requestChange, savePlanAction, saveProjectAction } from "@/app/actions/projects";
import { OFFER_LABEL, PLAN_STATUS_LABEL, PROJECT_STATUS_LABEL } from "@/lib/plan";
import { PLAN_OFFERS, PLAN_STATUSES, PROJECT_STATUSES, type Plan, type Project } from "@/lib/types";
import { INPUT, LABEL } from "@/lib/ui";
import { Message, RowButton, Submit } from "./forms";

const AREA = "field py-2.5";

/* ---------- Client ---------- */

export function ChangeForm({ projectId, kind }: { projectId: string; kind: Project["kind"] }) {
  const [state, run] = useActionState(requestChange, undefined);
  return (
    <form action={run} className="grid gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <label className={LABEL}>
        <span className="sr-only">What should change</span>
        <textarea
          name="text"
          required
          minLength={4}
          maxLength={4000}
          rows={3}
          placeholder={kind === "website" ? "New hours on the contact page, swap the hero photo, add a menu item…" : "Post about our sale Friday, less video, more behind-the-scenes…"}
          className={AREA}
        />
      </label>
      <Message state={state} />
      <Submit busy="Sending" className="justify-self-start btn-sm">
        Send request
      </Submit>
    </form>
  );
}

/** A change that isn't about one project: "anything else". */
export function GeneralChangeForm({ clientId }: { clientId?: string }) {
  const [state, run] = useActionState(requestGeneralChange, undefined);
  return (
    <form action={run} className="grid gap-2">
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      <label className={LABEL}>
        <span className="sr-only">What should change</span>
        <textarea
          name="text"
          required
          minLength={4}
          maxLength={4000}
          rows={3}
          defaultValue={state?.fields?.text}
          placeholder="New logo for everything, pause posting next week, add Facebook, change our phone number everywhere…"
          className={AREA}
        />
      </label>
      <Message state={state} />
      <Submit busy="Sending" className="justify-self-start">
        Send request
      </Submit>
    </form>
  );
}

export function CheckNowButton({ projectId }: { projectId: string }) {
  const [state, run] = useActionState(checkNow, undefined);
  return (
    <form action={run} className="grid gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <RowButton>Check now</RowButton>
      </div>
      <Message state={state} />
    </form>
  );
}

/* ---------- Admin ---------- */

export function ProjectForm({ clientId, project }: { clientId: string; project?: Project }) {
  const [state, run] = useActionState(saveProjectAction, undefined);
  return (
    <form action={run} className="grid gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      {project ? <input type="hidden" name="projectId" value={project.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={LABEL}>
          Kind
          <select name="kind" defaultValue={project?.kind ?? "website"} className={INPUT}>
            <option value="website">Website</option>
            <option value="social">Social media</option>
          </select>
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          Name
          <input name="name" required maxLength={120} defaultValue={project?.name ?? ""} placeholder="Rosa's Bakery website" className={INPUT} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={`${LABEL} sm:col-span-2`}>
          Address (websites)
          <input name="url" type="text" inputMode="url" maxLength={500} defaultValue={project?.url ?? ""} placeholder="https://rosasbakery.com" className={INPUT} />
        </label>
        <label className={LABEL}>
          Status
          <select name="status" defaultValue={project?.status ?? "building"} className={INPUT}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={LABEL}>
        What the client should know
        <textarea name="summary" maxLength={2000} rows={2} defaultValue={project?.summary ?? ""} placeholder="Five pages, booking form, hosted and backed up by LiftPage." className={AREA} />
      </label>
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        {project ? "Save project" : "Add project"}
      </Submit>
    </form>
  );
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");

export function PlanForm({ clientId, plan }: { clientId: string; plan: Plan | null }) {
  const [state, run] = useActionState(savePlanAction, undefined);
  return (
    <form action={run} className="grid gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={`${LABEL} sm:col-span-2`}>
          Plan name
          <input name="name" maxLength={120} defaultValue={plan?.name ?? "Online presence"} className={INPUT} />
        </label>
        <label className={LABEL}>
          Monthly ($)
          <input name="monthly" type="number" min={0} max={100000} step={1} required defaultValue={plan?.monthly ?? 499} className={INPUT} />
        </label>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">Offer</legend>
        <label className={LABEL}>
          Offer
          <select name="offer" defaultValue={plan?.offer ?? "trial"} className={INPUT}>
            {PLAN_OFFERS.map((o) => (
              <option key={o} value={o}>
                {OFFER_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Free until (trial)
          <input name="trialEnds" type="date" defaultValue={day(plan?.trialEndsAt)} className={INPUT} />
        </label>
        <label className={LABEL}>
          Price locked through
          <input name="lockedUntil" type="date" defaultValue={plan?.lockedUntil ?? ""} className={INPUT} />
        </label>
      </fieldset>
      <p className="-mt-1 text-xs text-muted">First month free: leave the date blank for 30 days from today. Locked price: the date is required. Each date only counts for its offer.</p>
      <label className={LABEL}>
        What it includes, one per line
        <textarea
          name="includes"
          maxLength={2000}
          rows={4}
          defaultValue={plan?.includes ?? ""}
          placeholder={"Website hosting, updates, and backups\nSocial on Instagram and Facebook\n12 posts a month, written and scheduled\nMonthly numbers report"}
          className={AREA}
        />
      </label>
      <label className={`${LABEL} sm:max-w-xs`}>
        Status
        <select name="status" defaultValue={plan?.status ?? "pending"} className={INPUT}>
          {PLAN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PLAN_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <p className="-mt-1 text-xs text-muted">
        {plan?.subscribed
          ? "Card on file through Stripe. Stripe keeps this status in step on its own."
          : "Not started: the client sees a button to put a card on file. Set Free month or Active by hand if you bill them another way."}
      </p>
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        {plan ? "Save plan" : "Offer this plan"}
      </Submit>
    </form>
  );
}
