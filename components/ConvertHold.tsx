"use client";

import { useActionState } from "react";
import { accountFromHold } from "@/app/actions/admin";
import { Message, RowButton } from "./forms";

/** Stays mounted after the hold links, so a one-time invite link shown here survives the refresh. */
export function ConvertHold({ holdId, linked }: { holdId: string; linked: boolean }) {
  const [state, action] = useActionState(accountFromHold, undefined);
  if (state?.ok) return <Message state={state} />;
  if (linked) return <span className="text-mute">Linked</span>;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="holdId" value={holdId} />
      <RowButton>Make account</RowButton>
      <Message state={state} />
    </form>
  );
}
