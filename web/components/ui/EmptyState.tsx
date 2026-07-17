import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Two surfaces, one component (§9): the seller and admin portals are the dark Asli trust skin, the
// buyer marketplace the bright Meesho retail one. This used to be dark-only, which made every empty
// state on the marketplace — "No products yet", "No orders yet" — near-invisible white-on-white.
const SKIN = {
  dark: {
    border: "border-white/10",
    icon: "text-white/30",
    title: "text-white/80",
    hint: "text-white/50",
  },
  light: {
    border: "border-zinc-200",
    icon: "text-zinc-300",
    title: "text-zinc-800",
    hint: "text-zinc-500",
  },
} as const;

export function EmptyState({ icon: Icon, title, hint, action, skin = "dark" }: {
  icon: LucideIcon; title: string; hint?: string; action?: ReactNode; skin?: keyof typeof SKIN;
}) {
  const s = SKIN[skin];
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center ${s.border}`}>
      <Icon className={`h-8 w-8 ${s.icon}`} aria-hidden />
      <p className={`font-semibold ${s.title}`}>{title}</p>
      {hint && <p className={`max-w-xs text-sm ${s.hint}`}>{hint}</p>}
      {action}
    </div>
  );
}
