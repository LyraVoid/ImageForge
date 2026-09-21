import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "complete" | "current" | "upcoming" | "error";

export interface StepDefinition {
  id: string;
  label: string;
}

export interface StepIndicatorProps {
  steps: StepDefinition[];
  currentIndex: number;
  state?: StepState;
  onStepSelect?: (index: number) => void;
  className?: string;
}

function stateFor(index: number, currentIndex: number, override?: StepState): StepState {
  if (index < currentIndex) return "complete";
  if (index === currentIndex) return override ?? "current";
  return "upcoming";
}

export function StepIndicator({ steps, currentIndex, state, onStepSelect, className }: StepIndicatorProps) {
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1 gap-y-2", className)} aria-label="Workflow progress">
      {steps.map((step, index) => {
        const stepState = stateFor(index, currentIndex, state);
        const interactive = Boolean(onStepSelect) && index <= currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => onStepSelect?.(index)}
              aria-current={stepState === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors",
                interactive && "hover:bg-surface-muted",
                !interactive && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border text-[10px] font-medium",
                  stepState === "complete" && "border-primary bg-primary text-primary-foreground",
                  stepState === "current" && "border-primary text-primary",
                  stepState === "upcoming" && "border-border-strong text-muted-foreground",
                  stepState === "error" && "border-error text-error",
                )}
              >
                {stepState === "complete" ? <Check className="size-2.5" aria-hidden /> : index + 1}
              </span>
              <span
                className={cn(
                  stepState === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  stepState === "current" && "font-medium",
                )}
              >
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn("h-px w-4", stepState === "complete" ? "bg-primary" : "bg-border-strong")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
