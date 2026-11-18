import { Header } from "@/components/Header";

export const metadata = {
  title: "Build log",
};

const ENTRIES = [
  ["Nov 17", "Company", "LiftPage is the agency. Attention into traction. First campaign is a four-day pilot for HarnessRouter Labs, not a signed case study."],
  ["Nov 17", "Desk", "LaunchLoop holds the Nov 17–20 board: X, Instagram, TikTok, LinkedIn, YouTube. A person approves. Cue does not publish."],
  ["Nov 17", "HarnessRouter", "The cloud key answers /v1/me for the Default Workspace. Model calls return 402 until a provider key is added under Bring Your Own Key. The local operator cuts the day when that happens."],
  ["Nov 17", "Money", "Rate card is Starter $750, Growth $1,500, Accelerator $3,000, Event Launch from $1,500. Requests are recorded. Nothing is charged."],
  ["Nov 20", "Demo", "Show the campaign, cut a live brief, approve a line, cue it, and show a request landing on the desk."],
];

export default function LogPage() {
  return (
    <>
      <Header />
      <main id="main" className="px-4 py-10 md:px-8">
        <p className="eyebrow text-accent">Build log</p>
        <h1 className="mt-3 display text-5xl md:text-6xl">What shipped, and what didn&apos;t.</h1>
        <ol className="mt-8 max-w-3xl">
          {ENTRIES.map(([day, title, line]) => (
            <li key={`${day}-${title}`} className="grid gap-2 border-t border-line py-4 md:grid-cols-[7rem_9rem_minmax(0,1fr)]">
              <span className="font-mono text-sm text-muted">{day}</span>
              <span className="font-semibold">{title}</span>
              <span className="text-muted">{line}</span>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
