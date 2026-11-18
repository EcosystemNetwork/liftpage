import Link from "next/link";
import { PasswordForm } from "@/components/AuthForms";
import { SyncButton } from "@/components/BoardForms";
import { ClientBoard } from "@/components/ClientBoard";
import { CustomerStats } from "@/components/CustomerStats";
import { Header } from "@/components/Header";
import { MetricForm } from "@/components/MetricForm";
import { HoldList } from "@/components/HoldList";
import { MessageThread } from "@/components/MessageThread";
import { requireUser } from "@/lib/dal";
import { boardForClient, connectionsFor, holdsFor } from "@/lib/store";
import { db, must } from "@/lib/supabase/server";
import { toMetric } from "@/lib/accounts";
import { loadThread, markRead } from "@/lib/messages";
import { planNotice, socialSummary } from "@/lib/plan";
import { loadSuite } from "@/lib/projects";
import { stripeReady } from "@/lib/stripe";
import { KICKER } from "@/lib/ui";
import { ProjectSuite } from "@/components/ProjectSuite";

export const metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const isClient = user.role === "client";
  const searched = await searchParams;
  const [rows, holds, board, suite] = await Promise.all([
    db().from("metrics").select("*").eq("user_id", user.id).order("week"),
    holdsFor(user.id),
    isClient ? boardForClient(user.id) : null,
    isClient ? loadSuite(user.id) : null,
  ]);
  const messages = isClient ? await loadThread(user.id) : [];
  // Opening the account is reading the thread: LiftPage's messages count as seen.
  if (messages.some((m) => m.role === "admin" && !m.readAt)) await markRead(user.id, "client");
  const unread = messages.filter((m) => m.role === "admin" && !m.readAt).length;
  const metrics = (must(rows, "load numbers") ?? []).map(toMetric);
  const connections = board ? await connectionsFor(board.brand.id) : [];
  const synced = connections.length > 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Header />
      <main id="main" className="mx-auto grid max-w-6xl gap-12 px-4 py-10 md:px-8 [&>*]:min-w-0">
        <section>
          <p className={`${KICKER} text-accent`}>{user.company}</p>
          <h1 className="mt-3 display text-5xl md:text-6xl">{user.name}</h1>
          <p className="mt-2 font-mono text-sm text-muted">{user.email}</p>
          {!isClient ? (
            <p className="mt-4 text-muted">
              Admin account. Client numbers live in{" "}
              <Link href="/admin" className="link">
                Admin
              </Link>
              .
            </p>
          ) : null}
        </section>

        {isClient && suite ? (
          <>
            <section id="projects" aria-labelledby="projects-title" className="scroll-mt-6">
              <h2 id="projects-title" className="display text-3xl">
                Your projects
              </h2>
              <p className="mt-2 mb-4 text-muted">Everything LiftPage builds and runs for you. Check on it any time, or ask for a change.</p>
              <ProjectSuite
                suite={suite}
                social={board ? socialSummary(board.posts, connections) : null}
                payments={stripeReady()}
                notice={planNotice(searched.plan)}
              />
            </section>

            <section id="messages" aria-labelledby="messages-title" className="max-w-3xl scroll-mt-6">
              <h2 id="messages-title" className="display text-3xl">
                Messages{unread ? <span className="ml-2 align-middle font-mono text-xs text-accent">{unread} new</span> : null}
              </h2>
              <p className="mt-2 mb-4 text-muted">Questions, assets, ideas, anything. The LiftPage team sees it on their side and replies here.</p>
              <MessageThread messages={messages} viewer="client" otherName="LiftPage" />
            </section>

            <section aria-labelledby="numbers">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 id="numbers" className="display text-3xl">
                  Your numbers
                </h2>
                {synced ? <SyncButton /> : null}
              </div>
              <CustomerStats metrics={metrics} canDelete userId={user.id} />
            </section>

            <section aria-labelledby="board">
              <h2 id="board" className="display text-3xl">
                Your board
              </h2>
              <p className="mt-2 mb-4 text-muted">
                What LiftPage plans to post. Approve a draft, send it back with a note, or comment. LiftPage schedules and publishes.
              </p>
              {board ? (
                <ClientBoard brand={board.brand} posts={board.posts} />
              ) : (
                <p className="panel px-5 py-6 text-muted">No board yet. LiftPage opens one when your campaign starts.</p>
              )}
            </section>

            <section aria-labelledby="log" className="max-w-3xl">
              <h2 id="log" className="display text-3xl">
                Log a week
              </h2>
              <p className="mt-2 mb-4 text-muted">Pull these from each platform&rsquo;s insights. LiftPage reads the same table.</p>
              <MetricForm today={today} />
            </section>

            <section aria-labelledby="requests">
              <h2 id="requests" className="display mb-4 text-3xl">
                Requests
              </h2>
              {holds.length ? (
                <HoldList holds={holds} />
              ) : (
                <p className="text-muted">
                  None on this account yet.{" "}
                  <Link href="/#start" className="link">
                    Start a campaign
                  </Link>
                </p>
              )}
            </section>
          </>
        ) : null}

        <section aria-labelledby="password" className="max-w-md">
          <h2 id="password" className="display mb-4 text-3xl">
            Password
          </h2>
          <PasswordForm />
        </section>
      </main>
    </>
  );
}
