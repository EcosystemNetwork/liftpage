import "server-only";
import { recordUsage } from "./usage";

/*
 * The two model backends. TokenRouter is an OpenAI-compatible chat API; HarnessRouter runs
 * an agent harness behind a Responses-style API. Every AI feature goes through `complete`,
 * which tries HarnessRouter first and falls back to TokenRouter.
 */

export type AiVia = "tokenrouter" | "harnessrouter";

export function tokenReady(): boolean {
  return Boolean(process.env.TOKENROUTER_BASE_URL && process.env.TOKENROUTER_API_KEY);
}

export function harnessReady(): boolean {
  return Boolean(process.env.HARNESSROUTER_BASE_URL && process.env.HARNESSROUTER_API_KEY);
}

export function aiReady(): boolean {
  return tokenReady() || harnessReady();
}

export function harnessName(): string {
  return process.env.HARNESSROUTER_HARNESS_ID || "codex";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/** Pulls the text out of a Responses, chat-completions, or plain-string answer. */
export function textFromUnknown(data: unknown): string {
  if (typeof data === "string") return data;
  const record = asRecord(data);
  if (!record) return "";
  if (typeof record.output_text === "string") return record.output_text;
  const chunks: string[] = [];
  if (Array.isArray(record.output)) {
    for (const item of record.output) {
      const row = asRecord(item);
      if (!row) continue;
      if (typeof row.text === "string") chunks.push(row.text);
      if (!Array.isArray(row.content)) continue;
      for (const part of row.content) {
        const block = asRecord(part);
        if (block && typeof block.text === "string") chunks.push(block.text);
      }
    }
  }
  if (chunks.length) return chunks.join("\n");
  if (Array.isArray(record.choices)) {
    const choice = asRecord(record.choices[0]);
    const message = choice ? asRecord(choice.message) : null;
    if (message && typeof message.content === "string") return message.content;
  }
  return "";
}

/** An error message that is safe to show: no bearer tokens, no API keys. */
export function safeErr(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[key]")
    .replace(/\b(?:sk|tr|hr|nfp)[-_][A-Za-z0-9_\-]+/g, "[key]")
    .slice(0, 280);
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function postJson(url: string, key: string, body: unknown, label: string): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(100_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    let detail = raw.slice(0, 240);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string }; detail?: string };
      if (parsed.error?.message) detail = parsed.error.message;
      else if (parsed.detail) detail = parsed.detail;
    } catch {
      detail = raw.slice(0, 240);
    }
    throw new Error(`${label} ${response.status}: ${detail}`);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    recordUsage(label, parsed);
    return textFromUnknown(parsed) || raw;
  } catch {
    return raw;
  }
}

export async function askTokenRouter(prompt: string, system = "You return JSON only.", temperature = 0.4): Promise<string> {
  const base = process.env.TOKENROUTER_BASE_URL;
  const key = process.env.TOKENROUTER_API_KEY;
  if (!base || !key) throw new Error("TokenRouter is not configured");
  return postJson(
    joinUrl(base, "/chat/completions"),
    key,
    {
      model: process.env.TOKENROUTER_MODEL || "openai/gpt-5-mini",
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    },
    "TokenRouter",
  );
}

export async function askHarnessRouter(input: string, maxOutputTokens = 2500): Promise<string> {
  const base = process.env.HARNESSROUTER_BASE_URL;
  const key = process.env.HARNESSROUTER_API_KEY;
  if (!base || !key) throw new Error("HarnessRouter is not configured");
  const harness = harnessName();
  return postJson(
    joinUrl(base, "/v1/responses"),
    key,
    {
      input,
      model: process.env.HARNESSROUTER_MODEL || "gpt-5.4-mini",
      stream: false,
      backend: harness,
      metadata: { harness_id: harness },
      max_output_tokens: maxOutputTokens,
      max_step: 6,
      timeout_seconds: 90,
    },
    "HarnessRouter",
  );
}

export type Completion = { text: string; via: AiVia; notes: string[] } | { error: string; notes: string[] };

/**
 * One answer from whichever backend gives a usable one. `accept` rejects answers that came
 * back but can't be used (bad JSON, empty text), so the next backend gets a turn.
 */
export async function complete(
  prompt: string,
  options: { system?: string; temperature?: number; maxOutputTokens?: number; accept?: (text: string) => boolean } = {},
): Promise<Completion> {
  const accept = options.accept ?? ((text: string) => text.trim().length > 0);
  const notes: string[] = [];
  if (harnessReady()) {
    try {
      const system = options.system ? `${options.system}\n\n` : "";
      const text = await askHarnessRouter(`${system}${prompt}`, options.maxOutputTokens);
      if (accept(text)) return { text, via: "harnessrouter", notes };
      notes.push("HarnessRouter answered, but the answer was unusable.");
    } catch (error) {
      notes.push(`HarnessRouter skipped: ${safeErr(error)}`);
    }
  }
  if (tokenReady()) {
    try {
      const text = await askTokenRouter(prompt, options.system, options.temperature);
      if (accept(text)) return { text, via: "tokenrouter", notes };
      notes.push("TokenRouter answered, but the answer was unusable.");
    } catch (error) {
      notes.push(`TokenRouter skipped: ${safeErr(error)}`);
    }
  }
  if (!tokenReady() && !harnessReady()) notes.push("No AI backend is set up. Add HARNESSROUTER_API_KEY or TOKENROUTER_API_KEY.");
  return { error: notes.join(" ") || "No AI backend answered.", notes };
}
