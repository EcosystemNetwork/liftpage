import type { Service, ServiceState, WorkItem } from "@/lib/services";
import { formatStamp } from "@/lib/time";
import type { ChangeRequest } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { AskForService } from "./SuiteForms";

const STATE: Record<ServiceState, { dot: string; label: string; tone: string }> = {
  on: { dot: "bg-accent", label: "Running", tone: "text-accent" },
  attention: { dot: "bg-danger", label: "Needs a look", tone: "text-danger" },
  off: { dot: "bg-line", label: "Available", tone: "text-muted" },
};

/**
 * What LiftPage is doing for the client, service by service: what's running, when it
 * last did something, when it runs next. Services they don't have yet sit below with a
 * one-press ask. `preview` hides the asks, for the admin's read-only view.
 */
export function ClientServices({ services, changes, preview = false }: { services: Service[]; changes: Pick<ChangeRequest, "text" | "status">[]; preview?: boolean }) {
  const running = services.filter((s) => s.state !== "off");
  const available = services.filter((s) => s.state === "off");
  // A service they already asked for (and we haven't closed) shows that, not the button again.
  const asked = new Map(changes.filter((c) => c.status !== "done").map((c) => [c.text, c.status]));

  return (
    <div className="grid gap-6">
      {running.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {running.map((s) => (
            <li key={s.id} className="panel flex min-w-0 flex-col gap-2 p-5">
              <p className={`${KICKER} flex items-center gap-2 ${STATE[s.state].tone}`}>
                <span className={`inline-block size-2 rounded-full ${STATE[s.state].dot} ${s.state === "on" ? "animate-pulse" : ""}`} aria-hidden="true" />
                {STATE[s.state].label}
              </p>
              <h3 className="display text-2xl">{s.name}</h3>
              <p className="text-sm text-muted">{s.what}</p>
              <dl className="mt-auto grid gap-1 pt-2 text-sm">
                {s.last ? (
                  <div className="flex gap-2">
                    <dt className="sr-only">Last</dt>
                    <dd className={s.state === "attention" ? "text-danger" : ""}>{s.last}</dd>
                  </div>
                ) : null}
                {s.next ? (
                  <div className="flex gap-2 font-mono text-xs text-muted">
                    <dt>Next</dt>
                    <dd>{s.next}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel px-5 py-6 text-muted">Nothing running yet. Pick something below and we&rsquo;ll get it going.</p>
      )}

      {available.length ? (
        <div>
          <h3 className={`${KICKER} mb-3 text-muted`}>Add to your plan</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((s) => {
              const status = s.ask ? asked.get(s.ask) : undefined;
              return (
                <li key={s.id} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-dashed border-line p-5">
                  <h4 className="text-lg font-medium">{s.name}</h4>
                  <p className="text-sm text-muted">{s.what}</p>
                  <div className="mt-auto pt-2">
                    {status ? (
                      <p className="text-sm text-accent">{status === "doing" ? "Asked · we’re setting it up" : "Asked · we’ll be in touch"}</p>
                    ) : s.ask && !preview ? (
                      <AskForService ask={s.ask} label="Switch this on" />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** What we did for them lately, in their words. */
export function WorkLog({ items }: { items: WorkItem[] }) {
  if (!items.length) return <p className="text-muted">Nothing yet. Everything we do for you shows up here as it happens.</p>;
  return (
    <ol className="grid gap-0 border-l border-line pl-5">
      {items.map((item, i) => (
        <li key={`${item.at}-${i}`} className="relative py-2">
          <span className="absolute top-3.5 -left-[25px] size-2 rounded-full bg-accent" aria-hidden="true" />
          <p className="font-mono text-xs text-muted">{formatStamp(item.at)}</p>
          <p>{item.text}</p>
        </li>
      ))}
    </ol>
  );
}
