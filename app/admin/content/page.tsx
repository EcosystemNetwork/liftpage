import { ContentStudio } from "@/components/ContentStudio";
import { harnessModel, harnessName } from "@/lib/ai";
import { boardPlatforms, listDrafts, type ContentDraft } from "@/lib/content-drafts";
import { requireAdmin } from "@/lib/dal";
import { backendsReady, loadHarnessCatalog } from "@/lib/harness-catalog";
import { listBoards } from "@/lib/store";
import { KICKER } from "@/lib/ui";
import { FORMATS } from "@/lib/write";

export const metadata = { title: "Content" };

export default async function ContentPage() {
  await requireAdmin("/admin/content");
  const [boards, platforms, catalog, drafts] = await Promise.all([
    listBoards(),
    boardPlatforms(),
    loadHarnessCatalog(),
    // A missing table (migration not run yet) shouldn't take the whole studio down.
    listDrafts().catch((error: unknown): ContentDraft[] => {
      console.error("content drafts", error instanceof Error ? error.message : String(error));
      return [];
    }),
  ]);
  const ready = backendsReady();

  return (
    <>
      <section>
        <p className={`${KICKER} text-accent`}>Content</p>
        <h1 className="mt-3 display text-5xl md:text-6xl">Write it on any harness.</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Long-form pieces and social posts in each board&rsquo;s voice, routed through HarnessRouter with the harness and model you pick. Long-form is saved per
          board; posts go straight onto the board as drafts for approval.
        </p>
        <p className="mt-4 font-mono text-xs text-muted">
          HarnessRouter {ready.harnessrouter ? "on" : "off"} · TokenRouter {ready.tokenrouter ? "on" : "off"} · default {harnessName()} · {harnessModel()}
        </p>
      </section>
      <ContentStudio
        boards={boards.map((b) => ({
          id: b.id,
          label: b.company && b.company !== b.name ? `${b.name} · ${b.company}` : b.name,
          platforms: platforms[b.id] ?? [],
        }))}
        formats={Object.entries(FORMATS).map(([id, f]) => ({ id, label: f.label, hint: f.service }))}
        harnesses={catalog.harnesses}
        catalogLive={catalog.live}
        ready={ready}
        defaults={{ harness: harnessName(), model: harnessModel() }}
        initialDrafts={drafts}
      />
    </>
  );
}
