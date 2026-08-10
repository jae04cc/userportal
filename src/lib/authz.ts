import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, ensureDbReady } from "@/lib/db";
import { users, userGroups } from "@/lib/db/schema";

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  isBootstrap: boolean;
  /** True when the account still has the generated bootstrap password. */
  mustChangePassword: boolean;
  /** True when this account can sign in with a local password at all. */
  hasPassword: boolean;
  /** Group ids this user belongs to. Read fresh from the DB on every request. */
  groupIds: string[];
};

/**
 * The authoritative identity for a request. Roles and groups come from SQLite,
 * never from the JWT, so an admin's changes to someone's access take effect on
 * that user's very next request rather than at their next sign-in.
 *
 * React's cache() dedupes this to one query per request even when the layout,
 * the page, and a server action all ask for it.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await ensureDbReady();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  // Covers the case where an account was deleted while its cookie is still live.
  if (!row) return null;
  // Suspension takes effect on the very next request, despite JWT sessions
  // being self-contained and un-revokable — because this check reads the DB.
  if (!row.isActive) return null;

  const memberships = await db
    .select({ groupId: userGroups.groupId })
    .from(userGroups)
    .where(eq(userGroups.userId, userId));

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    isAdmin: row.isAdmin,
    isBootstrap: row.isBootstrap,
    mustChangePassword: row.mustChangePassword,
    hasPassword: Boolean(row.passwordHash),
    groupIds: memberships.map((m) => m.groupId),
  };
});

/** For pages: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For pages: redirects non-admins to the landing page. This is the server-side
 * gate — hiding admin links in the UI is cosmetic and is never relied upon.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");
  return user;
}

/** For route handlers and server actions, where a thrown error beats a redirect. */
export async function requireAdminApi(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not signed in", 401);
  if (!user.isAdmin) throw new AuthError("Admins only", 403);
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AuthError";
  }
}
