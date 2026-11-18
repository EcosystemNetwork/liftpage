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
      <main id="main">
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:py-20">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-tape">
                Social media marketing
              </p>
              <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
                Attention into traction.
              </h1>
              <p className="mt-6 max-w-md text-lg text-paper">
                We run social for companies creating the future. Posts, short video, and the campaign around a launch.
              </p>
              <p className="mt-3 max-w-md text-mute">
                Startups, founders, hackathons, and innovation communities. Instagram, TikTok, X, LinkedIn, and YouTube.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/#start"
                  className="inline-flex min-h-10 items-center bg-tape px-4 font-mono text-xs uppercase tracking-[0.14em] text-ink"
                >
                  Start a campaign
                </Link>
                <Link
                  href="/#work"
                  className="inline-flex min-h-10 items-center border border-line px-4 font-mono text-xs uppercase tracking-[0.14em]"
                >
                  See the work
                </Link>
              </div>
            </div>
            <div className="border border-line bg-panel p-5 md:p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">On the calendar</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight">The Big Hack</h2>
              <p className="mt-3">
                A four-day social campaign for HarnessRouter Labs. Stanford and Berkeley. November 17–20.
              </p>
              <p className="mt-3 text-sm text-mute">
                Recruit the room, show what people are building, and leave HarnessRouter known on Monday.
              </p>
              <a
                href="https://luma.com/t2598jt6"
                className="mt-6 inline-flex min-h-10 items-center font-mono text-xs uppercase tracking-[0.14em] text-tape"
              >
                Event page
              </a>
            </div>
          </div>
        </section>

        <section id="platforms" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Platforms we run</h2>
            <ul className="mt-4">
              {PLATFORMS.map(([name, line]) => (
                <li
                  key={name}
                  className="grid gap-1 border-t border-line py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:items-baseline md:gap-6"
                >
                  <span className="text-lg font-semibold">{name}</span>
                  <span className="text-mute">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="services" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Services</h2>
            <p className="mt-3 max-w-xl text-paper">
              A growth partner for the accounts. One team covers the calendar, the video, and the report.
            </p>
            <table className="mt-6 w-full text-left text-sm">
              <tbody>
                {SERVICES.map(([name, line]) => (
                  <tr key={name} className="border-t border-line">
                    <th scope="row" className="w-[40%] py-3 pr-4 align-top font-semibold md:w-72">
                      {name}
                    </th>
                    <td className="py-3 text-mute">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="work" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Work</h2>
            <p className="mt-3 max-w-xl">
              HarnessRouter Labs. Four days of social heading into demo day. Up to $10,000 in prizes.
            </p>
            <ol className="mt-6">
              {DAYS.map(([day, title, line]) => (
                <li
                  key={day}
                  className="grid gap-1 border-t border-line py-3 md:grid-cols-[7rem_12rem_minmax(0,1fr)] md:items-baseline"
                >
                  <span className="font-mono text-sm text-tape">{day}</span>
                  <span className="font-semibold">{title}</span>
                  <span className="text-mute">{line}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {POSTS.map((post) => (
                <article key={post.hook} className="border border-line bg-panel p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                    {post.platform}
                    <span className="text-paper"> · {post.handle}</span>
                  </p>
                  <h3 className="mt-3 font-semibold">{post.hook}</h3>
                  <p className="mt-2 text-sm text-mute">{post.caption}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:px-8 lg:grid-cols-2">
            <div>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Who it&apos;s for</h2>
              <ul className="mt-4">
                {CLIENTS.map((line) => (
                  <li key={line} className="border-t border-line py-3">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">How a month runs</h2>
              <ol className="mt-4">
                {STEPS.map(([title, line], index) => (
                  <li key={title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-t border-line py-3">
                    <span className="font-mono text-sm text-tape">0{index + 1}</span>
                    <span>
                      <span className="font-semibold">{title}</span>
                      <span className="mt-1 block text-sm text-mute">{line}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="rates" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">Pricing</h2>
            <p className="mt-3 max-w-xl text-mute">
              Monthly retainers, plus a campaign price for a launch or a hackathon. Ads, travel, and a full shoot day are separate.
            </p>
            <table className="mt-6 w-full text-left text-sm">
              <thead>
                <tr className="border-t border-line font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                  <th scope="col" className="py-3 pr-3 font-medium">Package</th>
                  <th scope="col" className="py-3 pr-3 font-medium">Price</th>
                  <th scope="col" className="py-3 font-medium">Includes</th>
                </tr>
              </thead>
              <tbody>
                {RATE_ORDER.map((id) => (
                  <tr key={id} className="border-t border-line">
                    <th scope="row" className="py-3 pr-3 font-semibold">
                      {PACKAGES[id].name}
                    </th>
                    <td className="py-3 pr-3 font-mono text-tape">{PACKAGES[id].price}</td>
                    <td className="py-3 text-mute">{PACKAGES[id].deliver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="start" className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
            <div>
              <h2 className="text-3xl font-semibold leading-tight">Start a campaign.</h2>
              <p className="mt-3 max-w-md text-mute">
                Tell us the company and the package. We reply by email. The first campaign on the books is The Big Hack for HarnessRouter Labs.
              </p>
            </div>
            <RequestForm />
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
          LiftPage · Attention into traction
        </p>
        <Link href="/desk" className="inline-flex min-h-10 items-center font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
          Production desk
        </Link>
      </footer>
    </>
  );
}
