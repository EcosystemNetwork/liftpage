import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveDrafts,
  changeNote,
  nudgeReview,
  pausePublishing,
  retryFailed,
  scheduleApproved,
  sendReportAction,
  setStage,
} from "@/app/actions/clients";
import { OpenBoardForm, SyncButton } from "@/components/BoardForms";
import { ClientToolsForm, DraftWeekForm, NoteForm, ToolButton } from "@/components/ClientTools";
import { aiReady } from "@/lib/ai";
import { CLIENT_TOOLS } from "@/lib/tools";
import { CustomerStats } from "@/components/CustomerStats";
import { RowButton } from "@/components/forms";
import { FlagList } from "@/components/FlagList";
import { HoldList } from "@/components/HoldList";
import { MessageThread } from "@/components/MessageThread";
import { MetricForm } from "@/components/MetricForm";
import { PhotoLibrary } from "@/components/PhotoLibrary";
import { SocialSetupAdmin } from "@/components/SocialSetup";
import { listPhotos, loadSetup } from "@/lib/client-files";
import { findUser, toMetric } from "@/lib/accounts";
import { bookHealth, loadClientNotes, loadEvents } from "@/lib/admin";
import { requireAdmin } from "@/lib/dal";
import { boardCounts } from "@/lib/health";
import { loadThread, markRead } from "@/lib/messages";
import { loadSuite } from "@/lib/projects";
import { boardForClient, connectionsFor, holdsFor } from "@/lib/store";
import { SuiteAdmin } from "@/components/SuiteAdmin";
import { db, must } from "@/lib/supabase/server";
import { formatStamp } from "@/lib/time";
import { CLIENT_STAGES, PLATFORM_NAME } from "@/lib/types";
import { INPUT, KICKER } from "@/lib/ui";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/customers/${id}`);
  // Ids are uuids; anything else is a 404, not a database error.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await findUser(id);
  if (!user || user.role !== "client") notFound();
  const [rows, holds, board, notes, events, suite, photos, setup] = await Promise.all([
    db().from("metrics").select("*").eq("user_id", user.id).order("week"),
    holdsFor(user.id),
    boardForClient(user.id),
    loadClientNotes(user.id),
    loadEvents({ clientId: user.id, limit: 30 }),
    loadSuite(user.id),
    listPhotos(user.id),
    loadSetup(user.id),
  ]);
  const messages = await loadThread(user.id);
  if (messages.some((m) => m.role === "client" && !m.readAt)) await markRead(user.id, "admin");
  const metrics = (must(rows, "load numbers") ?? []).map(toMetric);
  const connections = board ? await connectionsFor(board.brand.id) : [];
  const [health] = await bookHealth([user], new Map(metrics.length ? [[user.id, metrics.at(-1)!.week]] : []));
  const count = boardCounts(board?.posts ?? []);

  return (
    <>
      <section>
        <p className={`${KICKER} text-accent`}>Customer</p>
        <h1 className="mt-3 display text-5xl md:text-6xl">{user.company}</h1>
        <p className="mt-2 text-muted">
          {user.name} · <span className="font-mono text-sm">{user.email}</span>
          {user.disabled ? " · switched off" : ""}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <form action={setStage} className="flex items-end gap-2">
            <input type="hidden" name="clientId" value={user.id} />
            <label className="grid gap-1 text-sm">
              <span className={`${KICKER} text-muted`}>Stage</span>
              <select name="stage" defaultValue={user.stage} className={`${INPUT} w-auto`}>
                {CLIENT_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage[0].toUpperCase() + stage.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <RowButton>Set</RowButton>
          </form>
          {board || suite.projects.length || suite.plan ? (
            <Link href={`/admin/customers/${user.id}/preview`} className={`btn-ghost`}>
              See what they see
            </Link>
          ) : null}
          {board ? (
            <Link href={`/desk?board=${board.brand.id}`} className={`btn-ghost`}>
              Open on the desk
            </Link>
          ) : null}
        </div>
        {health?.flags.length ? (
          <div className="mt-6">
            <FlagList flags={health.flags} />
          </div>
        ) : (
          <p className="mt-6 font-mono text-xs text-muted">Nothing needs a move.</p>
        )}
      </section>

      <section id="projects" aria-labelledby="projects-title" className="scroll-mt-6">
        <h2 id="projects-title" className="mb-1 display text-3xl">
          Projects and plan
        </h2>
        <p className="mb-4 text-sm text-muted">What {user.company} sees at the top of their account: their website, their social, and what they pay.</p>
        <SuiteAdmin clientId={user.id} suite={suite} />
      </section>

      <div className="grid gap-12 lg:grid-cols-2 [&>*]:min-w-0">
        <section id="social-setup" aria-labelledby="setup-title" className="scroll-mt-6">
          <h2 id="setup-title" className="mb-1 display text-3xl">
            Social accounts
          </h2>
          <p className="mb-4 text-sm text-muted">What {user.company} told us: accounts they have, and ones they want us to make.</p>
          <SocialSetupAdmin setup={setup} clientId={user.id} />
        </section>

        <section id="photos" aria-labelledby="photos-title" className="scroll-mt-6">
          <h2 id="photos-title" className="mb-1 display text-3xl">
            Photos
          </h2>
          <p className="mb-4 text-sm text-muted">{photos.length ? `${photos.length} from ${user.company}. Links last an hour; reload for fresh ones.` : `Nothing from ${user.company} yet.`}</p>
          <PhotoLibrary photos={photos} clientId={user.id} />
        </section>
      </div>

      <section aria-labelledby="tools">
        <h2 id="tools" className="mb-1 display text-3xl">
          Tools
        </h2>
        <p className="mb-4 text-sm text-muted">
          Run these for {user.company}. Each one is logged below.
          {board
            ? ` Board: ${count.drafts} drafts · ${count.sentBack} sent back · ${count.approved} approved, unscheduled · ${count.cued} scheduled · ${count.failed} failed · ${count.published} published.`
            : ""}
        </p>
        {board ? (
          <div className="grid gap-6">
            <div className="max-w-2xl panel p-5">
              <DraftWeekForm clientId={user.id} brandName={board.brand.name} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ToolButton action={nudgeReview} clientId={user.id} label="Ask for review" hint="Emails the client that drafts are waiting. Once per 10 minutes." />
              <ToolButton
                action={approveDrafts}
                clientId={user.id}
                label={`Approve ${count.drafts} drafts`}
                hint="For when the client said yes by phone or email. Leaves a note on each line. Lines they sent back stay drafts."
                confirm={`Approve ${count.drafts} drafts on ${user.company}'s behalf?`}
              />
              <ToolButton
                action={scheduleApproved}
                clientId={user.id}
                label={`Schedule ${count.approved} approved`}
                hint="Every approved line with a slot still ahead goes on the scheduler and posts at its slot."
                confirm={`Schedule ${count.approved} lines to post at their slots?`}
              />
              <ToolButton
                action={pausePublishing}
                clientId={user.id}
                label="Pause publishing"
                tone="heat"
                hint="Takes every scheduled line off the schedule, back to approved. Nothing is deleted."
                confirm={`Stop ${count.cued} scheduled lines from posting?`}
              />
              <ToolButton
                action={retryFailed}
                clientId={user.id}
                label={`Retry ${count.failed} failed`}
                hint="Puts failed posts back on the scheduler. Past slots go out right away. Check the error on the desk first."
                confirm={`Retry ${count.failed} failed posts now?`}
              />
              <ToolButton action={sendReportAction} clientId={user.id} label="Email weekly report" hint="Last full week's numbers against the week before, and where the board stands." />
            </div>
          </div>
        ) : (
          <div className="max-w-2xl">
            <p className="mb-4 text-muted">No board yet. Open one and the content tools, the desk, and the client&rsquo;s board all switch on.</p>
            <OpenBoardForm clientId={user.id} company={user.company} />
          </div>
        )}
        {board ? (
          <p className="mt-4 font-mono text-xs text-muted">
            Networks: {connections.length ? connections.map((c) => `${PLATFORM_NAME[c.platform]} ${c.accountName}`).join(", ") : "none connected. Connect them on the desk."}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="client-tools">
        <h2 id="client-tools" className="mb-1 display text-3xl">
          Client&rsquo;s AI tools
        </h2>
        <p className="mb-4 text-sm text-muted">
          What {user.company || user.name} can run themselves from their account, on their own board only. Anything they make lands as a draft for review; nothing
          is scheduled without an approval. {user.tools.length ? `${user.tools.length} on.` : "All off."} Every use shows in the activity log.
        </p>
        {board ? (
          <div className="panel p-5">
            <ClientToolsForm clientId={user.id} tools={CLIENT_TOOLS} on={user.tools} ready={aiReady()} />
          </div>
        ) : (
          <p className="text-muted">Open a board first. The tools work on the client&rsquo;s board.</p>
        )}
      </section>

      <div className="grid gap-12 lg:grid-cols-2 [&>*]:min-w-0">
        <section id="messages" aria-labelledby="messages-title" className="scroll-mt-6">
          <h2 id="messages-title" className="display mb-4 text-3xl">
            Messages
          </h2>
          <MessageThread messages={messages} viewer="admin" clientId={user.id} otherName={user.name || user.company} />
        </section>

        <section aria-labelledby="notes-title">
          <h2 id="notes-title" className="display mb-4 text-3xl">
            Private notes
          </h2>
          <NoteForm clientId={user.id} />
          {notes.length ? (
            <ul className="mt-6 grid gap-3">
              {notes.map((note) => (
                <li key={note.id} className={`rounded-xl border p-4 ${note.pinned ? "border-accent/40 bg-accent-soft" : "border-line bg-card"}`}>
                  <p className={`${KICKER} text-muted`}>
                    {note.pinned ? "Pinned · " : ""}
                    {formatStamp(note.at)}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{note.text}</p>
                  <div className="mt-3 flex gap-2">
                    <form action={changeNote}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="change" value={note.pinned ? "unpin" : "pin"} />
                      <RowButton>{note.pinned ? "Unpin" : "Pin"}</RowButton>
                    </form>
                    <form action={changeNote}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="change" value="delete" />
                      <RowButton tone="heat">Delete</RowButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="numbers">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="numbers" className="display text-3xl">
            Numbers
          </h2>
          {connections.length ? <SyncButton userId={user.id} /> : null}
        </div>
        <CustomerStats metrics={metrics} canDelete userId={user.id} />
      </section>

      <section aria-labelledby="log" className="max-w-3xl">
        <h2 id="log" className="display mb-4 text-3xl">
          Log a week for {user.company}
        </h2>
        <MetricForm userId={user.id} today={new Date().toISOString().slice(0, 10)} />
      </section>

      <section aria-labelledby="requests">
        <h2 id="requests" className="display mb-4 text-3xl">
          Requests
        </h2>
        {holds.length ? <HoldList holds={holds} admin /> : <p className="text-muted">None linked.</p>}
      </section>

      <section aria-labelledby="activity" className="max-w-3xl">
        <h2 id="activity" className="display mb-4 text-3xl">
          Activity
        </h2>
        {events.length ? (
          <ul className="grid gap-1 font-mono text-xs">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-x-3 border-b border-line py-2 last:border-0">
                <span className="text-muted">{formatStamp(event.at)}</span>
                <span className="text-accent">{event.action}</span>
                {event.detail ? <span className="text-ink">{event.detail}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Nothing logged for this client yet.</p>
        )}
      </section>
    </>
  );
}
