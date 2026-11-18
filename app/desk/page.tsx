import { Header } from "@/components/Header";
import { Desk } from "@/components/Desk";
import { requireAdmin } from "@/lib/dal";
import { loadDesk } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DeskPage({ searchParams }: PageProps<"/desk">) {
  const { board, connected, connect_error } = await searchParams;
  await requireAdmin("/desk");
  const desk = await loadDesk(typeof board === "string" ? board : undefined);
  const flash =
    typeof connected === "string"
      ? { tone: "ok" as const, text: `Connected ${connected}.` }
      : typeof connect_error === "string"
        ? { tone: "error" as const, text: connect_error }
        : undefined;
  return (
    <>
      <Header />
      <main id="main">
        {/* Keyed on the board so switching boards resets the desk's local state. */}
        <Desk key={desk.brand.id} initial={desk} flash={flash} />
      </main>
    </>
  );
}
