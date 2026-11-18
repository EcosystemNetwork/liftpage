import Link from "next/link";
import { Header } from "@/components/Header";
import { RequestForm } from "@/components/RequestForm";
import { PACKAGES, type PackageId } from "@/lib/types";

const PLATFORMS = [
  ["Instagram", "Reels, carousels, stories, and the look of the brand."],
  ["TikTok", "Short video, founder interviews, and the cut people actually finish."],
  ["X", "Launches, build logs, and the thread the industry reads."],
  ["LinkedIn", "The post a customer, sponsor, or investor can forward."],
  ["YouTube", "Shorts, recaps, interviews, and the longer demo."],
];

const SERVICES = [
  ["Social media management", "The calendar, the daily posts, and the accounts."],
  ["Short-form video", "TikTok, Reels, and YouTube Shorts, cut for the feed."],
  ["Event marketing", "The week before, the day of, and the recap after."],
  ["Community growth", "Discord, X, and LinkedIn, where the people already are."],
  ["Founder branding", "A person on a cadence, in their own voice."],
  ["AI content production", "Drafts, cuts, and graphics. A person approves before anything goes live."],
  ["Influencer outreach", "Creators and communities who already hold the room."],
  ["Growth analytics", "Reach, replies, leads, and what turned into a customer."],
  ["Paid social", "Boosts and ads on the posts already working. Ad spend is billed at cost."],
  ["Livestream and podcast", "Demo days, panels, and interviews, run live and cut into clips after."],
  ["Email and newsletters", "The list you own, written on the same calendar as the posts."],
  ["Launch pages", "One page for the launch or the event, built to take the sign-up."],
  ["Press and announcements", "The release, the media list, and the post that goes out the same hour."],
];

const POSTS = [
  {
    platform: "X",
    handle: "@HARNESSROUTER",
    hook: "Day one. Build in public.",
    caption: "The Big Hack is in the build week. Stanford and Berkeley. Demo day is Friday. Today we show the teams, not the logo.",
  },
  {
    platform: "Instagram",
    handle: "@HARNESSROUTER",
    hook: "Three teams. Three sentences.",
    caption: "Build in public, day one. Three teams. One sentence each. No pitch deck. Demo day Friday.",
  },
  {
    platform: "TikTok",
    handle: "@HARNESSROUTER",
    hook: "What are you actually building?",
    caption: "Founder, one take, no intro. First frame is the question. Cut when they name the product.",
  },
  {
    platform: "LinkedIn",
    handle: "HarnessRouter Labs",
    hook: "The weekend ends. The list doesn't.",
    caption: "Demo day closes the hack. It should not close the room. Monday, people should still be able to point at the product.",
  },
];

const DAYS = [
  ["Nov 17", "Build in public", "Team intros, founder lines, a countdown."],
  ["Nov 18", "Product", "Previews, a product demo, reactions from the room."],
  ["Nov 19", "Competition", "Prize pool, judges, mentors, last call."],
  ["Nov 20", "Demo day", "Livestream, finalists, winners, the recap."],
];

const CLIENTS = [
  "AI startups launching a product",
  "Hackathon organizers",
  "Funds and accelerators",
  "Technology conferences",
  "Founders building a personal brand",
];

const RATE_ORDER: PackageId[] = ["starter", "growth", "accelerator", "event"];

const STEPS = [
  ["Plan", "We take the month, the launch, and the one result the posts have to earn."],
  ["Make", "Copy, short video, and graphics, written for each network."],
  ["Approve", "You read every post before it goes live."],
  ["Report", "What reached people, what started a conversation, what became a lead."],
];

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-14 md:px-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-end lg:pb-24 lg:pt-24">
            <div className="rise">
              <p className="eyebrow inline-flex items-center gap-2 text-muted">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                Digital media marketing
              </p>
              <h1 className="display mt-6 text-[3.5rem] sm:text-7xl lg:text-[6.5rem]">
                Attention
                <br />
                into <em className="text-accent">traction.</em>
              </h1>
              <p className="mt-8 max-w-lg text-lg leading-relaxed text-ink md:text-xl">
                We run digital media for companies creating the future. Posts, short video, and the campaign around a launch.
              </p>
              <p className="mt-3 max-w-md leading-relaxed text-muted">
                Startups, founders, hackathons, and innovation communities. Instagram, TikTok, X, LinkedIn, and YouTube.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/#start" className="btn-primary">
                  Start a campaign
                  <span aria-hidden="true">→</span>
                </Link>
                <Link href="/#work" className="btn-ghost">
                  See the work
                </Link>
              </div>
            </div>

            <aside className="rise rise-2 panel relative overflow-hidden shadow-card">
              <div className="flex items-center justify-between border-b border-dashed border-line px-5 py-3">
                <p className="eyebrow text-muted">On the calendar</p>
                <p className="eyebrow text-accent">Nov 17–20</p>
              </div>
              <div className="p-5 md:p-6">
                <h2 className="display text-4xl">The Big Hack</h2>
                <p className="mt-3 leading-relaxed">
                  A four-day social campaign for HarnessRouter Labs. Stanford and Berkeley. November 17–20.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Recruit the room, show what people are building, and leave HarnessRouter known on Monday.
                </p>
                <ol className="mt-6 grid grid-cols-4 gap-1.5" aria-label="Campaign days">
                  {DAYS.map(([day, title], i) => (
                    <li key={day} className={`rounded-lg px-2 py-2 ${i === 3 ? "bg-ink text-canvas" : "bg-sunken"}`}>
                      <span className="block font-mono text-[10px] uppercase tracking-wider opacity-70">{day}</span>
                      <span className="mt-1 block text-xs font-medium leading-tight">{title}</span>
                    </li>
                  ))}
                </ol>
                <a href="https://luma.com/t2598jt6" className="link mt-6 inline-flex min-h-10 items-center text-sm font-medium">
                  Event page ↗
                </a>
              </div>
            </aside>
          </div>
        </section>

        {/* Platforms */}
        <section id="platforms" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <SectionHead index="01" title="Platforms we run" />
            <ul>
              {PLATFORMS.map(([name, line], i) => (
                <li
                  key={name}
                  className="group grid gap-1 border-t border-line py-5 last:border-b md:grid-cols-[3rem_14rem_minmax(0,1fr)] md:items-baseline md:gap-6"
                >
                  <span className="hidden font-mono text-xs text-muted md:block">0{i + 1}</span>
                  <span className="display text-3xl transition-colors group-hover:text-accent md:text-4xl">{name}</span>
                  <span className="text-muted">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-20 border-b border-line bg-card">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <SectionHead index="02" title="Services">
              A growth partner for the accounts. One team covers the calendar, the video, and the report.
            </SectionHead>
            <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {SERVICES.map(([name, line]) => (
                <div key={name} className="bg-card p-5 last:sm:col-span-2 md:p-6">
                  <dt className="font-medium">{name}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-muted">{line}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Work */}
        <section id="work" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <SectionHead index="03" title="Work" />
              <div>
                <p className="display max-w-2xl text-3xl md:text-4xl">
                  HarnessRouter Labs. Four days of social heading into demo day.{" "}
                  <span className="text-muted">Up to $10,000 in prizes.</span>
                </p>
                <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {DAYS.map(([day, title, line], i) => (
                    <li key={day} className="panel flex flex-col p-4">
                      <span className="flex items-center justify-between font-mono text-xs text-muted">
                        <span className="text-accent">{day}</span>
                        <span>Day {i + 1}</span>
                      </span>
                      <span className="mt-6 font-medium">{title}</span>
                      <span className="mt-1 text-sm leading-relaxed text-muted">{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {POSTS.map((post) => (
                <article key={post.hook} className="panel p-5 transition-shadow hover:shadow-card md:p-6">
                  <header className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-9 items-center justify-center rounded-full bg-sunken font-mono text-xs font-medium"
                    >
                      {post.platform.slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{post.handle}</span>
                      <span className="block text-xs text-muted">{post.platform}</span>
                    </span>
                  </header>
                  <h3 className="display mt-5 text-2xl">{post.hook}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{post.caption}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Who + How */}
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-14 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-2">
            <div>
              <SectionHead index="04" title="Who it's for" />
              <ul className="mt-6">
                {CLIENTS.map((line) => (
                  <li key={line} className="flex items-baseline gap-3 border-t border-line py-4 text-lg last:border-b">
                    <span aria-hidden="true" className="text-accent">
                      ✦
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SectionHead index="05" title="How a month runs" />
              <ol className="mt-6 grid gap-3 sm:grid-cols-2">
                {STEPS.map(([title, line], index) => (
                  <li key={title} className="panel p-5">
                    <span className="display text-4xl text-accent">0{index + 1}</span>
                    <span className="mt-3 block font-medium">{title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">{line}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="rates" className="scroll-mt-20 border-b border-line bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <SectionHead index="06" title="Pricing" />
              <p className="max-w-xl text-lg leading-relaxed text-muted">
                Monthly retainers, plus a campaign price for a launch or a hackathon. Ad spend, travel, and a full shoot day are separate.
              </p>
            </div>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {RATE_ORDER.map((id) => {
                const featured = id === "growth";
                return (
                  <li
                    key={id}
                    className={`flex flex-col rounded-2xl border p-6 ${
                      featured ? "border-ink bg-ink text-canvas" : "border-line bg-canvas"
                    }`}
                  >
                    <p className="flex items-center justify-between">
                      <span className="font-medium">{PACKAGES[id].name}</span>
                      {featured ? <span className="eyebrow rounded-full bg-accent px-2 py-1 text-[10px] text-canvas">Popular</span> : null}
                    </p>
                    <p className={`display mt-6 text-4xl ${featured ? "" : "text-ink"}`}>{PACKAGES[id].price}</p>
                    <p className={`mt-1 text-xs ${featured ? "opacity-70" : "text-muted"}`}>{id === "event" ? "per campaign" : "per month"}</p>
                    <p className={`mt-6 flex-1 border-t pt-4 text-sm leading-relaxed ${featured ? "border-canvas/20" : "border-line text-muted"}`}>
                      {PACKAGES[id].deliver}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Start */}
        <section id="start" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
            <div>
              <p className="eyebrow text-accent">07 — Get started</p>
              <h2 className="display mt-4 text-5xl md:text-6xl">
                Start a <em>campaign.</em>
              </h2>
              <p className="mt-5 max-w-md leading-relaxed text-muted">
                Tell us the company and the package. We reply by email with a plan and a start date.
              </p>
            </div>
            <div className="panel p-5 shadow-card md:p-8">
              <RequestForm />
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:px-8">
          <p className="display text-6xl leading-none text-ink/90 sm:text-8xl md:text-9xl">
            LiftPage<span className="text-accent">.</span>
          </p>
          <div className="border-t border-line pt-6 text-sm text-muted">
            <p>Attention into traction.</p>
          </div>
        </div>
      </footer>
    </>
  );
}

function SectionHead({ index, title, children }: { index: string; title: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow text-accent">{index}</p>
      <h2 className="display mt-3 text-4xl md:text-5xl">{title}</h2>
      {children ? <p className="mt-4 max-w-xs leading-relaxed text-muted">{children}</p> : null}
    </div>
  );
}
