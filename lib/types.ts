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
  /** Public URL of the uploaded image or video, if any. */
  mediaUrl?: string;
  mediaType?: string;
  publishState: PublishState;
  publishError?: string;
  publishedUrl?: string;
  publishedAt?: string;
  notes: PostNote[];
};

export const NOTE_KINDS = ["approved", "changes", "comment"] as const;

export type NoteKind = (typeof NOTE_KINDS)[number];

/** Review on a post, mostly from the client whose board it is. */
export type PostNote = {
  id: string;
  postId: string;
  authorId?: string;
  authorName: string;
  role: Role;
  kind: NoteKind;
  text: string;
  at: string;
};

export const PUBLISH_STATES = ["idle", "scheduled", "publishing", "published", "failed"] as const;

export type PublishState = (typeof PUBLISH_STATES)[number];

/** A network account connected to a board. Tokens never leave the server. */
export type Connection = {
  platform: Platform;
  accountName: string;
  connectedAt: string;
  expiresAt?: string;
};

export type Brand = {
  id: string;
  /** The client this board belongs to. Missing on the house board. */
  clientId?: string;
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
  /** Set by the Stripe webhook once the deposit clears. */
  amountPaid?: number;
  paidAt?: string;
};

export const HOLD_STATUSES = ["requested", "contacted", "won", "lost"] as const;

export type HoldStatus = (typeof HOLD_STATUSES)[number];

export type Role = "admin" | "client";

export const CLIENT_STAGES = ["onboarding", "active", "paused", "churned"] as const;

export type ClientStage = (typeof CLIENT_STAGES)[number];

export type User = {
  id: string;
  email: string;
  name: string;
  company: string;
  role: Role;
  createdAt: string;
  lastLoginAt?: string;
  disabled: boolean;
  /** Where a client is in the relationship. Admin-only; clients never see it. */
  stage: ClientStage;
};

/** Passwords live in Supabase Auth, so a profile row is safe to hand to a page. */
export type PublicUser = User;

/** One message in a client's thread with LiftPage. */
export type Message = {
  id: string;
  /** The client account the thread belongs to. */
  clientId: string;
  authorId?: string;
  authorName: string;
  role: Role;
  text: string;
  at: string;
  /** When the other side opened the thread after this was sent. */
  readAt?: string;
};

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
  /** Who entered it: a user id, or "sync:<platform>". */
  by: string;
  source?: MetricSource;
};

export type MetricSource = "manual" | "csv" | "sync";

export const METRIC_FIELDS = ["followers", "impressions", "engagements", "clicks", "leads"] as const;

export type MetricField = (typeof METRIC_FIELDS)[number];

export type AccountsFile = {
  users: User[];
  metrics: Metric[];
};

/** One line per board for the desk's switcher. */
export type BoardSummary = { id: string; name: string; clientId?: string; company?: string };

export type DeskFile = {
  /** The board on screen. */
  brand: Brand;
  boards: BoardSummary[];
  posts: Post[];
  runs: Run[];
  holds: Hold[];
  connections: Connection[];
  /** Networks whose OAuth app keys are set, so Connect can work. */
  connectable: Platform[];
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

/** A private note on a client. Admins only. */
export type ClientNote = { id: string; clientId: string; authorId?: string; text: string; pinned: boolean; at: string };

/** One admin action, for the activity log. */
export type AdminEvent = { id: string; at: string; actorEmail: string; action: string; clientId?: string; detail: string };

/* ---------- Client suite: projects, change requests, plan ---------- */

export const PROJECT_KINDS = ["website", "social"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_STATUSES = ["building", "review", "live", "paused"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Something LiftPage builds or runs for a client. */
export type Project = {
  id: string;
  clientId: string;
  kind: ProjectKind;
  name: string;
  url?: string;
  status: ProjectStatus;
  summary: string;
  createdAt: string;
  check?: SiteCheck;
};

/** The last uptime check on a website project. */
export type SiteCheck = { at: string; ok: boolean; code?: number; ms?: number; error?: string };

export const CHANGE_STATUSES = ["open", "doing", "done"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export type ChangeRequest = {
  id: string;
  projectId: string;
  clientId: string;
  text: string;
  status: ChangeStatus;
  at: string;
  doneAt?: string;
};

export const PLAN_OFFERS = ["trial", "locked", "standard"] as const;
export type PlanOffer = (typeof PLAN_OFFERS)[number];

export const PLAN_STATUSES = ["pending", "trialing", "active", "past_due", "canceled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** The monthly subscription that keeps a client's online presence running. */
export type Plan = {
  clientId: string;
  name: string;
  /** Whole dollars a month. */
  monthly: number;
  /** What the plan covers, one item per line. */
  includes: string;
  offer: PlanOffer;
  /** offer 'trial': when the free month ends and billing starts. */
  trialEndsAt?: string;
  /** offer 'locked': the price holds through this date, YYYY-MM-DD. */
  lockedUntil?: string;
  status: PlanStatus;
  startedAt?: string;
  /** A Stripe subscription exists, so a card is on file. */
  subscribed: boolean;
};
