import "server-only";
import { notifyAddress, sendMail } from "./email";
import { siteUrl } from "./site";
import { loadHold } from "./store";
import { PACKAGES } from "./types";

/** The two emails a new request sets off. Keyed, so a retried job sends each once. */
export async function notifyHold(holdId: string): Promise<{ confirmation: boolean; notice: boolean }> {
  const hold = await loadHold(holdId);
  if (!hold) return { confirmation: false, notice: false };
  const pack = PACKAGES[hold.packageId];
  const confirmation = await sendMail({
    to: hold.email,
    subject: `LiftPage: your ${pack.name} request`,
    lines: [
      `${hold.name}, thanks. We have the request for ${hold.company}: ${pack.name}, ${pack.price}. ${pack.deliver}.`,
      "We'll reply from this address within one business day. Nothing has been charged unless you paid the deposit.",
    ],
    idempotencyKey: `hold-confirm/${hold.id}`,
  });
  const admin = notifyAddress();
  const notice = admin
    ? await sendMail({
        to: admin,
        subject: `New request: ${hold.company} · ${pack.name}`,
        lines: [`${hold.name} <${hold.email}> at ${hold.company} asked for ${pack.name} (${pack.price}).`],
        action: { label: "Open admin", url: `${siteUrl()}/admin` },
        replyTo: hold.email,
        idempotencyKey: `hold-notice/${hold.id}`,
      })
    : false;
  return { confirmation, notice };
}
