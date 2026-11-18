import { weekOf } from "./stats";
import { METRIC_FIELDS, PLATFORMS, PLATFORM_NAME, type MetricField, type MetricSource, type Platform } from "./types";

export type MetricInput = { userId: string; week: string; platform: Platform } & Partial<Record<MetricField, number>>;

/**
 * Writes weeks to Postgres. Same user + week + platform merges: fields the input leaves
 * out keep their old value, so a sync that only knows followers doesn't wipe the
 * impressions someone typed. `week` must already be a Monday (callers use weekOf()).
 */
export async function upsertMetrics(inputs: MetricInput[], by: string, source: MetricSource): Promise<void> {
  const { db, must } = await import("./supabase/server");
  const at = new Date().toISOString();
  // PostgREST upserts need the same columns on every row, or a missing field would be
  // overwritten with its default. Group rows by which fields they carry.
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const input of inputs) {
    const row: Record<string, unknown> = { user_id: input.userId, week: input.week, platform: input.platform, at, by, source };
    const present: string[] = [];
    for (const field of METRIC_FIELDS) {
      const n = input[field];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
        row[field] = Math.round(n);
        present.push(field);
      }
    }
    const key = present.join(",");
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const rows of groups.values()) {
    // Dedupe within a batch: Postgres refuses to touch the same row twice in one upsert.
    const unique = new Map(rows.map((row) => [`${row.user_id}|${row.week}|${row.platform}`, row]));
    must(
      await db().from("metrics").upsert([...unique.values()], { onConflict: "user_id,week,platform", defaultToNull: false }),
      "save metrics",
    );
  }
}

/* ---------- CSV ---------- */

export const CSV_HEADER = ["week", "platform", ...METRIC_FIELDS] as const;

/** Quotes when needed and defuses spreadsheet formulas. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const PLATFORM_ALIASES: Record<string, Platform> = {
  ig: "instagram",
  tt: "tiktok",
  in: "linkedin",
  li: "linkedin",
  yt: "youtube",
  twitter: "x",
};

export function platformFrom(value: string): Platform | null {
  const key = value.trim().toLowerCase();
  if (PLATFORMS.includes(key as Platform)) return key as Platform;
  if (PLATFORM_ALIASES[key]) return PLATFORM_ALIASES[key];
  const byName = PLATFORMS.find((p) => PLATFORM_NAME[p].toLowerCase() === key);
  return byName ?? null;
}

export type CsvImport = { rows: Omit<MetricInput, "userId">[]; errors: string[] };

/** Reads week,platform,followers,impressions,engagements,clicks,leads. Header names, any order. */
export function readMetricCsv(text: string, today = new Date()): CsvImport {
  const table = parseCsv(text.replace(/^﻿/, ""));
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ["The file needs a header row and at least one week."] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("week") < 0 || col("platform") < 0) {
    return { rows: [], errors: ["The header needs week and platform columns."] };
  }
  const thisWeek = weekOf(today) ?? "";
  const rows: CsvImport["rows"] = [];
  for (let r = 1; r < table.length && rows.length < 2000; r++) {
    const line = table[r];
    const at = `Row ${r + 1}`;
    const week = weekOf(line[col("week")] ?? "");
    const platform = platformFrom(line[col("platform")] ?? "");
    if (!week) {
      errors.push(`${at}: week isn't a date (use YYYY-MM-DD).`);
      continue;
    }
    if (week > thisWeek) {
      errors.push(`${at}: ${week} is in the future.`);
      continue;
    }
    if (!platform) {
      errors.push(`${at}: unknown platform "${line[col("platform")] ?? ""}".`);
      continue;
    }
    const out: CsvImport["rows"][number] = { week, platform };
    let bad = false;
    for (const field of METRIC_FIELDS) {
      const i = col(field);
      if (i < 0 || (line[i] ?? "").trim() === "") continue;
      const n = Number(line[i].replace(/[,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`${at}: ${field} isn't a number.`);
        bad = true;
        break;
      }
      out[field] = Math.round(n);
    }
    if (!bad) rows.push(out);
  }
  return { rows, errors };
}
