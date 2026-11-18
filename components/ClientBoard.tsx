import { dayKey, formatDay, formatSlot } from "@/lib/time";
import { PLATFORM_NAME, type Brand, type Post } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { ReviewPost } from "./BoardForms";

const STATUS = { draft: "Draft", approved: "Approved", cued: "Scheduled" } as const;
const NOTE = { approved: "approved", changes: "asked for changes", comment: "commented" } as const;

/**
 * The client's own board, read-only, by day. They approve, send back, or comment.
 * `preview` is the admin's view-as-client: same board, no review buttons.
 */
export function ClientBoard({ brand, posts, preview = false }: { brand: Brand; posts: Post[]; preview?: boolean }) {
  if (!posts.length) return <p className="panel px-5 py-6 text-muted">Nothing on {brand.name}&rsquo;s board yet. LiftPage will post the first lines here.</p>;
  const days = new Map<string, Post[]>();
  for (const post of [...posts].sort((a, b) => a.slot.localeCompare(b.slot))) {
    const key = dayKey(post.slot);
    days.set(key, [...(days.get(key) ?? []), post]);
  }
  return (
    <div className="grid gap-8">
      {[...days.values()].map((list) => (
        <section key={list[0].id}>
          <h3 className={`${KICKER} text-muted`}>{formatDay(list[0].slot)}</h3>
          <ul className="mt-2 grid gap-3">
            {list.map((post) => {
              const out = post.publishState === "published" || post.publishState === "publishing";
              return (
                <li key={post.id} className="grid gap-3 border border-line p-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                  <div className="min-w-0">
                    <p className={`${KICKER} text-muted`}>
                      {PLATFORM_NAME[post.platform]} · {formatSlot(post.slot)} ·{" "}
                      <span className={post.status === "draft" ? "text-ink" : "text-accent"}>{out ? "Published" : STATUS[post.status]}</span>
                    </p>
                    <p className="mt-2 font-semibold">{post.hook}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{post.caption}</p>
                    <p className="mt-2 text-sm text-muted">Visual: {post.visual}</p>
                    {post.publishedUrl ? (
                      <a href={post.publishedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm link">
                        See it live
                      </a>
                    ) : null}
                    {post.notes.length ? (
                      <ul className="mt-3 grid gap-2 border-t border-line pt-3">
                        {post.notes.map((note) => (
                          <li key={note.id} className="text-sm">
                            <span className={`${KICKER} ${note.kind === "changes" ? "text-danger" : "text-muted"}`}>
                              {note.role === "admin" ? "LiftPage" : note.authorName} {NOTE[note.kind]} · {formatSlot(note.at)}
                            </span>
                            {note.text ? <span className="mt-1 block whitespace-pre-wrap">{note.text}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {preview ? (
                    <p className={`${KICKER} text-muted`}>Preview: the client approves, sends back, or comments here.</p>
                  ) : (
                    <ReviewPost postId={post.id} status={post.status} locked={out} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
