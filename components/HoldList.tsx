import { setHoldStatus } from "@/app/actions/admin";
import { fmt } from "@/lib/stats";
import { stripeReady } from "@/lib/stripe";
import { HOLD_STATUSES, PACKAGES, type Hold } from "@/lib/types";
import { KICKER } from "@/lib/ui";
import { ConvertHold } from "./ConvertHold";
import { RowButton } from "./forms";
import { HoldAmount } from "./HoldAmount";
import { HoldInvoice } from "./HoldInvoice";
import { PayButton } from "./PayButton";

const STATUS_LABEL = { requested: "Requested", contacted: "Contacted", won: "Won", lost: "Lost" } as const;

/** Requests. Admins get status controls and account creation; clients just read. */
export function HoldList({ holds, admin = false }: { holds: Hold[]; admin?: boolean }) {
  return (
    <div className="overflow-x-auto panel">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className={`${KICKER} text-muted`}>
          <tr className="border-b border-line text-left">
            <th className="px-3 py-2 font-normal">When</th>
            {admin ? <th className="px-3 py-2 font-normal">Who</th> : null}
            <th className="px-3 py-2 font-normal">Package</th>
            <th className="px-3 py-2 text-right font-normal">Value</th>
            <th className="px-3 py-2 font-normal">Status</th>
            {admin ? <th className="px-3 py-2 font-normal">Account</th> : null}
          </tr>
        </thead>
        <tbody>
          {holds.map((hold) => (
            <tr key={hold.id} className="border-b border-line align-top last:border-0">
              <td className="px-3 py-2 font-mono text-muted">
                {new Date(hold.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
              {admin ? (
                <td className="px-3 py-2">
                  <span className="block">{hold.name}</span>
                  <span className="block text-muted">{hold.company}</span>
                  <span className="block font-mono text-xs text-muted">{hold.email}</span>
                </td>
              ) : null}
              <td className="px-3 py-2">
                {PACKAGES[hold.packageId].name}
                {hold.brief ? <span className="mt-1 block max-w-sm whitespace-pre-wrap text-xs text-muted line-clamp-3">{hold.brief}</span> : null}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {fmt.money(hold.amount)}
                {hold.paidAt ? (
                  <span className="block text-xs text-accent">
                    paid {fmt.money(hold.amountPaid ?? hold.amount)} ·{" "}
                    {new Date(hold.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                ) : admin ? (
                  <>
                    <HoldAmount holdId={hold.id} amount={hold.amount} company={hold.company} />
                    {stripeReady() && (hold.status === "requested" || hold.status === "contacted") ? (
                      <HoldInvoice holdId={hold.id} invoiced={Boolean(hold.invoiced)} />
                    ) : null}
                  </>
                ) : stripeReady() && (hold.status === "requested" || hold.status === "contacted") ? (
                  <PayButton holdId={hold.id} label="Pay deposit" className="mt-2" />
                ) : null}
              </td>
              <td className="px-3 py-2">
                {admin ? (
                  // Keyed on status: remounts with the saved value instead of React's reset restoring the old one.
                  <form key={hold.status} action={setHoldStatus} className="flex gap-2">
                    <input type="hidden" name="holdId" value={hold.id} />
                    <select
                      name="status"
                      defaultValue={hold.status}
                      aria-label={`Status for ${hold.company}`}
                      className="field min-h-9 w-auto font-mono text-xs"
                    >
                      {HOLD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                    <RowButton>Set</RowButton>
                  </form>
                ) : (
                  <span className={`font-mono text-xs uppercase ${hold.status === "won" ? "text-accent" : "text-muted"}`}>
                    {STATUS_LABEL[hold.status]}
                  </span>
                )}
              </td>
              {admin ? (
                <td className="px-3 py-2"><ConvertHold holdId={hold.id} linked={Boolean(hold.userId)} /></td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
