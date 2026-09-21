import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { CheckStatus } from "@/core";
import { cn } from "@/lib/utils";

const CONFIG: Record<CheckStatus, { icon: typeof CircleCheck; className: string; label: string }> = {
  pass: { icon: CircleCheck, className: "text-success", label: "Passed" },
  warn: { icon: TriangleAlert, className: "text-warning", label: "Warning" },
  fail: { icon: CircleX, className: "text-error", label: "Failed" },
};

export interface StatusBadgeProps {
  status: CheckStatus;
  label?: string;
  detail?: string;
  className?: string;
}

export function StatusBadge({ status, label, detail, className }: StatusBadgeProps) {
  const config = CONFIG[status];
  const Icon = config.icon;
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", config.className)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 text-foreground">{label ?? config.label}</p>
        {detail ? <p className="mt-0.5 break-words font-mono text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <span className="sr-only">{config.label}</span>
    </div>
  );
}
