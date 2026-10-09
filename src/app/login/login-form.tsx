"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm text-ink2">Email</span>
        <input name="email" type="email" autoComplete="username" required className="field mt-1" />
      </label>
      <label className="block">
        <span className="text-sm text-ink2">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="field mt-1" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-critical">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
