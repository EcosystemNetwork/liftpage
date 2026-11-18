import { Header } from "@/components/Header";
import { Desk } from "@/components/Desk";
import { requireAdmin } from "@/lib/dal";
import { loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DeskPage() {
  await requireAdmin("/desk");
  const desk = await loadDesk();
  return (
    <>
      <Header />
      <main id="main">
        <Desk initial={desk} />
      </main>
    </>
  );
}
