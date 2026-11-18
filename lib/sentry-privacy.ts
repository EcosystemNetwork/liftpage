/**
 * Sentry v11 collects cookies, headers, bodies, and query strings by default. Here those
 * carry Supabase session cookies, lead emails, client copy, and auth links with token_hash.
 * Collect none of it; errors and stack traces are what we want.
 */
import type * as Sentry from "@sentry/nextjs";

type DataCollection = NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>["dataCollection"]>;

export const dataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent", "content-type", "accept"] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  genAI: { inputs: false, outputs: false },
};
