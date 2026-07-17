// Page title block. A server component on purpose — it holds no state, so keeping it off the client
// bundle costs nothing and every portal page renders it.
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Page-level control (e.g. "Create listing") rendered opposite the title. */
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-white/40">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
