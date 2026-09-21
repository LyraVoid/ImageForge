import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  value?: number;
  indeterminate?: boolean;
}

export function Progress({ className, value, indeterminate = false, ...props }: ProgressProps) {
  const clamped = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <ProgressPrimitive.Root
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
      value={indeterminate ? null : clamped}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-300 ease-out",
          indeterminate && "w-1/3 animate-[forge-indeterminate_1.2s_ease-in-out_infinite]",
        )}
        style={indeterminate ? undefined : { width: clamped + "%" }}
      />
    </ProgressPrimitive.Root>
  );
}
