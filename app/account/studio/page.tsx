import Link from "next/link";
import { Header } from "@/components/Header";
import { Studio } from "@/components/Studio";
import { requireUser } from "@/lib/dal";
import { studioReady } from "@/lib/studio";
import { canUse } from "@/lib/tools";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Content studio" };

export default async function StudioPage({ searchParams }: PageProps<"/account/studio">) {
  const user = await requireUser("/account/studio");
  const { t } = await searchParams;
  const allowed = canUse(user, "studio");

  return (
    <>
      <Header />
      <main id="main" className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:px-8 [&>*]:min-w-0">
        <section>
          <p className={`${KICKER} text-accent`}>
            <Link href={user.role === "admin" ? "/admin/tools" : "/account"} className="link">
              {user.role === "admin" ? "Tools" : "Account"}
            </Link>{" "}
            / Content studio
          </p>
          <h1 className="mt-3 display text-5xl md:text-6xl">Content studio</h1>
          <p className="mt-3 max-w-[70ch] text-muted">
            Social posts, carousels and short-video scripts from the content agent, grounded in what you give it: your site, a brief, product photos, past posts.
            Everything it makes is a draft.
          </p>
        </section>
        {allowed ? (
          <Studio ready={studioReady()} initialThread={typeof t === "string" ? t : undefined} />
        ) : (
          <p className="panel px-5 py-6 text-muted">
            The content studio isn&rsquo;t switched on for your account.{" "}
            <Link href="/account#messages" className="link">
              Ask LiftPage
            </Link>{" "}
            to turn it on.
          </p>
        )}
      </main>
    </>
  );
}
