"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/authz";
import { hashPassword, verifyPassword } from "@/lib/password";
import { recordAudit } from "@/lib/audit";

export type AccountResult = { ok: boolean; message: string };

const MIN_PASSWORD_LENGTH = 10;

/**
 * Self-service password change. Requires the current password even though the
 * user is already signed in — that's what stops a borrowed unlocked session
 * from being turned into permanent account takeover.
 */
export async function changeOwnPassword(
  _prev: AccountResult | null,
  form: FormData
): Promise<AccountResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You are not signed in." };

  const current = String(form.get("currentPassword") ?? "");
  const next = String(form.get("newPassword") ?? "");
  const confirm = String(form.get("confirmPassword") ?? "");

  const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!row?.passwordHash) {
    return {
      ok: false,
      message: "This account signs in with SSO and has no local password to change.",
    };
  }

  if (!(await verifyPassword(current, row.passwordHash))) {
    return { ok: false, message: "Your current password is incorrect." };
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (next !== confirm) {
    return { ok: false, message: "The two new passwords don't match." };
  }
  if (next === current) {
    return { ok: false, message: "That's the same as your current password." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(users.id, user.id));

  await recordAudit({
    actor: user,
    action: "update",
    entityType: "user",
    entityId: user.id,
    summary: "Changed their own password",
  });

  revalidatePath("/account");
  revalidatePath("/");
  return { ok: true, message: "Password changed." };
}

// Display name is not editable here: for SSO users it's mirrored from the
// identity provider on every sign-in, so a local edit would be silently
// overwritten. Change it in the IdP instead.
