"use client";

import { useActionState } from "react";
import { changePassword, login, signup } from "@/app/actions/auth";
import { INPUT, LABEL } from "@/lib/ui";
import { Message, Submit } from "./forms";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="grid gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className={LABEL}>
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} className={INPUT} />
      </label>
      <label className={LABEL}>
        Password
        <input name="password" type="password" autoComplete="current-password" required className={INPUT} />
      </label>
      <Message state={state} />
      <Submit busy="Signing in" className="justify-self-start">
        Sign in
      </Submit>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signup, undefined);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input name="name" autoComplete="name" required defaultValue={state?.fields?.name} className={INPUT} />
        </label>
        <label className={LABEL}>
          Company
          <input name="company" autoComplete="organization" required defaultValue={state?.fields?.company} className={INPUT} />
        </label>
      </div>
      <label className={LABEL}>
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} className={INPUT} />
      </label>
      <label className={LABEL}>
        Password
        <input name="password" type="password" autoComplete="new-password" minLength={10} required className={INPUT} />
        <span className="text-xs text-mute">Ten characters or more.</span>
      </label>
      <Message state={state} />
      <Submit busy="Creating" className="justify-self-start">
        Create account
      </Submit>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="grid gap-4">
      <label className={LABEL}>
        Current password
        <input name="current" type="password" autoComplete="current-password" required className={INPUT} />
      </label>
      <label className={LABEL}>
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={10} required className={INPUT} />
      </label>
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        Change password
      </Submit>
    </form>
  );
}
