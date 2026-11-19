/*
 * What the writer can produce. Plain data, so admin and client pages can list the formats;
 * the model call itself lives in lib/write.ts.
 */

export const FORMATS = {
  newsletter: {
    label: "Email newsletter",
    service: "Email and newsletters",
    ask: "Write one newsletter issue. Give a subject line, a preview line, then the body in short sections with plain headings, and one clear call to action. 250–450 words.",
  },
  press: {
    label: "Press release",
    service: "Press and announcements",
    ask: "Write a press release: headline, subhead, dateline placeholder [CITY, DATE], lead paragraph that answers who/what/when/where/why, two body paragraphs, a quote placeholder marked [QUOTE: name, title] unless a real quote is in the brief, a boilerplate About section, and a media contact placeholder. Then a 5-line pitch email to a reporter.",
  },
  launch: {
    label: "Launch page copy",
    service: "Launch pages",
    ask: "Write the copy for a one-page launch or event site: headline, subhead, primary button label, three short benefit blocks, a how-it-works section in three steps, an FAQ with five questions, and the sign-up form's labels and confirmation message.",
  },
  event: {
    label: "Event campaign plan",
    service: "Event marketing",
    ask: "Plan the social campaign around the event: the week before, each day of, and the recap after. For each day give the platform, the post idea in one line, who is on camera, and what to capture on site. End with a shot list for the day-of crew and a recap checklist.",
  },
  outreach: {
    label: "Influencer and community outreach",
    service: "Influencer outreach",
    ask: "Write outreach: describe the creator or community profile to target (no real names unless they are in the brief), a first DM under 80 words, an email version under 150 words, a follow-up for day 4, and a one-paragraph collaboration brief with the ask, deliverables, and what they get.",
  },
  ads: {
    label: "Paid social ad set",
    service: "Paid social",
    ask: "Write a paid social ad set: three audiences to test (described by interests and job titles, no invented sizes), and for each network in the board's platforms two ad variants with primary text, headline, description, and call-to-action button. Note which organic angle each variant is built on.",
  },
  founder: {
    label: "Founder posts",
    service: "Founder branding",
    ask: "Write four posts for the founder to publish under their own name, first person, on LinkedIn and X: one build-in-public update, one lesson learned, one opinion on the industry, one behind-the-scenes. Each has the LinkedIn version and a shorter X version (X under 270 characters).",
  },
  clips: {
    label: "Livestream or podcast clip plan",
    service: "Livestream and podcast",
    ask: "From the episode or stream notes in the brief, plan the run-of-show (segments with minutes), then pick five clip moments. For each clip: a working title, the moment to cut, the on-screen hook text, the caption for TikTok/Reels/Shorts, and the post for LinkedIn or X.",
  },
  community: {
    label: "Community plan",
    service: "Community growth",
    ask: "Write a two-week community plan for Discord, X, and LinkedIn: a welcome message, three conversation starters, one weekly ritual with its post template, a member spotlight template, and the replies the team should use for the five most likely questions.",
  },
  analysis: {
    label: "Performance read-out",
    service: "Growth analytics",
    ask: "From the numbers in the brief, write a plain read-out for the client: what moved, the likely reason, the one thing to do more of, the one to stop, and next week's test. Use only numbers that appear in the brief. If a number is missing, say so instead of guessing.",
  },
} as const;

export type FormatId = keyof typeof FORMATS;

export function isFormat(value: unknown): value is FormatId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FORMATS, value);
}
