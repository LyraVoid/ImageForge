import { useT } from "@/i18n/use-translation";
import { Progress } from "@/components/ui/progress";
import { useForgeStore } from "@/stores/forge-store";

/**
 * A slim bar for the long jobs outside the patch flow: extracting a big partition, packing a super or
 * a sparse image, reading every frame of a splash image. It disappears on its own once the job's last
 * report arrives, so it needs no timers and cannot get stuck.
 */
export function TaskProgressBar() {
  const t = useT();
  const progress = useForgeStore((state) => state.taskProgress);
  if (!progress || progress.total <= 0 || progress.done >= progress.total) return null;
  const percent = Math.max(1, Math.min(99, Math.round((100 * progress.done) / progress.total)));
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {t(("task." + progress.task) as never)}
      </span>
      <Progress value={percent} className="w-40" />
      <span className="w-10 text-right font-mono text-[11px] text-muted-foreground">{percent}%</span>
    </div>
  );
}
