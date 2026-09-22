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
}

export function KeyValueList({ entries, className, mono = true }: KeyValueListProps) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {entries.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
          <dt className="w-56 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:pt-0.5">
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
