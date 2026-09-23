import { cn } from "@/lib/utils";

export interface KeyValueListEntry {
  /** Stable identifier, used as the React key so the label can change with the language. */
  key: string;
  value: string;
  /** The label to show; the key itself when the field has no translated label. */
  label?: string;
}

export interface KeyValueListProps {
  entries: KeyValueListEntry[];
  className?: string;
  mono?: boolean;
  /** Stack labels above values; useful inside narrow side panels. */
  stacked?: boolean;
}

export function KeyValueList({ entries, className, mono = true, stacked = false }: KeyValueListProps) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {entries.map((entry) => (
        <div
          key={entry.key}
          className={cn(
            "flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0",
            !stacked && "sm:flex-row sm:gap-4",
          )}
        >
          <dt
            className={cn(
              "shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:pt-0.5",
              !stacked && "w-56",
            )}
          >
            {entry.label ?? entry.key}
          </dt>
          <dd className={cn("min-w-0 flex-1 break-words text-xs text-foreground", mono && "font-mono")}>
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
