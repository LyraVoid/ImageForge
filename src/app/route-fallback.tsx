import { LoaderCircle } from "lucide-react";
import { useT } from "@/i18n/use-translation";

export function RouteFallback() {
  const t = useT();

  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        {t("app.loading")}
      </div>
    </div>
  );
}
