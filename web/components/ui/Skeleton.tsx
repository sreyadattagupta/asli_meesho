import { cn } from "@/lib/cn";

/** Shimmer placeholder — size it to match the final layout (no layout shift). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/10", className)} aria-hidden />;
}
