import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const styles = {
  verified: "bg-asli-green/15 text-asli-green ring-asli-green/30",
  trigger: "bg-asli-amber/15 text-asli-amber ring-asli-amber/30",
  blocked: "bg-asli-red/15 text-asli-red ring-asli-red/30",
  progress: "bg-asli-violet/15 text-asli-violet ring-asli-violet/30",
  neutral: "bg-white/5 text-white/60 ring-white/10",
} as const;

export function Badge({ variant, children, className }: {
  variant: keyof typeof styles; children: ReactNode; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1", styles[variant], className)}>
      {children}
    </span>
  );
}
