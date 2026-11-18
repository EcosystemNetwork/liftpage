import Link from "next/link";
import { Header } from "@/components/Header";
import { KICKER } from "@/lib/ui";

const TABS = [
  ["/admin", "Overview"],
  ["/admin/messages", "Messages"],
  ["/admin/users", "Users"],
  ["/admin/setup", "Setup"],
  ["/desk", "Desk"],
];

/** Chrome only. Each page checks the role itself; layouts don't re-run on every navigation. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <Header />
      <div className="border-b border-line">
        <nav aria-label="Admin" className={`mx-auto flex max-w-6xl gap-1 px-4 md:px-8 ${KICKER}`}>
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex min-h-10 items-center px-2 text-mute hover:text-paper">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <main id="main" className="mx-auto grid max-w-6xl gap-12 px-4 py-10 md:px-8 [&>*]:min-w-0">
        {children}
      </main>
    </>
  );
}
