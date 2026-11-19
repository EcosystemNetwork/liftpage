import { changeStatusAction, removePlan, removeProject } from "@/app/actions/projects";
import { CHANGE_STATUS_LABEL, PROJECT_STATUS_LABEL, checkLine, planTerms } from "@/lib/plan";
import type { Suite } from "@/lib/projects";
import { formatStamp } from "@/lib/time";
import { CHANGE_STATUSES } from "@/lib/types";
import { INPUT, KICKER } from "@/lib/ui";
import { RowButton } from "./forms";
import { CheckNowButton, ProjectForm, PlanForm } from "./SuiteForms";

/** The admin's controls for one client's projects, change requests, and plan. */
export function SuiteAdmin({ clientId, suite }: { clientId: string; suite: Suite }) {
  const { projects, changes, plan } = suite;
  const open = changes.filter((c) => c.status !== "done");
  const name = (projectId: string) => projects.find((p) => p.id === projectId)?.name ?? "Removed project";
  return (
    <div className="grid gap-8">
      {open.length ? (
        <div>
          <h3 className={`${KICKER} mb-3 text-accent`}>Change requests · {open.length} open</h3>
          <ul className="grid gap-2">
            {open.map((c) => (
              <li key={c.id} className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="min-w-0">
                  <p className={`${KICKER} text-muted`}>
                    {name(c.projectId)} · {formatStamp(c.at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
                </div>
                <form key={c.status} action={changeStatusAction} className="flex gap-2">
                  <input type="hidden" name="changeId" value={c.id} />
                  <select name="status" defaultValue={c.status} aria-label="Request status" className={`${INPUT} w-auto`}>
                    {CHANGE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {CHANGE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <RowButton>Set</RowButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {projects.map((p) => (
          <article key={p.id} className="panel grid content-start gap-3 p-4">
            <p className={`${KICKER} text-muted`}>
              {p.kind === "website" ? "Website" : "Social media"} · {PROJECT_STATUS_LABEL[p.status]}
            </p>
            <h3 className="display text-2xl">{p.name}</h3>
            {p.url ? (
              <>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="link break-all font-mono text-xs">
                  {p.url}
                </a>
                <p className={`font-mono text-xs ${p.check && !p.check.ok ? "text-danger" : "text-muted"}`}>{checkLine(p.check)}</p>
                <CheckNowButton projectId={p.id} />
              </>
            ) : null}
            <details>
              <summary className={`${KICKER} cursor-pointer text-accent`}>Edit</summary>
              <div className="mt-3 grid gap-4">
                <ProjectForm clientId={clientId} project={p} />
                <form action={removeProject}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="projectId" value={p.id} />
                  <RowButton tone="heat">Remove project</RowButton>
                </form>
              </div>
            </details>
          </article>
        ))}
        <details className="panel p-4" open={!projects.length}>
          <summary className={`${KICKER} cursor-pointer text-accent`}>Add a project</summary>
          <div className="mt-4">
            <ProjectForm clientId={clientId} />
          </div>
        </details>
      </div>

      <div id="plan" className="scroll-mt-6">
        <h3 className="display mb-1 text-2xl">Monthly plan</h3>
        <p className="mb-4 text-sm text-muted">
          {plan ? `${planTerms(plan).price} · ${planTerms(plan).terms}` : "None yet. Offer one: first month free, or a locked price."}
        </p>
        <div className="max-w-2xl">
          <PlanForm clientId={clientId} plan={plan} />
          {plan && !plan.subscribed ? (
            <form action={removePlan} className="mt-4">
              <input type="hidden" name="clientId" value={clientId} />
              <RowButton tone="heat">Withdraw plan</RowButton>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
