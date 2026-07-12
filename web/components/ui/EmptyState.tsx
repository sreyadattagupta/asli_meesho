import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, hint, action }: {
  icon: LucideIcon; title: string; hint?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-white/30" aria-hidden />
      <p className="font-semibold text-white/80">{title}</p>
      {hint && <p className="max-w-xs text-sm text-white/50">{hint}</p>}
      {action}
    </div>
  );
}
