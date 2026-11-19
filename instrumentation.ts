import * as Sentry from "@sentry/nextjs";

/** Runs once per server instance, before it takes requests. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

/** Errors thrown in Server Components, route handlers, actions, and the proxy. */
export const onRequestError = Sentry.captureRequestError;
