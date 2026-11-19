import Link from "next/link";
import { removeCreative, saveBrandKit } from "@/app/actions/creative";
import { CreativeStudio } from "@/components/CreativeStudio";
import { draftsFor, listCreatives, loadKit } from "@/lib/creative-store";
import { requireAdmin } from "@/lib/dal";
import { listBoards } from "@/lib/store";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Creative" };

export default async function CreativePage({ searchParams }: PageProps<"/admin/creative">) {
  await requireAdmin("/admin/creative");
  const boards = await listBoards();
  const asked = (await searchParams).board;
  const board = boards.find((b) => b.id === asked) ?? boards[0];
  if (!board) return <p className="panel px-5 py-6 text-muted">No boards yet.</p>;
  const [kit, creatives, drafts] = await Promise.all([loadKit(board.id), listCreatives(board.id), draftsFor(board.id)]);

  return (
    <>
      <section>
        <p className={`${KICKER} text-accent`}>Creative</p>
        <h1 className="mt-3 display text-5xl md:text-6xl">Carousels and scripts, on brand.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Slides are drawn from the board&apos;s brand kit, not by an image model, so they match every time. Download them as PNGs or put one on a draft post.
          Scripts are for a person with a phone to shoot.
        </p>
        <nav aria-label="Boards" className="mt-5 flex flex-wrap gap-2">
          {boards.map((b) => (
            <Link
              key={b.id}
              href={`/admin/creative?board=${encodeURIComponent(b.id)}`}
              aria-current={b.id === board.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${b.id === board.id ? "border-ink bg-ink text-canvas" : "border-line text-muted hover:text-ink"}`}
            >
              {b.company ? `${b.company} · ${b.name}` : b.name}
            </Link>
          ))}
        </nav>
      </section>

      <section aria-labelledby="kit" className="panel px-5 py-5">
        <h2 id="kit" className="font-semibold">
          Brand kit
        </h2>
        <form action={saveBrandKit} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="brandId" value={board.id} />
          {(
            [
              ["background", "Background"],
              ["text", "Text"],
              ["accent", "Accent"],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="grid gap-1" htmlFor={`kit-${name}`}>
              {label}
              <input id={`kit-${name}`} type="color" name={name} defaultValue={kit[name]} className="h-10 w-16 rounded border border-line" />
            </label>
          ))}
          <label className="grid gap-1" htmlFor="kit-font">
            Type
            <select id="kit-font" name="font" defaultValue={kit.font} className="field">
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label className="grid gap-1" htmlFor="kit-signature">
            Sign-off
            <input id="kit-signature" name="signature" defaultValue={kit.signature} placeholder="@handle or site.com" className="field" />
          </label>
          <button type="submit" className="btn-ghost">
            Save kit
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">If the text colour is hard to read on the background, it switches to black or white.</p>
      </section>

      <CreativeStudio brandId={board.id} kit={kit} creatives={creatives} drafts={drafts} removeAction={removeCreative} />
    </>
  );
}
