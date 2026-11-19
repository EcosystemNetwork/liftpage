"use client";

import { useActionState } from "react";
import { setHoldAmount } from "@/app/actions/admin";
import { Message, RowButton } from "./forms";

/** Admin re-price for an unpaid request. The client's deposit button charges this. */
export function HoldAmount({ holdId, amount, company }: { holdId: string; amount: number; company: string }) {
  const [state, action] = useActionState(setHoldAmount, undefined);
  return (
    <form key={amount} action={action} className="mt-2 grid justify-items-end gap-1">
      <input type="hidden" name="holdId" value={holdId} />
      <span className="flex gap-1">
        <input
          name="amount"
          inputMode="numeric"
          defaultValue={amount}
          aria-label={`Price for ${company}, whole dollars`}
          className="field min-h-9 w-24 px-2 text-right font-mono text-xs"
        />
        <RowButton>Price</RowButton>
      </span>
      <Message state={state} />
    </form>
  );
}
