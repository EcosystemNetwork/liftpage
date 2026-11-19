/** Public address used for canonical links, the sitemap and share cards. Not the dev or preview host. */
export const SITE = "https://liftpage.co";

export const DESCRIPTION =
  "LiftPage is a digital media marketing agency for technology startups, founders, and the communities around them. Instagram, TikTok, X, LinkedIn, and YouTube.";

/** For pages that should never show up in search: sign-in, sign-up, password reset. */
export const NO_INDEX = { index: false, follow: false } as const;
