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
  status: "requested";
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
