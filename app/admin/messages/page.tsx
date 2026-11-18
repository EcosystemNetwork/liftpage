import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { loadInbox } from "@/lib/messages";
import { formatStamp } from "@/lib/time";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  await requireAdmin("/admin/messages");
  const inbox = await loadInbox();
  const unread = inbox.reduce((sum, row) => sum + row.unread, 0);

  return (
    <>
      <section>
        <p className={`${KICKER} text-accent`}>Messages</p>
        <h1 className="mt-3 display text-5xl md:text-6xl">{unread ? `${unread} waiting on a reply.` : "All caught up."}</h1>
        <p className="mt-3 text-muted">
          One thread per client. Open one to read and reply; the client sees it on their account. To write first, open the client from{" "}
          <Link href="/admin" className="link">
            Customers
          </Link>
          .
        </p>
      </section>

      <section aria-label="Threads">
        {inbox.length ? (
          <ul className="grid border border-line">
            {inbox.map(({ client, last, unread: count, total }) => (
              <li key={client.id} className="border-b border-line last:border-0">
                <Link href={`/admin/customers/${client.id}#messages`} className="grid gap-1 px-4 py-3 hover:bg-line/40">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className={`font-semibold ${count ? "text-accent" : ""}`}>
                      {client.company || client.name}
                      <span className="ml-2 font-normal text-muted">{client.name}</span>
                    </span>
                    <span className={`${KICKER} text-muted`}>
                      {count ? <span className="mr-2 text-accent">{count} new</span> : null}
                      {formatStamp(last.at)}
                    </span>
                  </span>
                  <span className="truncate text-sm text-muted">
                    {last.role === "admin" ? "You: " : ""}
                    {last.text}
                  </span>
                  <span className="font-mono text-[11px] text-muted">{total} message{total === 1 ? "" : "s"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel px-5 py-6 text-muted">No messages yet. Clients write from their account page.</p>
        )}
      </section>
    </>
  );
}
