import { cn } from "@/lib/cn";
import { CheckCircle2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** One agent's explainable verdict line — icon, label, confidence %, pass/fail. */
export function AgentReasonRow({ icon: Icon, label, confidence, passed, note }: {
  icon: LucideIcon; label: string; confidence?: number; passed?: boolean; note?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-asli-violet" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white/90">{label}</p>
        {note && <p className="text-xs text-white/50">{note}</p>}
      </div>
      {confidence !== undefined && (
        <span className={cn("text-sm font-semibold tabular-nums", passed === false ? "text-asli-red" : "text-white/70")}>
          {Math.round(confidence * 100)}%
        </span>
      )}
      {passed === true && <CheckCircle2 className="h-4 w-4 shrink-0 text-asli-green" aria-label="passed" />}
      {passed === false && <XCircle className="h-4 w-4 shrink-0 text-asli-red" aria-label="failed" />}
    </div>
  );
}
