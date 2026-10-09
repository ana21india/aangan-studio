"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";

const FIELDS = [
  ["current", "Current password", "current-password"],
  ["next", "New password (12 or more characters)", "new-password"],
  ["again", "New password again", "new-password"],
] as const;

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-4 max-w-sm">
      {FIELDS.map(([name, label, autoComplete]) => (
        <label key={name} className="block">
          <span className="text-sm text-ink2">{label}</span>
          <input name={name} type="password" autoComplete={autoComplete} required className="field mt-1" />
        </label>
      ))}
      {state.error && (
        <p role="alert" className="text-sm text-critical">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
