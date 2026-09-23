import { CircleCheck, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { PATCH_ROUTES } from "@/app/tools";
import { DiagnosticsButton } from "@/components/app/diagnostics-button";
import { ErrorPanel } from "@/components/app/error-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useRecordText, useT } from "@/i18n/use-translation";
import type { MessageKey } from "@/i18n";
import { cn } from "@/lib/utils";
import { useForgeStore } from "@/stores/forge-store";

const MILESTONES: Array<{
  id: string;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  progress: number;
}> = [
  { id: "analyze", labelKey: "process.stage.analyze.label", descriptionKey: "process.stage.analyze.description", progress: 0 },
  { id: "extract", labelKey: "process.stage.extract.label", descriptionKey: "process.stage.extract.description", progress: 20 },
  { id: "prepare", labelKey: "process.stage.prepare.label", descriptionKey: "process.stage.prepare.description", progress: 40 },
  { id: "patch", labelKey: "process.stage.patch.label", descriptionKey: "process.stage.patch.description", progress: 60 },
  { id: "repack", labelKey: "process.stage.repack.label", descriptionKey: "process.stage.repack.description", progress: 80 },
  { id: "verify", labelKey: "process.stage.verify.label", descriptionKey: "process.stage.verify.description", progress: 95 },
  { id: "complete", labelKey: "process.stage.complete.label", descriptionKey: "process.stage.complete.description", progress: 100 },
];

export function ProcessingPage() {
  const t = useT();
  const record = useRecordText();
  const navigate = useNavigate();
  const stage = useForgeStore((state) => state.stage);
  const progress = useForgeStore((state) => state.progress);
  const error = useForgeStore((state) => state.error);
  const runPatch = useForgeStore((state) => state.runPatch);
  const cancelPatch = useForgeStore((state) => state.cancelPatch);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (stage !== "planned") return;
    startedRef.current = true;
    void runPatch();
  }, [runPatch, stage]);

  if (stage === "patched") return <Navigate to={PATCH_ROUTES.result} replace />;

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("process.failed.title")}</CardTitle>
            <CardDescription>{t("process.failed.body")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => navigate(PATCH_ROUTES.plan)}>
              {t("process.failed.back")}
            </Button>
            <Button variant="ghost" onClick={() => navigate(PATCH_ROUTES.image)}>
              {t("process.failed.restart")}
            </Button>
            <DiagnosticsButton />
          </CardContent>
        </Card>
        <ErrorPanel error={error} />
      </div>
    );
  }

  if (stage !== "patching" && stage !== "planned") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("process.idle.title")}</CardTitle>
          <CardDescription>{t("process.idle.body")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link to={PATCH_ROUTES.image}>{t("process.idle.select")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to={PATCH_ROUTES.plan}>{t("process.failed.back")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const current = progress?.progress ?? 0;
  const activeStage = progress?.stage ?? "analyze";
  const activeMilestone = MILESTONES.find((entry) => entry.id === activeStage);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 py-4">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("process.title")}</h1>
        <p className="text-xs text-muted-foreground">
          {t("process.subtitle", {
            message: progress?.message ? record(progress.message) : t("process.working"),
          })}
        </p>
      </div>

      <ErrorPanel error={error} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {stage === "patching" ? (
                  <span className="flex size-9 items-center justify-center rounded-md bg-primary-muted text-primary">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  </span>
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-md bg-success-muted text-success">
                    <CircleCheck className="size-4" aria-hidden />
                  </span>
                )}
                <div>
                  <p className="text-sm font-medium">
                    {activeMilestone ? t(activeMilestone.labelKey) : t("process.working")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {activeMilestone ? t(activeMilestone.descriptionKey) : ""}
                  </p>
                </div>
              </div>
              <span className="font-mono text-xl text-foreground">{current}%</span>
            </div>
            <Progress value={current} aria-label={t("process.aria.progress")} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <ol className="space-y-3">
              {MILESTONES.map((milestone) => {
                const done = current >= milestone.progress;
                const isCurrent = activeStage === milestone.id;
                return (
                  <li key={milestone.id} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1 size-2 shrink-0 rounded-full",
                        done ? "bg-primary" : "bg-border-strong",
                        isCurrent && "ring-2 ring-primary/30",
                      )}
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className={cn("text-xs", done ? "text-foreground" : "text-muted-foreground")}>
                          {t(milestone.labelKey)}
                        </p>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                          {t(milestone.descriptionKey)}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">{milestone.progress}%</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          disabled={stage !== "patching"}
          onClick={async () => {
            await cancelPatch();
            navigate(PATCH_ROUTES.plan);
          }}
        >
          <X />
          {t("process.cancel")}
        </Button>
      </div>
    </div>
  );
}
