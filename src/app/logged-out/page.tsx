import Link from "next/link";
import { getOidcConfig } from "@/lib/settings";

// No session to read, but the copy below depends on saved settings.
export const dynamic = "force-dynamic";

/**
 * Where signing out ends up.
 *
 * A page of its own rather than sending people back to /login, because /login
 * immediately starts SSO again — landing there after signing out would bounce
 * straight to the identity provider, which reads as the button having failed.
 * This is also the address registered with the provider as the post-logout
 * redirect, so it has to exist and be reachable without a session.
 */
export default async function LoggedOutPage() {
  const oidc = await getOidcConfig();

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4">
      <div className="w-full rounded-lg border border-surface-border bg-surface-raised p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-100">You&apos;re signed out</h1>
        <p className="mt-2 text-sm text-slate-400">
          {oidc.enabled
            ? `Your ${oidc.displayName} session has ended too, so signing back in will ask for your credentials again.`
            : "Your portal session has ended."}
        </p>

        <Link
          href="/login"
          className="mt-5 inline-block rounded-md border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
        >
          Sign in again
        </Link>
      </div>
    </main>
  );
}
