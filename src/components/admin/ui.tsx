import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-lg border border-surface-border bg-surface-raised p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm text-slate-400">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-surface-border bg-surface-base px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600";

export function Button({
  children,
  variant = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" }) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "border-sky-600 bg-sky-600 text-white hover:bg-sky-500",
        variant === "danger" && "border-red-900 bg-red-950/40 text-red-300 hover:bg-red-950/70",
        variant === "default" && "border-surface-border text-slate-300 hover:bg-surface-hover",
        className
      )}
    >
      {children}
    </button>
  );
}
