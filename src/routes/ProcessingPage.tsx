import { CircleCheck, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useForgeStore } from "@/stores/forge-store";

const MILESTONES = [
  { id: "analyze", label: "Analyze", progress: 0, description: "Reading the boot header" },
  { id: "extract", label: "Extract", progress: 20, description: "Splitting kernel and ramdisk" },
  { id: "prepare", label: "Prepare", progress: 40, description: "Building the patch payload" },
  { id: "patch", label: "Patch", progress: 60, description: "Applying the provider pipeline" },
  { id: "repack", label: "Repack", progress: 80, description: "Rebuilding the boot image" },
  { id: "verify", label: "Verify", progress: 95, description: "Re-parsing and hashing the output" },
  { id: "complete", label: "Complete", progress: 100, description: "Output ready to download" },
];

export function ProcessingPage() {
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

  if (stage === "patched") return <Navigate to="/result" replace />;

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>The patch did not finish</CardTitle>
            <CardDescription>
              Nothing is running now. The reason is below, and technical details are available.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => navigate("/patch")}>
              Back to the patch plan
            </Button>
            <Button variant="ghost" onClick={() => navigate("/")}>
              Start over
            </Button>
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
          <CardTitle>Nothing is being processed</CardTitle>
          <CardDescription>
            Start from an image, choose a patch method and press Start patch.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link to="/">Select an image</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/patch">Back to the patch plan</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const current = progress?.progress ?? 0;
  const activeStage = progress?.stage ?? "analyze";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-4">
      <div className="space-y-2">
        <h1 className="text-base font-semibold tracking-tight">Patching image</h1>
        <p className="text-xs text-muted-foreground">
          {progress?.message ?? "Working inside the patch worker"} · all processing stays on this device.
        </p>
      </div>

      <ErrorPanel error={error} />

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {stage === "patching" ? (
                <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
              ) : (
                <CircleCheck className="size-4 text-success" aria-hidden />
              )}
              <span className="text-sm font-medium">
                {MILESTONES.find((entry) => entry.id === activeStage)?.label ?? "Working"}
              </span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{current}%</span>
          </div>
          <Progress value={current} aria-label="Patch progress" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-0">
          <ol className="space-y-2">
            {MILESTONES.map((milestone) => {
              const done = current >= milestone.progress;
              const isCurrent = activeStage === milestone.id;
              return (
                <li key={milestone.id} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 size-1.5 shrink-0 rounded-full",
                      done ? "bg-primary" : "bg-border-strong",
                      isCurrent && "ring-2 ring-primary/30",
                    )}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("text-xs", done ? "text-foreground" : "text-muted-foreground")}>
                        {milestone.label}
                      </p>
                      <p className="text-[11px] leading-4 text-muted-foreground">{milestone.description}</p>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{milestone.progress}%</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          disabled={stage !== "patching"}
          onClick={async () => {
            await cancelPatch();
            navigate("/patch");
          }}
        >
          <X />
          Cancel
        </Button>
      </div>
    </div>
  );
}
