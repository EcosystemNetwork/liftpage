import { beforeEach, describe, expect, it, vi } from "vitest";

const upserts: { rows: Record<string, unknown>[]; options: unknown }[] = [];
vi.mock("@/lib/supabase/server", () => ({
  db: () => ({
    from: (table: string) => ({
      upsert: async (rows: Record<string, unknown>[], options: unknown) => {
        expect(table).toBe("metrics");
        upserts.push({ rows, options });
        return { data: null, error: null };
      },
    }),
  }),
  must: <T>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
}));

const { upsertMetrics } = await import("@/lib/metrics");

describe("upsertMetrics", () => {
  beforeEach(() => {
    upserts.length = 0;
  });

  it("sends only the fields a source reports, so the rest keep their value", async () => {
    await upsertMetrics([{ userId: "u", week: "2026-11-16", platform: "x", followers: 120 }], "sync:x", "sync");
    expect(upserts).toHaveLength(1);
    const [row] = upserts[0].rows;
    expect(row).toMatchObject({ user_id: "u", week: "2026-11-16", platform: "x", followers: 120, by: "sync:x", source: "sync" });
    expect(row).not.toHaveProperty("impressions");
    expect(row).not.toHaveProperty("leads");
    expect(upserts[0].options).toEqual({ onConflict: "user_id,week,platform", defaultToNull: false });
  });

  it("splits rows with different fields into separate upserts", async () => {
    await upsertMetrics(
      [
        { userId: "u", week: "2026-11-09", platform: "x", impressions: 10, engagements: 2 },
        { userId: "u", week: "2026-11-16", platform: "x", followers: 5, impressions: 3, engagements: 1 },
        { userId: "u", week: "2026-11-16", platform: "instagram", impressions: 7, engagements: 4 },
      ],
      "sync:x",
      "sync",
    );
    expect(upserts).toHaveLength(2);
    for (const { rows } of upserts) {
      const keys = rows.map((r) => Object.keys(r).sort().join(","));
      expect(new Set(keys).size).toBe(1);
    }
  });

  it("drops negative, fractional-free and non-finite values safely", async () => {
    await upsertMetrics([{ userId: "u", week: "2026-11-16", platform: "x", followers: -1, impressions: Number.NaN, clicks: 2.6 }], "me", "manual");
    const [row] = upserts[0].rows;
    expect(row).not.toHaveProperty("followers");
    expect(row).not.toHaveProperty("impressions");
    expect(row.clicks).toBe(3);
  });

  it("dedupes the same week twice in one batch (Postgres refuses that)", async () => {
    await upsertMetrics(
      [
        { userId: "u", week: "2026-11-16", platform: "x", leads: 1 },
        { userId: "u", week: "2026-11-16", platform: "x", leads: 4 },
      ],
      "me",
      "csv",
    );
    expect(upserts[0].rows).toHaveLength(1);
    expect(upserts[0].rows[0].leads).toBe(4);
  });
});
