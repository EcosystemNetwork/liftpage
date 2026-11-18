import "server-only";
import { findUser, toUser } from "./accounts";
import { notifyAddress, sendMail } from "./email";
import { limited } from "./rate";
import { siteUrl } from "./site";
import { db, must } from "./supabase/server";
import type { Message, Role, User } from "./types";

type Row = Record<string, unknown>;

export const MESSAGE_MAX = 4000;

function toMessage(row: Row): Message {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    authorId: (row.author_id as string | null) ?? undefined,
    authorName: (row.author_name as string) || "",
    role: row.role as Role,
    text: row.text as string,
    at: row.at as string,
    readAt: (row.read_at as string | null) ?? undefined,
  };
}

/** One client's thread, oldest first. */
export async function loadThread(clientId: string): Promise<Message[]> {
  const rows = must(await db().from("messages").select("*").eq("client_id", clientId).order("at"), "load messages");
  return (rows ?? []).map(toMessage);
}

export async function addMessage(input: { clientId: string; author: User; text: string }): Promise<Message> {
  const row = must(
    await db()
      .from("messages")
      .insert({
        client_id: input.clientId,
        author_id: input.author.id,
        author_name: input.author.role === "admin" ? input.author.name || "LiftPage" : input.author.name || input.author.email,
        role: input.author.role,
        text: input.text,
      })
      .select("*")
      .single(),
    "save message",
  );
  return toMessage(row as Row);
}

/** Marks what the other side wrote as read, now that `reader` has the thread open. */
export async function markRead(clientId: string, reader: Role) {
  const from: Role = reader === "admin" ? "client" : "admin";
  const { error } = await db()
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("role", from)
    .is("read_at", null);
  // Read receipts are a nicety; a failure here must not break the page.
  if (error) console.error("mark read", error.message);
}

export type InboxRow = { client: User; last: Message; unread: number; total: number };

/**
 * Every client thread for the admin inbox, newest activity first. Small agency scale: pulls
 * the latest 2,000 messages and folds them per client.
 */
export async function loadInbox(): Promise<InboxRow[]> {
  const rows = must(await db().from("messages").select("*").order("at", { ascending: false }).limit(2000), "load inbox");
  const threads = new Map<string, { last: Message; unread: number; total: number }>();
  for (const message of (rows ?? []).map(toMessage)) {
    const thread = threads.get(message.clientId) ?? { last: message, unread: 0, total: 0 };
    thread.total += 1;
    if (message.role === "client" && !message.readAt) thread.unread += 1;
    threads.set(message.clientId, thread);
  }
  if (!threads.size) return [];
  const people = must(await db().from("profiles").select("*").in("id", [...threads.keys()]), "load clients");
  const byId = new Map((people ?? []).map((row: Row) => [row.id as string, toUser(row)]));
  return [...threads.entries()]
    .flatMap(([id, thread]) => {
      const client = byId.get(id);
      return client ? [{ client, ...thread }] : [];
    })
    .sort((a, b) => b.last.at.localeCompare(a.last.at));
}

/** Client messages no admin has opened yet, across every thread. */
export async function unreadForAdmins(): Promise<number> {
  const { count, error } = await db()
    .from("messages")
    .select("id", { head: true, count: "exact" })
    .eq("role", "client")
    .is("read_at", null);
  if (error) {
    console.error("unread count", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Email the other side. Throttled per thread and direction, so a run of short messages
 * makes one email, not ten. Never throws: the message is already saved.
 */
export async function mailMessage(message: Message) {
  try {
    if (message.role === "client") {
      const to = notifyAddress();
      if (!to) return;
      if (await limited(`msg-in:${message.clientId}`, 1, 10 * 60_000)) return;
      const client = await findUser(message.clientId);
      await sendMail({
        to,
        subject: `New message from ${client?.company || message.authorName}`,
        lines: [`${message.authorName}: "${message.text}"`],
        action: { label: "Reply", url: `${siteUrl()}/admin/customers/${message.clientId}#messages` },
        replyTo: client?.email,
      });
    } else {
      const client = await findUser(message.clientId);
      if (!client || client.disabled) return;
      if (await limited(`msg-out:${message.clientId}`, 1, 10 * 60_000)) return;
      await sendMail({
        to: client.email,
        subject: "New message from LiftPage",
        lines: [`${message.authorName}: "${message.text}"`, "Reply from your account. Replies to this email aren't read by the app."],
        action: { label: "Open messages", url: `${siteUrl()}/account#messages` },
      });
    }
  } catch (error) {
    console.error("message mail", error);
  }
}
