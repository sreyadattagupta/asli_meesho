import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function Card({ className, children, as: Tag = "div" }: {
  className?: string; children: ReactNode; as?: "div" | "section";
}) {
  return (
    <Tag className={cn("rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm", className)}>
      {children}
    </Tag>
  );
}
