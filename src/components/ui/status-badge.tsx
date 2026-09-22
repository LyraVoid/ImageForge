import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { CheckStatus } from "@/core";
import { useT } from "@/i18n/use-translation";
import type { MessageKey } from "@/i18n";
import { cn } from "@/lib/utils";

const CONFIG: Record<CheckStatus, { icon: typeof CircleCheck; className: string; labelKey: MessageKey }> = {
  pass: { icon: CircleCheck, className: "text-success", labelKey: "check.status.pass" },
  warn: { icon: TriangleAlert, className: "text-warning", labelKey: "check.status.warn" },
  fail: { icon: CircleX, className: "text-error", labelKey: "check.status.fail" },
};

export interface StatusBadgeProps {
  status: CheckStatus;
  label?: string;
  detail?: string;
  className?: string;
}

export function StatusBadge({ status, label, detail, className }: StatusBadgeProps) {
  const t = useT();
  const config = CONFIG[status];
  const Icon = config.icon;
  const shown = label ?? t(config.labelKey);
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", config.className)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 text-foreground">{shown}</p>
        {detail ? <p className="mt-0.5 break-words font-mono text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <span className="sr-only">{t(config.labelKey)}</span>
    </div>
  );
}
