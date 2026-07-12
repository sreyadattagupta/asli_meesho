import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

const variants = {
  primary: "bg-asli-violet text-white hover:brightness-110",
  ghost: "border border-white/15 text-white/80 hover:bg-white/5",
  danger: "bg-asli-red text-white hover:brightness-110",
} as const;

export function Button({
  variant = "primary", loading = false, className, children, disabled, ...rest
}: { variant?: keyof typeof variants; loading?: boolean } & ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition",
        "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant], className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
