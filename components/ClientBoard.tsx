import { dayKey, formatDay, formatSlot } from "@/lib/time";
import { PLATFORM_NAME, type Brand, type Post } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { ReviewPost } from "./BoardForms";

const STATUS = { draft: "Draft", approved: "Approved", cued: "Scheduled" } as const;
const NOTE = { approved: "approved", changes: "asked for changes", comment: "commented" } as const;

/** The client's own board, read-only, by day. They approve, send back, or comment. */
export function ClientBoard({ brand, posts }: { brand: Brand; posts: Post[] }) {
  if (!posts.length) return <p className="border border-line px-4 py-6 text-mute">Nothing on {brand.name}&rsquo;s board yet. LiftPage will post the first lines here.</p>;
  const days = new Map<string, Post[]>();
  for (const post of [...posts].sort((a, b) => a.slot.localeCompare(b.slot))) {
    const key = dayKey(post.slot);
    days.set(key, [...(days.get(key) ?? []), post]);
  }
  return (
    <div className="grid gap-8">
      {[...days.values()].map((list) => (
        <section key={list[0].id}>
          <h3 className={`${KICKER} text-mute`}>{formatDay(list[0].slot)}</h3>
          <ul className="mt-2 grid gap-3">
            {list.map((post) => {
              const out = post.publishState === "published" || post.publishState === "publishing";
              return (
                <li key={post.id} className="grid gap-3 border border-line p-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                  <div className="min-w-0">
                    <p className={`${KICKER} text-mute`}>
                      {PLATFORM_NAME[post.platform]} · {formatSlot(post.slot)} ·{" "}
                      <span className={post.status === "draft" ? "text-paper" : "text-tape"}>{out ? "Published" : STATUS[post.status]}</span>
                    </p>
                    <p className="mt-2 font-semibold">{post.hook}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{post.caption}</p>
                    <p className="mt-2 text-sm text-mute">Visual: {post.visual}</p>
                    {post.publishedUrl ? (
                      <a href={post.publishedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-tape underline underline-offset-4">
                        See it live
                      </a>
                    ) : null}
                    {post.notes.length ? (
                      <ul className="mt-3 grid gap-2 border-t border-line pt-3">
                        {post.notes.map((note) => (
                          <li key={note.id} className="text-sm">
                            <span className={`${KICKER} ${note.kind === "changes" ? "text-heat" : "text-mute"}`}>
                              {note.role === "admin" ? "LiftPage" : note.authorName} {NOTE[note.kind]} · {formatSlot(note.at)}
                            </span>
                            {note.text ? <span className="mt-1 block whitespace-pre-wrap">{note.text}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <ReviewPost postId={post.id} status={post.status} locked={out} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
