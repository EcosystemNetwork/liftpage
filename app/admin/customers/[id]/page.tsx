import Link from "next/link";
import { notFound } from "next/navigation";
import { OpenBoardForm, SyncButton } from "@/components/BoardForms";
import { CustomerStats } from "@/components/CustomerStats";
import { HoldList } from "@/components/HoldList";
import { MessageThread } from "@/components/MessageThread";
import { MetricForm } from "@/components/MetricForm";
import { findUser, toMetric } from "@/lib/accounts";
import { requireAdmin } from "@/lib/dal";
import { loadThread, markRead } from "@/lib/messages";
import { boardForClient, connectionsFor, holdsFor } from "@/lib/store";
import { db, must } from "@/lib/supabase/server";
import { PLATFORM_NAME } from "@/lib/types";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/customers/${id}`);
  // Ids are uuids; anything else is a 404, not a database error.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await findUser(id);
  if (!user || user.role !== "client") notFound();
  const [rows, holds, board] = await Promise.all([
    db().from("metrics").select("*").eq("user_id", user.id).order("week"),
    holdsFor(user.id),
    boardForClient(user.id),
  ]);
  const messages = await loadThread(user.id);
  if (messages.some((m) => m.role === "client" && !m.readAt)) await markRead(user.id, "admin");
  const metrics = (must(rows, "load numbers") ?? []).map(toMetric);
  const connections = board ? await connectionsFor(board.brand.id) : [];
  const waiting = board ? board.posts.filter((post) => post.notes.at(-1)?.kind === "changes").length : 0;

  return (
    <>
      <section>
        <p className={`${KICKER} text-tape`}>Customer</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{user.company}</h1>
        <p className="mt-2 text-mute">
          {user.name} · <span className="font-mono text-sm">{user.email}</span>
          {user.disabled ? " · switched off" : ""}
        </p>
      </section>

      <section id="messages" aria-labelledby="messages-title" className="max-w-3xl scroll-mt-6">
        <h2 id="messages-title" className="mb-4 text-2xl font-semibold">
          Messages
        </h2>
        <MessageThread messages={messages} viewer="admin" clientId={user.id} otherName={user.name || user.company} />
      </section>

      <section aria-labelledby="board">
        <h2 id="board" className="mb-4 text-2xl font-semibold">
          Board
        </h2>
        {board ? (
          <div className="grid gap-2">
            <p>
              <Link href={`/desk?board=${board.brand.id}`} className="text-tape underline underline-offset-4">
                Open {board.brand.name} on the desk
              </Link>
            </p>
            <p className="font-mono text-xs text-mute">
              {board.posts.length} lines · {board.posts.filter((p) => p.status === "draft").length} awaiting approval · {waiting} sent back
              · networks: {connections.length ? connections.map((c) => `${PLATFORM_NAME[c.platform]} ${c.accountName}`).join(", ") : "none connected"}
            </p>
          </div>
        ) : (
          <div className="max-w-2xl">
            <p className="mb-4 text-mute">No board yet. Open one and it shows up on the desk and on the client&rsquo;s account.</p>
            <OpenBoardForm clientId={user.id} company={user.company} />
          </div>
        )}
      </section>

      <section aria-labelledby="numbers">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="numbers" className="text-2xl font-semibold">
            Numbers
          </h2>
          {connections.length ? <SyncButton userId={user.id} /> : null}
        </div>
        <CustomerStats metrics={metrics} canDelete userId={user.id} />
      </section>

      <section aria-labelledby="log" className="max-w-3xl">
        <h2 id="log" className="mb-4 text-2xl font-semibold">
          Log a week for {user.company}
        </h2>
        <MetricForm userId={user.id} today={new Date().toISOString().slice(0, 10)} />
      </section>

      <section aria-labelledby="requests">
        <h2 id="requests" className="mb-4 text-2xl font-semibold">
          Requests
        </h2>
        {holds.length ? <HoldList holds={holds} admin /> : <p className="text-mute">None linked.</p>}
      </section>
    </>
  );
}
