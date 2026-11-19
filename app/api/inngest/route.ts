import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
// Publishing a video to YouTube or TikTok can take minutes.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
