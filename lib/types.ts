export const PLATFORMS = ["x", "instagram", "tiktok", "linkedin", "youtube"] as const;

export type Platform = (typeof PLATFORMS)[number];

export type Status = "draft" | "approved" | "cued";

export type Post = {
  id: string;
  platform: Platform;
  slot: string;
  hook: string;
  caption: string;
  visual: string;
  reply: string;
  status: Status;
};

export type Brand = {
  id: string;
  name: string;
  handle: string;
  voice: string;
  offers: string;
  platforms: Platform[];
};

export type CutVia = "local" | "tokenrouter" | "harnessrouter" | "both";

export type Run = {
  id: string;
  at: string;
  brief: string;
  via: CutVia;
  note: string;
  postIds: string[];
};

export type PackageId = "starter" | "growth" | "accelerator" | "event";

export type Hold = {
  id: string;
  at: string;
  name: string;
  email: string;
  company: string;
  packageId: PackageId;
  brandId: string;
  amount: number;
  status: HoldStatus;
  /** The client account this request belongs to, once there is one. */
  userId?: string;
  note?: string;
};

export const HOLD_STATUSES = ["requested", "contacted", "won", "lost"] as const;

export type HoldStatus = (typeof HOLD_STATUSES)[number];

export type Role = "admin" | "client";

export type User = {
  id: string;
  email: string;
  name: string;
  company: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
  disabled: boolean;
  /** Bumped to sign the user out everywhere. */
  sessionVersion: number;
};

/** What leaves the server about a user. Never the hash. */
export type PublicUser = Omit<User, "passwordHash" | "sessionVersion">;

/** One week of numbers for one client on one platform. */
export type Metric = {
  id: string;
  userId: string;
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  platform: Platform;
  followers: number;
  impressions: number;
  engagements: number;
  clicks: number;
  leads: number;
  at: string;
  /** Who entered it. */
  by: string;
};

export const METRIC_FIELDS = ["followers", "impressions", "engagements", "clicks", "leads"] as const;

export type MetricField = (typeof METRIC_FIELDS)[number];

export type AccountsFile = {
  users: User[];
  metrics: Metric[];
};

export type DeskFile = {
  brand: Brand;
  posts: Post[];
  runs: Run[];
  holds: Hold[];
};

export const PLATFORM_NAME: Record<Platform, string> = {
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export const PACKAGES: Record<PackageId, { name: string; price: string; amount: number; deliver: string }> = {
  starter: { name: "Starter", price: "$750", amount: 750, deliver: "12 posts, 2 platforms" },
  growth: { name: "Growth", price: "$1,500", amount: 1500, deliver: "20 posts, 3 platforms, 8 videos" },
  accelerator: { name: "Accelerator", price: "$3,000", amount: 3000, deliver: "30 posts, 5 platforms, 16 videos" },
  event: { name: "Event Launch", price: "$1,500–$5,000", amount: 1500, deliver: "A campaign around one launch or hackathon" },
};
