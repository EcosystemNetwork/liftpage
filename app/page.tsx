import Link from "next/link";
import { Header } from "@/components/Header";
import { RequestForm } from "@/components/RequestForm";
import { PACKAGES, type PackageId } from "@/lib/types";

/* Layout from the Stitch project "LiftPage Redesign" (.stitch/designs/landing.*). Copy is ours. */

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
  ["Influencer outreach", "Creators and communities who already hold the room."],
  ["Growth analytics", "Reach, replies, leads, and what turned into a customer."],
  ["Paid social", "Boosts and ads on the posts already working. Ad spend is billed at cost."],
  ["Livestream and podcast", "Launches, panels, and interviews, run live and cut into clips after."],
  ["Email and newsletters", "The list you own, written on the same calendar as the posts."],
  ["Launch pages", "One page for the launch or the event, built to take the sign-up."],
  ["Press and announcements", "The release, the media list, and the post that goes out the same hour."],
];

const POSTS = [
  {
    platform: "TikTok",
    handle: "@YOURCOMPANY",
    hook: "What are you actually building?",
    caption: "Founder, one take, no intro. First frame is the question.",
  },
  {
    platform: "Instagram",
    handle: "@YOURCOMPANY",
    hook: "One product. Three sentences.",
    caption: "What it does, who it's for, why now. No pitch deck.",
  },
  {
    platform: "X",
    handle: "@YOURCOMPANY",
    hook: "Launch day is Thursday.",
    caption: "Three days out. Today we show the problem, not the logo. Tomorrow, the product.",
  },
];

const DAYS = [
  ["Mon", "Teaser", "The problem, a founder line, a countdown.", ["Founder teaser post", "Countdown on every network"]],
  ["Tue", "Product", "The demo, the first users, what it replaces.", ["Demo cut for short video", "First-user quotes"]],
  ["Wed", "Launch", "The launch post, the thread, the livestream.", ["Launch post and thread", "Livestream, clipped after"]],
  ["Thu", "Recap", "Reactions, clips, and the follow-up.", ["Reaction roundup", "The follow-up that keeps it going"]],
] as const;

const CLIENTS = [
  ["AI startups launching a product", "The launch, the demo, and the week after."],
  ["Founders building a personal brand", "A person on a cadence, in their own voice."],
  ["Funds and accelerators", "Portfolio news, demo days, and the thesis."],
  ["Technology conferences and events", "Speakers, tickets, the day itself, and the recap."],
  ["Developer and builder communities", "Releases, hackathons, and the people who show up."],
];

const ENGINE = [
  ["Intake", "Brief to week", "Give us the launch. Agents on HarnessRouter draft every post, for every network on the calendar."],
  ["Iteration", "Second pass", "Another agent run tightens the cut. Same facts, fewer words, the voice of the brand."],
  ["Gate", "A person signs off", "Nothing publishes on its own. We read, edit, and approve every post before it goes live."],
];

const STEPS = [
  ["Plan", "We take the month, the launch, and the one result the posts have to earn."],
  ["Make", "Copy, short video, and graphics, written for each network."],
  ["Approve", "You read every post before it goes live."],
  ["Report", "What reached people, what started a conversation, what became a lead."],
];

const RATE_ORDER: PackageId[] = ["starter", "growth", "accelerator", "event"];

const SHELL = "mx-auto max-w-6xl px-4 md:px-8";

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-48 size-[40rem] rounded-full bg-accent/10 blur-3xl"
          />
          <div className={`relative grid gap-14 pb-16 pt-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:pb-20 lg:pt-20 ${SHELL}`}>
            <div className="rise">
              <p className="eyebrow inline-flex items-center gap-2 text-accent">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                Digital media · Built on HarnessRouter
              </p>
              <h1 className="display mt-6 text-[3.5rem] sm:text-7xl lg:text-[6.25rem]">
                Attention into <em className="text-accent">traction.</em>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed md:text-xl">
                We run digital media for companies creating the future. Posts, short video, and the campaign around a launch.
              </p>
              <p className="mt-3 max-w-md leading-relaxed text-muted">
                Startups, founders, funds, and the communities around them.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link href="/#start" className="btn-primary min-h-12 px-6 text-base">
                  Start a campaign <span aria-hidden="true">→</span>
                </Link>
                <Link href="/#work" className="btn-ghost min-h-12 px-6 text-base">
                  See the work
                </Link>
                <span className="eyebrow ml-1 inline-flex items-center gap-2 text-[0.6875rem] text-muted">
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />A person approves every post
                </span>
              </div>
            </div>

            <PostStack />
          </div>

          {/* Platforms strip */}
          <div id="platforms" className={`scroll-mt-20 pb-16 md:pb-24 ${SHELL}`}>
            <h2 className="sr-only">Platforms we run</h2>
            <ul className="grid border-y border-line sm:grid-cols-2 lg:grid-cols-5">
              {PLATFORMS.map(([name, line], i) => (
                <li
                  key={name}
                  className={`group border-line py-5 sm:px-5 ${i > 0 ? "border-t sm:border-t-0" : ""} ${
                    i % 2 === 1 ? "sm:border-l" : ""
                  } lg:border-l lg:first:border-l-0 lg:first:pl-0 ${i > 1 ? "sm:border-t lg:border-t-0" : ""}`}
                >
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className="text-sm text-accent">
                      ✦
                    </span>
                    <span className="display text-3xl transition-colors group-hover:text-accent">{name}</span>
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-muted">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 01 Launch week */}
        <section id="work" className="scroll-mt-20 border-t border-line">
          <div className={`py-16 md:py-24 ${SHELL}`}>
            <SectionHead
              index="01"
              label="Launch week"
              title={
                <>
                  Four days. <em className="text-accent">One launch.</em>
                </>
              }
            >
              Build the room before launch day, show the product on it, and keep people talking after. A sample week.
            </SectionHead>
            <ol className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <span aria-hidden="true" className="absolute inset-x-6 top-1/2 hidden h-px bg-line lg:block" />
              {DAYS.map(([day, title, line, items], i) => {
                const live = i === 2;
                return (
                  <li
                    key={day}
                    className={`relative flex flex-col rounded-2xl border p-6 ${
                      live ? "border-ink bg-ink text-canvas shadow-card lg:-translate-y-2" : "border-line bg-card"
                    }`}
                  >
                    <span className="flex items-center justify-between font-mono text-sm uppercase tracking-wider">
                      <span className="text-accent">{day}</span>
                      <span
                        aria-hidden="true"
                        className={`size-3 rounded-full border-2 border-accent ${live ? "bg-accent" : ""}`}
                      />
                    </span>
                    <span className={`eyebrow mt-4 text-[0.6875rem] ${live ? "opacity-70" : "text-muted"}`}>Day {i + 1}</span>
                    {live ? (
                      <span className="eyebrow mt-3 w-fit rounded-full bg-accent px-2.5 py-1 text-[0.625rem] text-canvas">
                        Every channel live
                      </span>
                    ) : null}
                    <span className="display mt-2 text-3xl">{title}</span>
                    <span className={`mt-2 text-sm leading-relaxed ${live ? "opacity-80" : "text-muted"}`}>{line}</span>
                    <ul className={`mt-5 space-y-2 border-t pt-4 font-mono text-xs ${live ? "border-canvas/20" : "border-line"}`}>
                      {items.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span aria-hidden="true" className="text-accent">
                            ✓
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* 02 Services */}
        <section id="services" className="scroll-mt-20 border-t border-line">
          <div className={`py-16 md:py-24 ${SHELL}`}>
            <SectionHead
              index="02"
              label="Services"
              title={
                <>
                  Every account, <em className="text-accent">one team.</em>
                </>
              }
            >
              A growth partner for the accounts. One team covers the calendar, the video, and the report.
            </SectionHead>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <article className="panel relative overflow-hidden p-6 md:col-span-2 md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="eyebrow text-[0.6875rem] text-accent">Service · 01</p>
                  <span className="eyebrow rounded-full bg-accent px-3 py-1 text-[0.625rem] text-canvas">Agents + a person</span>
                </div>
                <h3 className="display mt-4 text-4xl">AI content production</h3>
                <p className="mt-3 max-w-xl leading-relaxed text-muted">
                  Drafts, cuts, and graphics from agents on HarnessRouter. A person approves before anything goes live.
                </p>
                <ol className="mt-8 grid gap-2 rounded-xl border border-line bg-sunken p-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
                  {[
                    ["01", "Brief", "The launch and the month"],
                    ["02", "Agents draft", "Every network, every day"],
                    ["03", "Person approves", "Nothing ships unread"],
                  ].map(([n, title, line], i) => (
                    <FlowStep key={n} n={n} title={title} line={line} gate={i === 2} arrow={i < 2} />
                  ))}
                </ol>
              </article>
              {SERVICES.map(([name, line], i) => (
                <article key={name} className="panel flex flex-col p-6 transition-shadow hover:shadow-card">
                  <p className="eyebrow text-[0.6875rem] text-accent">Service · {String(i + 2).padStart(2, "0")}</p>
                  <h3 className="display mt-3 text-[1.75rem] leading-tight">{name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{line}</p>
                  {i === 0 ? (
                    <ul className="mt-auto flex flex-wrap gap-1.5 pt-6" aria-label="Networks">
                      {PLATFORMS.map(([platform]) => (
                        <li key={platform} className="rounded-full bg-sunken px-3 py-1 font-mono text-xs">
                          {platform}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 03 Engine */}
        <section id="engine" className={`scroll-mt-20 py-4 md:py-8 ${SHELL}`}>
          <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-14 text-canvas md:px-14 md:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-40 -right-40 size-[30rem] rounded-full bg-accent/25 blur-3xl"
            />
            <div className="relative">
              <p className="eyebrow text-[0.75rem] text-accent">03 · Built on HarnessRouter</p>
              <h2 className="display mt-4 max-w-3xl text-4xl md:text-6xl">
                Agents draft the week. <em className="text-accent">A person signs it.</em>
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed opacity-75">
                HarnessRouter runs AI agents behind one API, so a brief becomes a full week of drafts in minutes.
              </p>
              <ol className="mt-12 grid gap-4 md:grid-cols-3">
                {ENGINE.map(([tag, title, line], i) => (
                  <li key={title} className="rounded-2xl border border-canvas/15 bg-canvas/5 p-6">
                    <span className="eyebrow text-[0.6875rem] text-accent">
                      0{i + 1} · {tag}
                    </span>
                    <span className="display mt-4 block text-3xl">{title}</span>
                    <span className="mt-2 block text-sm leading-relaxed opacity-75">{line}</span>
                  </li>
                ))}
              </ol>
              <a
                href="https://harnessrouter.ai"
                className="mt-8 inline-flex min-h-10 items-center text-sm font-medium underline decoration-accent underline-offset-4 hover:text-accent"
              >
                harnessrouter.ai ↗
              </a>
            </div>
          </div>
        </section>

        {/* 04 Who + How */}
        <section className="border-b border-line">
          <div className={`py-16 md:py-24 ${SHELL}`}>
            <SectionHead
              index="04"
              label="Who it's for"
              title={
                <>
                  For companies <em className="text-accent">creating the future.</em>
                </>
              }
            />
            <ul className="mt-12 grid gap-3">
              {CLIENTS.map(([name, line]) => (
                <li
                  key={name}
                  className="panel group flex items-baseline gap-4 px-5 py-5 transition-colors hover:border-ink md:px-7"
                >
                  <span aria-hidden="true" className="text-xl text-accent">
                    ✦
                  </span>
                  <span className="grid flex-1 gap-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-baseline md:gap-8">
                    <span className="display text-2xl md:text-3xl">{name}</span>
                    <span className="text-sm leading-relaxed text-muted">{line}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-20 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <div>
                <p className="eyebrow text-[0.75rem] text-accent">05 · How a month runs</p>
                <h2 className="display mt-3 text-4xl">Plan, make, approve, report.</h2>
              </div>
              <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map(([title, line], i) => (
                  <li key={title} className="bg-card p-6">
                    <span className="display text-5xl text-accent">0{i + 1}</span>
                    <span className="mt-4 block font-medium">{title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">{line}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 06 Pricing */}
        <section id="rates" className="scroll-mt-20 border-b border-line">
          <div className={`py-16 md:py-24 ${SHELL}`}>
            <SectionHead
              index="06"
              label="Pricing"
              title={
                <>
                  Clear scope, <em className="text-accent">clear price.</em>
                </>
              }
            >
              Monthly retainers, plus a campaign price for a launch or an event.
            </SectionHead>
            <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
              {RATE_ORDER.map((id) => {
                const featured = id === "growth";
                const pkg = PACKAGES[id];
                return (
                  <li
                    key={id}
                    className={`relative flex flex-col rounded-2xl border p-6 ${
                      featured ? "border-ink bg-ink text-canvas shadow-card lg:-my-3 lg:py-9" : "border-line bg-card"
                    }`}
                  >
                    {featured ? (
                      <span className="eyebrow absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[0.625rem] text-canvas">
                        Popular
                      </span>
                    ) : null}
                    <p className={`eyebrow text-[0.6875rem] ${featured ? "text-accent" : "text-muted"}`}>
                      {id === "event" ? "Per campaign" : "Monthly"}
                    </p>
                    <p className="display mt-2 text-3xl">{pkg.name}</p>
                    <p className={`mt-6 whitespace-nowrap font-mono font-medium tracking-tight ${id === "event" ? "text-xl leading-9" : "text-3xl"}`}>
                      {pkg.price}
                      <span className={`ml-1 text-xs font-normal ${featured ? "opacity-60" : "text-muted"}`}>
                        {id === "event" ? "/campaign" : "/month"}
                      </span>
                    </p>
                    <ul className={`mt-6 flex-1 space-y-2 border-t pt-5 text-sm ${featured ? "border-canvas/20" : "border-line"}`}>
                      {pkg.deliver.split(", ").map((item) => (
                        <li key={item} className="flex gap-2">
                          <span aria-hidden="true" className="text-accent">
                            ✦
                          </span>
                          <span className="first-letter:uppercase">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/#start"
                      className={`mt-8 w-full ${featured ? "btn bg-accent text-canvas hover:bg-canvas hover:text-ink" : "btn-ghost"}`}
                    >
                      {id === "event" ? "Plan a launch" : `Choose ${pkg.name}`}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-10 text-center font-mono text-xs text-muted">
              Ad spend, travel, and a full shoot day are separate. Ad spend is billed at cost.
            </p>
          </div>
        </section>

        {/* 07 Start */}
        <section id="start" className="scroll-mt-20">
          <div className={`grid gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] ${SHELL}`}>
            <div>
              <p className="eyebrow text-[0.75rem] text-accent">07 · Get started</p>
              <h2 className="display mt-4 text-6xl md:text-7xl">
                Start a <em className="text-accent">campaign.</em>
              </h2>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
                Tell us the company and the package. We reply by email with a plan and a start date.
              </p>
              <ul className="mt-10 space-y-3 rounded-2xl border border-line bg-sunken p-6 font-mono text-sm">
                {["A plan and a start date, by email", "You read every post before it goes live", "Ad spend billed at cost"].map(
                  (item) => (
                    <li key={item} className="flex gap-3">
                      <span aria-hidden="true" className="text-accent">
                        ✓
                      </span>
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <div className="panel p-6 shadow-card md:p-10">
              <RequestForm />
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line bg-sunken/60">
        <div className={`grid gap-10 py-14 ${SHELL}`}>
          <p className="display text-7xl leading-none sm:text-8xl md:text-[10rem]">
            LiftPage<span className="text-accent">.</span>
          </p>
          <div className="flex flex-wrap items-end justify-between gap-6 border-t border-line pt-6">
            <div>
              <p className="display text-2xl italic">Attention into traction.</p>
              <p className="mt-1 text-sm text-muted">Digital media for companies creating the future.</p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-wider text-muted">
              <Link href="/#services" className="hover:text-ink">
                Services
              </Link>
              <Link href="/#rates" className="hover:text-ink">
                Pricing
              </Link>
              <Link href="/login" className="hover:text-ink">
                Sign in
              </Link>
              <Link href="/#start" className="hover:text-ink">
                Start a campaign
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}

/** Three example posts, fanned like a stack on a desk. */
function PostStack() {
  return (
    <div className="rise rise-2 relative mx-auto h-[26rem] w-full max-w-md sm:h-[28rem]" aria-label="Example posts">
      <div aria-hidden="true" className="absolute inset-4 rounded-3xl border border-line bg-sunken/70" />
      {POSTS.map((post, i) => {
        const top = i === POSTS.length - 1;
        const pose = [
          "right-0 top-2 rotate-[5deg]",
          "left-0 top-10 -rotate-[4deg]",
          "left-1/2 top-24 -translate-x-1/2 rotate-[-1deg] sm:top-28",
        ][i];
        return (
          <article
            key={post.hook}
            aria-hidden={top ? undefined : true}
            className={`absolute w-[85%] rounded-2xl border border-line bg-card p-5 ${top ? "shadow-card" : "shadow-sm"} ${pose}`}
          >
            <header className="flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-ink font-mono text-xs font-medium text-canvas">
                {post.platform.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{post.handle}</span>
                <span className="block font-mono text-[0.6875rem] text-muted">{post.platform}</span>
              </span>
              <span className="eyebrow inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-[0.5625rem] text-muted">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                Draft
              </span>
            </header>
            <h3 className="display mt-4 text-2xl">{post.hook}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{post.caption}</p>
            {top ? (
              <p className="eyebrow mt-5 flex items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2 text-[0.625rem] text-ink">
                <span aria-hidden="true" className="text-accent">
                  ✓
                </span>
                Approved by a person
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function FlowStep({ n, title, line, gate, arrow }: { n: string; title: string; line: string; gate: boolean; arrow: boolean }) {
  return (
    <>
      <li className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${gate ? "border border-line bg-card" : ""}`}>
        <span
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-xs ${
            gate ? "bg-accent text-canvas" : "bg-card text-muted"
          }`}
        >
          {n}
        </span>
        <span className="min-w-0">
          <span className={`block font-mono text-[0.6875rem] uppercase tracking-wider ${gate ? "text-accent" : ""}`}>{title}</span>
          <span className="block text-xs text-muted">{line}</span>
        </span>
      </li>
      {arrow ? (
        <li aria-hidden="true" className="hidden text-accent sm:block">
          →
        </li>
      ) : null}
    </>
  );
}

function SectionHead({
  index,
  label,
  title,
  children,
}: {
  index: string;
  label: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)] lg:items-end">
      <div>
        <p className="eyebrow text-[0.75rem] text-accent">
          {index} · {label}
        </p>
        <h2 className="display mt-3 text-5xl md:text-6xl">{title}</h2>
      </div>
      {children ? <p className="max-w-sm leading-relaxed text-muted">{children}</p> : null}
    </div>
  );
}
