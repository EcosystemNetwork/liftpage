"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { findUser } from "@/lib/accounts";
import { track } from "@/lib/analytics";
import { requireUser } from "@/lib/dal";
import { addMessage, mailMessage, MESSAGE_MAX } from "@/lib/messages";
import { limited } from "@/lib/rate";
import type { FormState } from "./auth";

/**
 * Sends a message in a client's thread. A client always writes to their own thread; an
 * admin names the client. Clients are held to 30 messages per 10 minutes.
 */
export async function sendMessage(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser();
  const raw = data.get("text");
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { error: "Write the message first." };
  if (text.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX.toLocaleString()} characters.`, fields: { text } };

  let clientId = me.id;
  if (me.role === "admin") {
    const asked = data.get("clientId");
    const client = typeof asked === "string" && /^[0-9a-f-]{36}$/i.test(asked) ? await findUser(asked) : undefined;
    if (!client || client.role !== "client") return { error: "Messages go to client accounts.", fields: { text } };
    clientId = client.id;
  } else if (await limited(`msg-send:${me.id}`, 30, 10 * 60_000)) {
    return { error: "That's a lot of messages at once. Give it a few minutes.", fields: { text } };
  }

  const message = await addMessage({ clientId, author: me, text });
  await track(me.id, "message_sent", { role: me.role });
  after(() => mailMessage(message));
  refresh();
  return { ok: "Sent." };
}
