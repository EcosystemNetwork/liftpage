import Link from "next/link";
import { PasswordForm } from "@/components/AuthForms";
import { SyncButton } from "@/components/BoardForms";
import { ClientBoard } from "@/components/ClientBoard";
import { ClientWeekForm } from "@/components/ClientAi";
import { CampaignForm } from "@/components/CampaignForm";
import { ClientOverview } from "@/components/ClientOverview";
import { PhotoLibrary } from "@/components/PhotoLibrary";
import { SocialSetupForm } from "@/components/SocialSetup";
import { listPhotos, loadSetup } from "@/lib/client-files";
import { Writer } from "@/components/Writer";
import { aiReady } from "@/lib/ai";
import { FORMATS, isFormat } from "@/lib/formats";
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
import { overview } from "@/lib/overview";
import { planNotice, socialSummary } from "@/lib/plan";
import { loadSuite } from "@/lib/projects";
import { stripeReady } from "@/lib/stripe";
import { KICKER } from "@/lib/ui";
import { GeneralRequests, ProjectSuite } from "@/components/ProjectSuite";

export const metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const isClient = user.role === "client";
  const searched = await searchParams;
  const [rows, holds, board, suite, photos, setup] = await Promise.all([
    db().from("metrics").select("*").eq("user_id", user.id).order("week"),
    holdsFor(user.id),
    isClient ? boardForClient(user.id) : null,
    isClient ? loadSuite(user.id) : null,
    isClient ? listPhotos(user.id) : [],
    isClient ? loadSetup(user.id) : [],
  ]);
  const messages = isClient ? await loadThread(user.id) : [];
  // Opening the account is reading the thread: LiftPage's messages count as seen.
  if (messages.some((m) => m.role === "admin" && !m.readAt)) await markRead(user.id, "client");
  const unread = messages.filter((m) => m.role === "admin" && !m.readAt).length;
  const metrics = (must(rows, "load numbers") ?? []).map(toMetric);
  const connections = board ? await connectionsFor(board.brand.id) : [];
  const synced = connections.length > 0;
  const today = new Date().toISOString().slice(0, 10);
  const toReview = board
    ? board.posts.filter((p) => p.status === "draft" && p.publishState !== "published" && p.publishState !== "publishing").length
    : 0;
  // Onboarding: until they've told us about their social accounts, that's a to-do.
  const setupDue = isClient && !setup.length;

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
            <section aria-labelledby="todo-title" className="panel grid gap-4 p-6">
              <h2 id="todo-title" className="display text-3xl">
                {toReview || unread || setupDue ? "Needs you" : "Nothing needs you right now"}
              </h2>
              {toReview || unread || setupDue ? (
                <ul className="grid gap-3 text-lg">
                  {toReview ? (
                    <li>
                      <Link href="#board" className="btn-primary">
                        Look over {toReview} {toReview === 1 ? "post" : "posts"} before they go out
                      </Link>
                    </li>
                  ) : null}
                  {setupDue ? (
                    <li>
                      <Link href="#social-setup" className={toReview ? "btn-ghost" : "btn-primary"}>
                        Tell us about your social media accounts
                      </Link>
                    </li>
                  ) : null}
                  {unread ? (
                    <li>
                      <Link href="#messages" className="btn-ghost">
                        Read {unread} new {unread === 1 ? "message" : "messages"} from LiftPage
                      </Link>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="text-lg text-muted">We&rsquo;ll email you when there&rsquo;s a post to look over or a message to read.</p>
              )}
            </section>

            <ClientOverview
              company={user.company}
              since={user.createdAt}
              handle={board?.brand.handle}
              plan={suite.plan}
              projects={suite.projects}
              data={overview({ metrics, posts: board?.posts ?? [], connections, platforms: board?.brand.platforms ?? [] })}
            />

            <section id="start-campaign" aria-labelledby="campaign-title" className="max-w-3xl scroll-mt-20">
              <h2 id="campaign-title" className="display text-3xl">
                Start a campaign
              </h2>
              <p className="mt-2 mb-4 text-muted">Pick a package and tell us what it&rsquo;s for. We reply within one business day.</p>
              <CampaignForm />
            </section>

            <section id="photos" aria-labelledby="photos-title" className="scroll-mt-20">
              <h2 id="photos-title" className="display text-3xl">
                Your photos
              </h2>
              <p className="mt-2 mb-4 text-muted">Give us photos to post: your place, your people, your products. Add a note if a photo is for something special.</p>
              <PhotoLibrary photos={photos} />
            </section>

            <section id="social-setup" aria-labelledby="social-setup-title" className="max-w-3xl scroll-mt-20">
              <h2 id="social-setup-title" className="display text-3xl">
                Your social media accounts
              </h2>
              <p className="mt-2 mb-4 text-muted">Tell us which accounts you already have, or have us make them for you.</p>
              <SocialSetupForm setup={setup} />
            </section>

            {board && user.tools.length ? (
              <section id="tools" aria-labelledby="ai-tools" className="scroll-mt-20">
                <h2 id="ai-tools" className="display text-3xl">
                  Your tools
                </h2>
                <p className="mt-2 mb-4 text-muted">
                  Switched on for you by LiftPage. They work on your board only. Drafts you make wait for review; nothing is scheduled without an approval.
                </p>
                <div className="grid gap-6">
                  {user.tools.includes("week") ? (
                    <div className="max-w-2xl">
                      <ClientWeekForm />
                    </div>
                  ) : null}
                  {user.tools.some(isFormat) ? (
                    <Writer
                      ready={aiReady()}
                      boards={[{ id: board.brand.id, label: board.brand.name }]}
                      formats={user.tools.filter(isFormat).map((id) => ({ id, label: FORMATS[id].label, hint: FORMATS[id].service }))}
                    />
                  ) : null}
                  {user.tools.includes("redraft") ? <p className="text-sm text-muted">To redraft a post, find it under Posts to approve and say what to change.</p> : null}
                </div>
              </section>
            ) : null}

            <section id="board" aria-labelledby="board-title" className="scroll-mt-20">
              <h2 id="board-title" className="display text-3xl">
                Posts to approve
              </h2>
              <p className="mt-2 mb-4 text-muted">
                Here&rsquo;s what we plan to post for you. Press <strong>Approve</strong> if it looks right, or{" "}
                <strong>Request changes</strong> and tell us what to fix. We handle the posting.
              </p>
              {board ? (
                <ClientBoard brand={board.brand} posts={board.posts} canRedraft={user.tools.includes("redraft")} />
              ) : (
                <p className="panel px-5 py-6 text-muted">No posts yet. They&rsquo;ll show up here once your campaign starts.</p>
              )}
            </section>

            <section id="messages" aria-labelledby="messages-title" className="max-w-3xl scroll-mt-20">
              <h2 id="messages-title" className="display text-3xl">
                Messages{unread ? <span className="ml-2 align-middle font-mono text-xs text-accent">{unread} new</span> : null}
              </h2>
              <p className="mt-2 mb-4 text-muted">Write to us about anything: questions, photos, ideas. We reply here and by email.</p>
              <MessageThread messages={messages} viewer="client" otherName="LiftPage" />
            </section>

            <section id="projects" aria-labelledby="projects-title" className="scroll-mt-20">
              <h2 id="projects-title" className="display text-3xl">
                Your website and social media
              </h2>
              <p className="mt-2 mb-4 text-muted">Everything we build and run for you. Check on it any time, or ask us for a change.</p>
              <ProjectSuite
                suite={suite}
                social={board ? socialSummary(board.posts, connections) : null}
                payments={stripeReady()}
                notice={planNotice(searched.plan)}
              />
            </section>

            <section id="changes" aria-labelledby="changes-title" className="scroll-mt-20">
              <h2 id="changes-title" className="display text-3xl">
                Ask for a change
              </h2>
              <p className="mt-2 mb-4 text-muted">Anything at all, about any part of what we do for you. For one post, use Request changes on that post.</p>
              <GeneralRequests changes={suite.changes} />
            </section>

            <section aria-labelledby="numbers">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 id="numbers" className="display text-3xl">
                  How your posts are doing
                </h2>
                {synced ? <SyncButton /> : null}
              </div>
              <CustomerStats metrics={metrics} canDelete userId={user.id} />
            </section>

            <section aria-labelledby="requests">
              <h2 id="requests" className="display mb-4 text-3xl">
                Your orders
              </h2>
              {holds.length ? (
                <HoldList holds={holds} />
              ) : (
                <p className="text-muted">
                  None yet.{" "}
                  <Link href="#start-campaign" className="link">
                    Start a campaign
                  </Link>
                </p>
              )}
            </section>

            <details className="max-w-3xl">
              <summary className="cursor-pointer text-muted">Enter your numbers yourself (optional)</summary>
              <div className="mt-4">
                <p className="mb-4 text-sm text-muted">
                  You don&rsquo;t need to do this. We fill in your numbers for you. If you&rsquo;d like to add some yourself, copy them
                  from each platform&rsquo;s insights page.
                </p>
                <MetricForm today={today} />
              </div>
            </details>
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
