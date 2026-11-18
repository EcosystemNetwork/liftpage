import Link from "next/link";
import { Header } from "@/components/Header";

const TABS = [
  ["/admin", "Overview"],
  ["/admin/messages", "Messages"],
  ["/admin/tools", "Tools"],
  ["/admin/activity", "Activity"],
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
        <nav aria-label="Admin" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 text-sm md:px-8">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex min-h-10 items-center rounded-full px-3 text-muted transition-colors hover:bg-sunken hover:text-ink">
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
