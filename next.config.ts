import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // No framing anywhere: admin pages are one-click server-action buttons.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

/*
 * Sentry wraps the build to upload source maps. Without SENTRY_AUTH_TOKEN it skips the
 * upload and the build still passes. Runtime reporting is set up in instrumentation*.ts.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
