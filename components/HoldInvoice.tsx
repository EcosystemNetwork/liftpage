"use client";

import { useActionState } from "react";
import { sendHoldInvoice } from "@/app/actions/admin";
import { Message, RowButton } from "./forms";

/** Admin: email the client a Stripe invoice for this request at its current price. */
export function HoldInvoice({ holdId, invoiced }: { holdId: string; invoiced: boolean }) {
  const [state, action] = useActionState(sendHoldInvoice, undefined);
  return (
    <form action={action} className="mt-1 grid justify-items-end gap-1">
      <input type="hidden" name="holdId" value={holdId} />
      <RowButton>{invoiced ? "Re-send invoice" : "Send invoice"}</RowButton>
      <Message state={state} />
    </form>
  );
}
