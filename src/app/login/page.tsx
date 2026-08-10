import { redirect } from "next/navigation";
import { signIn, isOidcEnabled, isLocalLoginEnabled } from "@/auth";
import { getCurrentUser } from "@/lib/authz";
import { AuthError } from "next-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // Already signed in — don't show a login form.
  if (await getCurrentUser()) redirect("/");

  const error = searchParams.error;

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
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

      {isOidcEnabled ? (
        <form
          action={async () => {
            "use server";
            await signIn("oidc", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="mb-4 w-full rounded-md bg-sky-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            Continue with single sign-on
          </button>
        </form>
      ) : null}

      {isOidcEnabled && isLocalLoginEnabled ? (
        <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-600">
          <span className="h-px flex-1 bg-surface-border" />
          or
          <span className="h-px flex-1 bg-surface-border" />
        </div>
      ) : null}

      {isLocalLoginEnabled ? (
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
              // genuine auth failures should be turned into an error message.
              if (err instanceof AuthError) {
                redirect(`/login?error=${err.type}`);
              }
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
              className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-slate-100 placeholder:text-slate-600"
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
              className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-slate-100 placeholder:text-slate-600"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-surface-hover"
          >
            Sign in
          </button>
        </form>
      ) : null}

      {!isOidcEnabled && !isLocalLoginEnabled ? (
        <p role="alert" className="text-sm text-red-300">
          No sign-in method is enabled. Set OIDC_* env vars or re-enable local login.
        </p>
      ) : null}
    </main>
  );
}
