import { nid } from "./id";
import type { DeskFile, Post } from "./types";

const posts: Post[] = [
  {
    id: "p_d1_x",
    platform: "x",
    slot: "2026-11-17T08:40:00-08:00",
    hook: "Day one. Build in public.",
    caption:
      "The Big Hack is in the build week. Stanford and Berkeley. Demo day is Friday.\n\nToday we show the teams, not the logo.\n\nWhat are you shipping?",
    visual: "A desk, a laptop, the Luma page. No title card.",
    reply: "Drop the one-line version of what you're building.",
    status: "cued",
  },
  {
    id: "p_d1_ig",
    platform: "instagram",
    slot: "2026-11-17T12:15:00-08:00",
    hook: "Three teams. Three sentences.",
    caption:
      "Build in public, day one.\n\nThree teams. One sentence each. No pitch deck.\n\nThe Big Hack Game. Demo day Friday.\n\nHarnessRouter Labs.",
    visual: "Carousel. Slide 1 is the countdown: 3 days to demo. Slides 2–4 are team lines on ink, tape yellow for the day count.",
    reply: "Send your sentence. We'll put it on slide five.",
    status: "approved",
  },
  {
    id: "p_d1_tt",
    platform: "tiktok",
    slot: "2026-11-17T19:10:00-08:00",
    hook: "What are you actually building?",
    caption: "Founder, one take, no intro. Demo day is Friday.",
    visual: "Handheld interview. First frame is the question on screen. Cut when they name the product.",
    reply: "Stitch this with your answer.",
    status: "draft",
  },
  {
    id: "p_d2_x",
    platform: "x",
    slot: "2026-11-18T09:05:00-08:00",
    hook: "One API. The harness stays swappable.",
    caption:
      "Product day.\n\nHarnessRouter is the layer that runs the agent. Codex, Claude Code, Hermes. One API. The product team stops maintaining the harness.\n\nWatch a team ship on it this week.",
    visual: "Screen recording. One request in. A trace out. Eight seconds.",
    reply: "Which harness did your team pick, and why?",
    status: "approved",
  },
  {
    id: "p_d2_li",
    platform: "linkedin",
    slot: "2026-11-18T11:30:00-08:00",
    hook: "The hack is the distribution.",
    caption:
      "HarnessRouter Labs put a real product under a campus rivalry.\n\nStanford and Berkeley build for four days. Friday they demo. The prize pool is up to $10,000, plus OpenAI credits on the demo-day page.\n\nThe point is not the trophy. The point is a product someone pays for, and a room that remembers the name.",
    visual: "The demo-day lineup as a still. Names from the public page only. No fake quotes.",
    reply: "If you mentor teams, the room is still open.",
    status: "draft",
  },
  {
    id: "p_d2_yt",
    platform: "youtube",
    slot: "2026-11-18T17:40:00-08:00",
    hook: "Behind the build, ninety seconds.",
    caption: "A short from the floor. The product on screen. The person who built it names the user, not the model.",
    visual: "YouTube Short. Cold open on the product. Lower third: team name, then HarnessRouter Labs.",
    reply: "Full recap goes up after Friday.",
    status: "draft",
  },
  {
    id: "p_d3_x",
    platform: "x",
    slot: "2026-11-19T08:20:00-08:00",
    hook: "Tomorrow they demo.",
    caption:
      "Prize pool is up to $10,000. Grand champion takes 30%. Real customer, distribution, and the school cup sit behind it.\n\nSubmissions close before the room does. If your build has a user, bring the user.",
    visual: "The award split, set in mono, on ink. No confetti.",
    reply: "Who's still cutting tonight?",
    status: "draft",
  },
  {
    id: "p_d3_ig",
    platform: "instagram",
    slot: "2026-11-19T13:00:00-08:00",
    hook: "The people judging the room.",
    caption:
      "Competition day.\n\nJudges from OpenAI, Perplexity, Microsoft, and the founding teams in the room.\n\nJohnny Chang is on the Perplexity seat. The rest of the lineup is on the demo-day page.\n\nOne more night to make the build obvious.",
    visual: "Portrait cards. Name, seat, company. Public names only. Tape rule under the last card: demo day is tomorrow.",
    reply: "Tag a mentor who should see the builds.",
    status: "draft",
  },
  {
    id: "p_d3_tt",
    platform: "tiktok",
    slot: "2026-11-19T19:30:00-08:00",
    hook: "Twelve hours left.",
    caption: "Countdown. No speech. The clock, the repo, the prize.",
    visual: "On-screen clock to Friday's demo. Cut to a terminal. Cut to the Luma cover. End on the prize line.",
    reply: "Duet your last commit.",
    status: "draft",
  },
  {
    id: "p_d4_x",
    platform: "x",
    slot: "2026-11-20T09:00:00-08:00",
    hook: "Demo day is live.",
    caption:
      "Stanford vs Berkeley. The Big Hack. Demo day.\n\nLivestream link lands on the Luma page. Finalists, then winners, then the builds that should outlive the weekend.",
    visual: "Clip of the stream with the board in the corner. Caption burned in: Demo day.",
    reply: "Quote the build you'd pay for.",
    status: "draft",
  },
  {
    id: "p_d4_ig",
    platform: "instagram",
    slot: "2026-11-20T12:30:00-08:00",
    hook: "Finalists, then the winner.",
    caption:
      "Demo day.\n\nFinalists first. Winner when the judges are done. Interviews after, not before.\n\nHarnessRouter Labs. The Big Hack Game.",
    visual: "Stories first, then a grid post of three frames: the room, the screen, the winner's name once it's real. Don't post the name early.",
    reply: "Save the recap. We cut it tonight.",
    status: "draft",
  },
  {
    id: "p_d4_li",
    platform: "linkedin",
    slot: "2026-11-20T16:10:00-08:00",
    hook: "The weekend ends. The list doesn't.",
    caption:
      "Demo day is the close of the hack, not the close of the room.\n\nHarnessRouter Labs wanted one thing from the week: people who can point at the product on Monday.\n\nIf you run a hackathon, a fund, or a company that needs that kind of attention, this is the work.\n\nLiftPage. Attention into traction.",
    visual: "A single still from the stream. The LiftPage line sits under it, small.",
    reply: "The four-day pilot is open for the next event.",
    status: "draft",
  },
];

export function seedDesk(): DeskFile {
  return {
    brand: {
      id: "brand_harnessrouter",
      name: "HarnessRouter Labs",
      handle: "@HARNESSROUTER",
      voice:
        "Name the day, the prize, and the product. Builders, not hype. No fake quotes. No hashtag walls.",
      offers:
        "The Big Hack Game, Nov 15–20. Turn the weekend into a community that still knows HarnessRouter on Monday.",
      platforms: ["x", "instagram", "tiktok", "linkedin", "youtube"],
    },
    posts,
    runs: [
      {
        id: nid("run"),
        at: "2026-11-17T16:05:00-08:00",
        brief:
          "Four-day pilot for HarnessRouter Labs. Nov 17 build in public, Nov 18 product, Nov 19 hype, Nov 20 demo day. Recruit, show the builds, name the judges and the prize, leave people knowing HarnessRouter.",
        via: "local",
        note: "Campaign written for the pilot. Not a published partnership.",
        postIds: posts.map((post) => post.id),
      },
    ],
    holds: [],
  };
}
