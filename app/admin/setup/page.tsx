import { requireAdmin } from "@/lib/dal";
import { envChecks, type Check } from "@/lib/setup";
import { siteUrl } from "@/lib/site";
import { db, supabaseReady } from "@/lib/supabase/server";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Setup" };

const MARK: Record<Check["state"], { label: string; tone: string }> = {
  on: { label: "On", tone: "text-tape" },
  off: { label: "Off", tone: "text-mute" },
  broken: { label: "Fix", tone: "text-heat" },
};

const TABLES = ["profiles", "brands", "posts", "post_notes", "runs", "holds", "metrics", "social_accounts", "rate_limits", "stripe_events"];

/** Probes the database for what the migrations make: tables and the media bucket. */
async function databaseCheck(): Promise<Check> {
  const base = { id: "schema", name: "Database schema" };
  if (!supabaseReady()) return { ...base, state: "off", detail: "Waiting on the Supabase keys." };
  const results = await Promise.all(
    TABLES.map(async (table) => {
      const { error } = await db().from(table).select("*", { head: true, count: "exact" }).limit(1);
      return error ? `${table}: ${error.message}` : null;
    }),
  );
  const problems = results.filter((line): line is string => Boolean(line));
  const { error: bucket } = await db().storage.getBucket("post-media");
  if (bucket) problems.push(`post-media bucket: ${bucket.message}`);
  return problems.length
    ? { ...base, state: "broken", detail: "The migrations haven't fully run.", todo: [...problems.slice(0, 4), "Run supabase/migrations/*.sql in order."] }
    : { ...base, state: "on", detail: "Every table and the media bucket are there." };
}

export default async function SetupPage() {
  await requireAdmin("/admin/setup");
  const site = siteUrl();
  const checks = [await databaseCheck(), ...envChecks(site)];
  const broken = checks.filter((c) => c.state === "broken").length;
  const on = checks.filter((c) => c.state === "on").length;

  return (
    <>
      <section>
        <p className={`${KICKER} text-tape`}>Setup</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">What&rsquo;s plugged in.</h1>
        <p className="mt-3 text-mute">
          {on} of {checks.length} on{broken ? `, ${broken} to fix` : ""}. Keys go in <code className="font-mono text-sm">.env.local</code> (or the
          host&rsquo;s environment) and take effect on restart. Secrets are never shown here.
        </p>
      </section>
      <section aria-label="Integrations">
        <ul className="grid gap-3 md:grid-cols-2">
          {checks.map((check) => (
            <li key={check.id} className={`border p-4 ${check.state === "broken" ? "border-heat" : "border-line"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{check.name}</h2>
                <span className={`${KICKER} ${MARK[check.state].tone}`}>{MARK[check.state].label}</span>
              </div>
              <p className="mt-1 text-sm text-mute">{check.detail}</p>
              {check.todo?.length ? (
                <ul className="mt-3 grid gap-1 font-mono text-xs break-all">
                  {check.todo.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
