import type { ReportField } from "@/core";
import { cn } from "@/lib/utils";

export interface FieldListProps {
  fields: ReportField[];
  className?: string;
  columns?: 1 | 2;
}

export function FieldList({ fields, className, columns = 2 }: FieldListProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3",
        columns === 2 ? "sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {fields.map((entry) => (
        <div key={entry.label} className="min-w-0 space-y-0.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {entry.label}
          </dt>
          <dd className="break-words font-mono text-xs leading-5 text-foreground">{entry.value}</dd>
          {entry.hint ? <p className="text-[11px] leading-4 text-muted-foreground">{entry.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}
