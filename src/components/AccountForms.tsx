"use client";

import { useFormState, useFormStatus } from "react-dom";
import { changeOwnPassword, type AccountResult } from "@/lib/actions/account";
import { Button, Field, inputClass } from "@/components/admin/ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function PasswordForm() {
  const [state, action] = useFormState<AccountResult | null, FormData>(changeOwnPassword, null);

  return (
    <form action={action} className="space-y-3">
      <Field label="Current password" htmlFor="currentPassword">
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>
      <Field label="New password" htmlFor="newPassword" hint="At least 10 characters.">
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className={inputClass}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      {state ? (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
              : "border-red-900 bg-red-950/40 text-red-300"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <Submit label="Change password" />
    </form>
  );
}
