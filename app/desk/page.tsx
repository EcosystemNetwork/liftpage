import { Header } from "@/components/Header";
import { Desk } from "@/components/Desk";
import { loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DeskPage() {
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
