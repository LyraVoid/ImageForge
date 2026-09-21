import { TriangleAlert } from "lucide-react";
import * as React from "react";
import type { ImageForgeErrorJson } from "@/core";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/utils";

export interface ErrorPanelProps {
  error: ImageForgeErrorJson | null;
  className?: string;
}

export function ErrorPanel({ error, className }: ErrorPanelProps) {
  const [showTechnical, setShowTechnical] = React.useState(false);
  if (!error) return null;

  return (
    <div
      role="alert"
      className={cn("rounded-lg border border-error/30 bg-error-muted px-4 py-3", className)}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">{error.message}</p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{error.code}</p>
          {error.technical ? (
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2"
                onClick={() => setShowTechnical((value) => !value)}
                aria-expanded={showTechnical}
              >
                {showTechnical ? "Hide technical details" : "Show technical details"}
              </Button>
              {showTechnical ? <CodeBlock label="technical detail" value={error.technical} wrap /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
