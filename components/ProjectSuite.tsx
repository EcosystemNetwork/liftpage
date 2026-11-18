import {
  CHANGE_STATUS_LABEL,
  PLAN_NOTICES,
  PLAN_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  canSubscribe,
  checkLine,
  planTerms,
  type PlanNotice,
} from "@/lib/plan";
import type { Suite } from "@/lib/projects";
import { formatStamp } from "@/lib/time";
import type { ChangeRequest, Plan, Project } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { ChangeForm, CheckNowButton } from "./SuiteForms";

/** What the social card can say about the board, worked out by the page. */
export type SocialSummary = { drafts: number; scheduled: number; published: number; networks: string[] };

const PILL = {
  good: "border-accent/30 bg-accent-soft text-accent",
  bad: "border-danger/30 bg-danger-soft text-danger",
  quiet: "border-line text-muted",
} as const;

function Pill({ tone, children }: { tone: keyof typeof PILL; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${PILL[tone]}`}>{children}</span>;
}

const projectTone = (p: Project): keyof typeof PILL => (p.status === "live" ? (p.kind === "website" && p.check && !p.check.ok ? "bad" : "good") : "quiet");

/**
 * The client's suite: every project LiftPage builds or runs for them, and the plan that
 * pays for it. `preview` hides every control, for the admin's read-only view.
 */
export function ProjectSuite({
  suite,
  social,
  preview = false,
  payments = false,
  notice,
}: {
  suite: Suite;
  social: SocialSummary | null;
  preview?: boolean;
  payments?: boolean;
  /** Back from Stripe checkout. */
  notice?: PlanNotice;
}) {
  const { projects, changes, plan } = suite;
  if (!projects.length && !plan) {
    return (
      <p className="panel px-5 py-6 text-muted">
        Nothing here yet. When LiftPage starts on your website or social media, it shows up here with its status, and you can ask for changes any time.
      </p>
    );
  }
  return (
    <div className="grid gap-4">
      {projects.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id} className="min-w-0">
              <ProjectCard
                project={project}
                changes={changes.filter((c) => c.projectId === project.id)}
                social={project.kind === "social" ? social : null}
                preview={preview}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {plan ? <PlanCard plan={plan} preview={preview} payments={payments} notice={notice} /> : null}
    </div>
  );
}

function ProjectCard({ project, changes, social, preview }: { project: Project; changes: ChangeRequest[]; social: SocialSummary | null; preview: boolean }) {
  const open = changes.filter((c) => c.status !== "done").length;
  return (
    <article className="panel grid h-full content-start gap-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className={`${KICKER} text-muted`}>{project.kind === "website" ? "Website" : "Social media"}</p>
        <Pill tone={projectTone(project)}>{PROJECT_STATUS_LABEL[project.status]}</Pill>
      </header>
      <div>
        <h3 className="display text-3xl">{project.name}</h3>
        {project.url ? (
          <a href={project.url} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-block break-all font-mono text-sm">
            {project.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : null}
        {project.summary ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{project.summary}</p> : null}
      </div>

      {project.kind === "website" && project.url ? (
        <div className="grid gap-2 rounded-xl bg-sunken px-4 py-3">
          <p className="flex items-center gap-2 font-mono text-xs">
            <span
              aria-hidden
              className={`inline-block size-2 rounded-full ${!project.check ? "bg-muted" : project.check.ok ? "bg-accent" : "bg-danger"}`}
            />
            {checkLine(project.check)}
          </p>
          {preview ? null : <CheckNowButton projectId={project.id} />}
        </div>
      ) : null}

      {social ? (
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-sunken px-4 py-3 text-center">
          <Stat label="To review" value={social.drafts} href="#board" />
          <Stat label="Scheduled" value={social.scheduled} />
          <Stat label="Published" value={social.published} />
          <p className="col-span-3 font-mono text-xs text-muted">{social.networks.length ? social.networks.join(" · ") : "No networks connected yet"}</p>
        </div>
      ) : null}

      {changes.length ? (
        <div>
          <p className={`${KICKER} mb-2 text-muted`}>Your requests{open ? ` · ${open} open` : ""}</p>
          <ul className="grid gap-2">
            {changes.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 border-b border-line pb-2 text-sm last:border-0">
                <span className="min-w-0">
                  <span className="line-clamp-2 whitespace-pre-wrap">{c.text}</span>
                  <span className="font-mono text-xs text-muted">{formatStamp(c.at)}</span>
                </span>
                <Pill tone={c.status === "done" ? "good" : "quiet"}>{CHANGE_STATUS_LABEL[c.status]}</Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview ? null : (
        <details className="group">
          <summary className={`${KICKER} cursor-pointer text-accent`}>Request a change</summary>
          <div className="mt-3">
            <ChangeForm projectId={project.id} kind={project.kind} />
          </div>
        </details>
      )}
    </article>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <span className="display text-3xl">{value}</span>
      <span className={`${KICKER} text-muted`}>{label}</span>
    </>
  );
  return href && value ? (
    <a href={href} className="grid hover:text-accent">
      {body}
    </a>
  ) : (
    <div className="grid">{body}</div>
  );
}

function PlanCard({ plan, preview, payments, notice }: { plan: Plan; preview: boolean; payments: boolean; notice?: PlanNotice }) {
  const { price, terms } = planTerms(plan);
  const items = plan.includes.split("\n").map((l) => l.trim()).filter(Boolean);
  const tone = plan.status === "active" || plan.status === "trialing" ? "good" : plan.status === "past_due" ? "bad" : "quiet";
  return (
    <article id="plan" className="panel grid scroll-mt-6 gap-5 p-5 md:grid-cols-[1fr_auto] md:p-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`${KICKER} text-muted`}>Your plan</p>
          <Pill tone={tone}>{PLAN_STATUS_LABEL[plan.status]}</Pill>
          {plan.offer === "locked" ? <Pill tone="quiet">Locked price</Pill> : null}
        </div>
        <h3 className="mt-2 display text-3xl">{plan.name}</h3>
        <p className="mt-2 text-sm">{terms}</p>
        {items.length ? (
          <ul className="mt-4 grid gap-1.5 text-sm">
            {items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-accent">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="grid content-start gap-3 md:min-w-56 md:text-right">
        <p className="display text-5xl">{price.replace("/mo", "")}</p>
        <p className={`${KICKER} -mt-2 text-muted`}>per month</p>
        {notice === "started" ? (
          <p role="status" className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-ink md:text-left">
            {PLAN_NOTICES.started}
          </p>
        ) : notice ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger md:text-left">
            {PLAN_NOTICES[notice]}
          </p>
        ) : null}
        {!preview && payments && canSubscribe(plan) ? (
          <form action="/api/stripe/subscribe" method="post">
            <button type="submit" className="btn-primary w-full">
              {plan.offer === "trial" ? "Start free month" : "Start plan"}
            </button>
            <p className="mt-2 text-xs text-muted md:text-left">
              {plan.offer === "trial" ? "Card on file now; nothing is charged until the free month ends." : "Secure checkout through Stripe."}
            </p>
          </form>
        ) : plan.subscribed ? (
          <p className="text-xs text-muted">Card on file. Questions about billing? Send us a message.</p>
        ) : null}
      </div>
    </article>
  );
}
