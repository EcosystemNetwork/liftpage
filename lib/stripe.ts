import "server-only";
import Stripe from "stripe";

let client: Stripe | undefined;

/** Checkout needs the secret key. The webhook also needs its signing secret. */
export function stripeReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function webhookReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * The SDK pins its own API version (stripe@23 → 2026-10-28.endive). Leaving apiVersion
 * unset keeps request shapes and the SDK's types in step.
 */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set. See .env.example.");
  client ??= new Stripe(key, {
    appInfo: { name: "LiftPage" },
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
  return client;
}

export function currency(): string {
  return (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
}

/** Holds store whole dollars; Stripe wants the smallest unit. */
export function toMinor(whole: number): number {
  return Math.round(whole * 100);
}

export function fromMinor(minor: number | null | undefined): number {
  return Math.round((minor ?? 0) / 100);
}

/** Only these hold states can be paid. Won holds are paid already; lost ones are closed. */
export const PAYABLE = new Set(["requested", "contacted"]);
