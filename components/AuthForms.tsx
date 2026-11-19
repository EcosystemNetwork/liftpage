"use client";

import { useActionState, useState } from "react";
import { changePassword, forgotPassword, login, setPassword, signup } from "@/app/actions/auth";
import { INPUT, LABEL } from "@/lib/ui";
import { Message, Submit } from "./forms";

/** A password box with a Show/Hide button, so nobody has to type blind. */
function PasswordInput({ name = "password", autoComplete, minLength }: { name?: string; autoComplete: string; minLength?: number }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="flex gap-2">
      <input name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} minLength={minLength} required className={INPUT} />
      <button type="button" onClick={() => setShown(!shown)} aria-pressed={shown} className="btn-ghost shrink-0">
        {shown ? "Hide" : "Show"}
      </button>
    </span>
  );
}

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
        <PasswordInput autoComplete="current-password" />
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
        <PasswordInput autoComplete="new-password" minLength={8} />
        <span className="text-sm text-muted">At least 8 letters or numbers.</span>
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
        <PasswordInput name="current" autoComplete="current-password" />
      </label>
      <label className={LABEL}>
        New password
        <PasswordInput autoComplete="new-password" minLength={8} />
      </label>
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        Change password
      </Submit>
    </form>
  );
}

export function SetPasswordForm() {
  const [state, action] = useActionState(setPassword, undefined);
  return (
    <form action={action} className="grid gap-4">
      <label className={LABEL}>
        New password
        <PasswordInput autoComplete="new-password" minLength={8} />
        <span className="text-sm text-muted">At least 8 letters or numbers.</span>
      </label>
      <Message state={state} />
      <Submit busy="Saving" className="justify-self-start">
        Set password
      </Submit>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(forgotPassword, undefined);
  return (
    <form action={action} className="grid gap-4">
      <label className={LABEL}>
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} className={INPUT} />
      </label>
      <Message state={state} />
      <Submit busy="Sending" className="justify-self-start">
        Send reset link
      </Submit>
    </form>
  );
}
