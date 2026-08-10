import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/authz";
import { getOidcConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; local?: string };
}) {
  if (await getCurrentUser()) redirect("/");

  const oidc = await getOidcConfig();
  const error = searchParams.error;

  // The local form is always reachable — it's the break-glass path for the
  // bootstrap admin. It's just not the thing we lead with once SSO is set up.
  const showLocalByDefault = !oidc.enabled || searchParams.local === "1";

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10"
    >
      <h1 className="mb-1 text-xl font-semibold text-slate-100">Sign in</h1>
      <p className="mb-6 text-sm text-slate-500">Access your services.</p>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300"
        >
          {error === "CredentialsSignin"
            ? "Incorrect username or password."
            : "Could not sign you in. Please try again."}
        </p>
      ) : null}

      {oidc.enabled ? (
        <form
          action={async () => {
            "use server";
            await signIn("oidc", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-sky-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            Continue with {oidc.displayName}
          </button>
        </form>
      ) : null}

      {oidc.enabled && !showLocalByDefault ? (
        <p className="mt-6 text-center">
          <a href="/login?local=1" className="text-xs text-slate-600 underline hover:text-slate-400">
            Sign in with a local account
          </a>
        </p>
      ) : null}

      {showLocalByDefault ? (
        <>
          {oidc.enabled ? (
            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-600">
              <span className="h-px flex-1 bg-surface-border" />
              local account
              <span className="h-px flex-1 bg-surface-border" />
            </div>
          ) : null}

          <form
            action={async (formData: FormData) => {
              "use server";
              try {
                await signIn("credentials", {
                  username: formData.get("username"),
                  password: formData.get("password"),
                  redirectTo: "/",
                });
              } catch (err) {
                // next-auth signals a successful redirect by throwing, so only
                // genuine auth failures become an error message.
                if (err instanceof AuthError) redirect(`/login?local=1&error=${err.type}`);
                throw err;
              }
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor="username" className="mb-1 block text-sm text-slate-400">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm text-slate-400">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-slate-100"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-surface-hover"
            >
              Sign in
            </button>
          </form>

          {!oidc.enabled ? (
            <p className="mt-5 text-xs text-slate-600">
              Single sign-on isn&apos;t configured yet. Sign in with the bootstrap admin account and
              set it up under Admin → Authentication.
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
