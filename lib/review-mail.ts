import "server-only";
import { findUser } from "./accounts";
import { notifyAddress, sendMail } from "./email";
import { limited } from "./rate";
import { siteUrl } from "./site";
import { loadBrand } from "./store";
import { PLATFORM_NAME, type NoteKind, type Post } from "./types";

/**
 * Mail for the review loop. Every send is throttled per board or per post, so a burst of
 * clicks or comments makes one email, not ten. Never throws: a mail hiccup must not fail
 * the review itself.
 */
async function safely(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    console.error("review mail", error);
  }
}

/** LiftPage → client: lines are waiting on their board. */
export async function mailReadyForReview(brandId: string, drafts: number): Promise<"sent" | "throttled" | "no-client" | "no-email"> {
  const brand = await loadBrand(brandId);
  const client = brand?.clientId ? await findUser(brand.clientId) : undefined;
  if (!brand || !client || client.disabled) return "no-client";
  if (await limited(`review-ready:${brandId}`, 1, 10 * 60_000)) return "throttled";
  const sent = await sendMail({
    to: client.email,
    subject: `${drafts} line${drafts === 1 ? "" : "s"} ready for your review`,
    lines: [
      `${client.name || "Hi"}, LiftPage put ${drafts} line${drafts === 1 ? "" : "s"} on the ${brand.name} board.`,
      "Approve what's right, send back what isn't with a note. Nothing goes out until it's approved.",
    ],
    action: { label: "Review the board", url: `${siteUrl()}/account#board` },
  });
  return sent ? "sent" : "no-email";
}

/** Client → LiftPage: a review that needs a person (changes or a comment). */
export async function mailClientReview(post: Post, brandId: string, kind: NoteKind, text: string, author: string) {
  if (kind === "approved") return;
  const to = notifyAddress();
  if (!to) return;
  await safely(async () => {
    if (await limited(`review-in:${post.id}:${kind}`, 1, 10 * 60_000)) return;
    const brand = await loadBrand(brandId);
    await sendMail({
      to,
      subject: `${brand?.name ?? "A client"} ${kind === "changes" ? "sent back" : "commented on"} a ${PLATFORM_NAME[post.platform]} line`,
      lines: [`${author}: "${text}"`, `The line: ${post.hook}`],
      action: { label: "Open the board", url: `${siteUrl()}/desk?board=${encodeURIComponent(brandId)}` },
    });
  });
}

/** LiftPage → client: a reply on one of their lines. */
export async function mailAdminReply(post: Post, brandId: string, text: string) {
  await safely(async () => {
    const brand = await loadBrand(brandId);
    const client = brand?.clientId ? await findUser(brand.clientId) : undefined;
    if (!client || client.disabled) return;
    if (await limited(`review-reply:${post.id}`, 1, 10 * 60_000)) return;
    await sendMail({
      to: client.email,
      subject: `LiftPage replied on your ${PLATFORM_NAME[post.platform]} line`,
      lines: [`"${text}"`, `The line: ${post.hook}`],
      action: { label: "See the board", url: `${siteUrl()}/account#board` },
    });
  });
}
