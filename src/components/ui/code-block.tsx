import { Check, Copy } from "lucide-react";
import * as React from "react";
import { useT } from "@/i18n/use-translation";
import { cn } from "@/lib/utils";

export interface CodeBlockProps {
  value: string;
  label?: string;
  className?: string;
  wrap?: boolean;
}

export function CodeBlock({ value, label, className, wrap = false }: CodeBlockProps) {
  const t = useT();
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-surface-sunken", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label ?? t("code.value")}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          aria-label={copied ? t("code.copied") : t("code.aria.copy")}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? t("code.copied") : t("code.copy")}
        </button>
      </div>
      <pre
        className={cn(
          "px-2.5 py-2 font-mono text-[11.5px] leading-5 text-foreground",
          wrap ? "whitespace-pre-wrap break-all" : "overflow-x-auto",
        )}
      >
        <code>{value}</code>
      </pre>
    </div>
  );
}
