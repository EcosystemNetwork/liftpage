import { loadAccounts } from "@/lib/accounts";
import { currentUser } from "@/lib/dal";
import { toCsv } from "@/lib/metrics";
import { inRange, rangeFrom } from "@/lib/stats";
import { METRIC_FIELDS, PLATFORM_NAME } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET ?user=<id|all>&range=<4w|12w|26w|52w|all>
 * Clients always get their own rows. Admins pick a client, or everyone.
 */
export async function GET(request: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(request.url);
  const asked = url.searchParams.get("user") ?? "";
  const range = rangeFrom(url.searchParams.get("range"));

  const { users, metrics } = await loadAccounts();
  let scope: string[];
  if (me.role !== "admin") scope = [me.id];
  else if (asked === "all") scope = users.filter((u) => u.role === "client").map((u) => u.id);
  else if (users.some((u) => u.id === asked)) scope = [asked];
  else scope = [me.id];

  const byId = new Map(users.map((u) => [u.id, u]));
  const all = scope.length > 1;
  const rows = inRange(
    metrics.filter((m) => scope.includes(m.userId)),
    range,
  ).sort((a, b) => a.userId.localeCompare(b.userId) || a.week.localeCompare(b.week) || a.platform.localeCompare(b.platform));

  const header = [...(all ? ["company", "email"] : []), "week", "platform", ...METRIC_FIELDS, "source"];
  const body = rows.map((m) => {
    const u = byId.get(m.userId);
    return [
      ...(all ? [u?.company ?? "", u?.email ?? ""] : []),
      m.week,
      PLATFORM_NAME[m.platform],
      ...METRIC_FIELDS.map((f) => m[f]),
      m.source ?? "manual",
    ];
  });

  const who = all ? "all-clients" : (byId.get(scope[0])?.company ?? "account").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const name = `liftpage-${who}-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + toCsv([header, ...body]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
