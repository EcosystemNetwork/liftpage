"use client";

import { useActionState } from "react";
import { createUser, resetPassword } from "@/app/actions/admin";
import { INPUT, LABEL } from "@/lib/ui";
import { Message, RowButton, Submit } from "./forms";

export function CreateUserForm() {
  const [state, action] = useActionState(createUser, undefined);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input name="name" required defaultValue={state?.fields?.name} className={INPUT} />
        </label>
        <label className={LABEL}>
          Company
          <input name="company" required defaultValue={state?.fields?.company} className={INPUT} />
        </label>
        <label className={LABEL}>
          Email
          <input name="email" type="email" required defaultValue={state?.fields?.email} className={INPUT} />
        </label>
      </div>
      <Message state={state} />
      <Submit busy="Making" className="justify-self-start">
        Make client account
      </Submit>
    </form>
  );
}

export function ResetPassword({ userId }: { userId: string }) {
  const [state, action] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="userId" value={userId} />
      <RowButton>Reset password</RowButton>
      <Message state={state} />
    </form>
  );
}
