import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientBoard } from "@/components/ClientBoard";
import { ClientOverview } from "@/components/ClientOverview";
import { CustomerStats } from "@/components/CustomerStats";
import { HoldList } from "@/components/HoldList";
import { findUser, toMetric } from "@/lib/accounts";
import { requireAdmin } from "@/lib/dal";
import { PhotoLibrary } from "@/components/PhotoLibrary";
import { GeneralRequests, ProjectSuite } from "@/components/ProjectSuite";
import { listPhotos } from "@/lib/client-files";
import { overview } from "@/lib/overview";
import { socialSummary } from "@/lib/plan";
import { loadSuite } from "@/lib/projects";
import { boardForClient, connectionsFor, holdsFor } from "@/lib/store";
import { db, must } from "@/lib/supabase/server";
import { KICKER } from "@/lib/ui";
import { ClientServices, WorkLog } from "@/components/ClientServices";
import { loadServices } from "@/lib/services-load";
import { Calendar, MonthRecap, Wins } from "@/components/Recap";
import { calendar, monthRecap, wins } from "@/lib/recap";

export const metadata = { title: "Client view" };

/**
 * The client's account as they see it, read-only. Not a sign-in as them: no session
 * changes hands, nothing here can act for the client, and their messages stay unread.
 */
export default async function PreviewPage({ params }: PageProps<"/admin/customers/[id]/preview">) {
  const { id } = await params;
  await requireAdmin(`/admin/customers/${id}/preview`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await findUser(id);
  if (!user || user.role !== "client") notFound();
  const [rows, holds, board, suite, photos] = await Promise.all([
    db().from("metrics").select("*").eq("user_id", user.id).order("week"),
    holdsFor(user.id),
    boardForClient(user.id),
    loadSuite(user.id),
    listPhotos(user.id),
  ]);
  const metrics = (must(rows, "load numbers") ?? []).map(toMetric);
  const connections = board ? await connectionsFor(board.brand.id) : [];
  const work = await loadServices({ user, board, connections, metrics, projects: suite.projects });

  return (
    <>
      <section>
        <p role="status" className="mb-6 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          Viewing as {user.company}. Read-only: buttons the client would use are hidden.{" "}
          <Link href={`/admin/customers/${user.id}`} className="link">
            Back to the customer
          </Link>
        </p>
        <p className={`${KICKER} text-accent`}>{user.company}</p>
        <h1 className="mt-3 display text-5xl">{user.name}</h1>
      </section>

      <section aria-labelledby="services">
        <h2 id="services" className="mb-4 display text-3xl">
          What we&rsquo;re doing for them
        </h2>
        <ClientServices services={work.services} changes={suite.changes} preview />
      </section>

      <Wins wins={wins(metrics)} />

      <ClientOverview
        company={user.company}
        since={user.createdAt}
        handle={board?.brand.handle}
        plan={suite.plan}
        projects={suite.projects}
        data={overview({ metrics, posts: board?.posts ?? [], connections, platforms: board?.brand.platforms ?? [] })}
        preview
      />

      <section aria-labelledby="month">
        <h2 id="month" className="mb-4 display text-3xl">
          Their month with LiftPage
        </h2>
        <MonthRecap recap={monthRecap({ posts: board?.posts ?? [], changes: suite.changes, metrics, now: new Date() })} />
      </section>

      <section aria-labelledby="work-log" className="max-w-3xl">
        <h2 id="work-log" className="mb-4 display text-3xl">
          Lately
        </h2>
        <WorkLog items={work.log} />
      </section>

      <section aria-labelledby="projects">
        <h2 id="projects" className="mb-4 display text-3xl">
          Their projects
        </h2>
        <ProjectSuite suite={suite} social={board ? socialSummary(board.posts, connections) : null} preview />
        <div className="mt-6">
          <GeneralRequests changes={suite.changes} preview />
        </div>
      </section>

      <section aria-labelledby="photos">
        <h2 id="photos" className="mb-4 display text-3xl">
          Their photos
        </h2>
        <PhotoLibrary photos={photos} readOnly />
      </section>

      <section aria-labelledby="numbers">
        <h2 id="numbers" className="mb-4 display text-3xl">
          Their numbers
        </h2>
        <CustomerStats metrics={metrics} canDelete={false} userId={user.id} />
      </section>

      <section aria-labelledby="board">
        <h2 id="board" className="mb-4 display text-3xl">
          Their board
        </h2>
        {board ? <div className="mb-6"><Calendar days={calendar(board.posts, new Date())} /></div> : null}
        {board ? (
          <ClientBoard brand={board.brand} posts={board.posts} preview />
        ) : (
          <p className="panel px-5 py-6 text-muted">No board yet. LiftPage opens one when your campaign starts.</p>
        )}
      </section>

      <section aria-labelledby="requests">
        <h2 id="requests" className="mb-4 display text-3xl">
          Their requests
        </h2>
        {holds.length ? <HoldList holds={holds} /> : <p className="text-muted">None on this account yet.</p>}
      </section>
    </>
  );
}
