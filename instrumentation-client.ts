import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { dataCollection } from "./lib/sentry-privacy";

/*
 * Browser setup, before the app hydrates. Both are no-ops without their public keys.
 * No session replay and no input capture: the desk and the forms hold client copy,
 * lead emails, and passwords.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    dataCollection,
  });
}

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (key) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // App Router navigations are history changes, not page loads.
    capture_pageview: "history_change",
    capture_pageleave: true,
    person_profiles: "identified_only",
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    autocapture: { capture_copied_text: false },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
