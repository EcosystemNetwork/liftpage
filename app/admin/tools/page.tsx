import { reportAll, syncAll } from "@/app/actions/clients";
import { BroadcastForm, ToolButton } from "@/components/ClientTools";
import Link from "next/link";
import { loadAccounts } from "@/lib/accounts";
import { weeklyReportsOn } from "@/lib/admin";
import { requireAdmin } from "@/lib/dal";
import { emailReady } from "@/lib/email";
import { jobsReady } from "@/lib/inngest/client";
import { CLIENT_STAGES, type ClientStage } from "@/lib/types";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Tools" };

export default async function ToolsPage() {
  await requireAdmin("/admin/tools");
  const { users } = await loadAccounts();
  const clients = users.filter((u) => u.role === "client" && !u.disabled);
  const counts = Object.fromEntries(CLIENT_STAGES.map((s) => [s, clients.filter((c) => c.stage === s).length])) as Record<ClientStage, number>;

  return (
    <>
      <section>
        <p className={`${KICKER} text-accent`}>Tools</p>
        <h1 className="mt-3 display text-5xl md:text-6xl">Run it for every client.</h1>
        <p className="mt-3 text-muted">
          Moves across the whole book. For one client, open them from Overview: drafting a week, approvals, scheduling, pausing, retries, reports, private notes, and a
          read-only view of their account live there.
        </p>
        <p className="mt-4 font-mono text-xs text-muted">
          {counts.onboarding} onboarding · {counts.active} active · {counts.paused} paused · {counts.churned} churned · email {emailReady() ? "on" : "off"} · background
          jobs {jobsReady() ? "on" : "off"}
        </p>
      </section>

      <section aria-labelledby="writer" className="max-w-2xl">
        <h2 id="writer" className="mb-1 display text-3xl">
          Write
        </h2>
        <p className="text-sm text-muted">
          The writer moved to{" "}
          <Link href="/admin/content" className="link">
            Content
          </Link>
          , where you can pick the HarnessRouter harness and model, save pieces per board, and generate social posts onto a board.
        </p>
      </section>

      <section aria-labelledby="broadcast" className="max-w-2xl">
        <h2 id="broadcast" className="mb-1 display text-3xl">
          Message clients
        </h2>
        <p className="mb-4 text-sm text-muted">Lands in each client&rsquo;s thread as a normal message from LiftPage, and is emailed when Resend is set up. Paused and churned clients are left out.</p>
        <BroadcastForm counts={counts} />
      </section>

      <section aria-labelledby="book">
        <h2 id="book" className="mb-4 display text-3xl">
          Book-wide
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToolButton
            action={reportAll}
            label="Email every weekly report"
            hint="Each onboarding and active client gets last full week's numbers and where their board stands. Clients with nothing to report are skipped."
            confirm={`Email a report to up to ${counts.onboarding + counts.active} clients?`}
          />
          <ToolButton action={syncAll} label="Sync every client's numbers" hint="Pulls this week and last week from every connected network. Also runs daily at 6am Pacific." />
        </div>
        <p className="mt-4 text-sm text-muted">
          Weekly reports by schedule are <strong className="text-ink">{weeklyReportsOn() ? "on" : "off"}</strong>
          {weeklyReportsOn()
            ? ": every Monday at 8am Pacific, to onboarding and active clients."
            : ". Set LIFTPAGE_WEEKLY_REPORTS=true to email them every Monday at 8am Pacific."}
        </p>
      </section>
    </>
  );
}
