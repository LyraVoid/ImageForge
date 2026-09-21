import { ArrowLeft, Info, LoaderCircle, Play } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { KeyValueList } from "@/components/app/key-value-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatBytes, truncateHash } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

export function PatchPage() {
  const navigate = useNavigate();
  const analysis = useForgeStore((state) => state.analysis);
  const planResponse = useForgeStore((state) => state.planResponse);
  const selectedProviderId = useForgeStore((state) => state.selectedProviderId);
  const error = useForgeStore((state) => state.error);
  const isBusy = useForgeStore((state) => state.isBusy);
  const selectProvider = useForgeStore((state) => state.selectProvider);
  // Keeps the switch in the position the user chose while the worker rebuilds the plan.
  const [preserveSizeOverride, setPreserveSizeOverride] = useState<boolean | null>(null);

  if (!analysis) return <Navigate to="/" replace />;
  if (!selectedProviderId) return <Navigate to="/analyze" replace />;
  if (!planResponse) {
    if (!isBusy) return <Navigate to="/analyze" replace />;
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
          Building the patch plan
        </CardContent>
      </Card>
    );
  }

  const plan = planResponse.plan;
  const candidate = analysis.compatibility.candidates.find((entry) => entry.providerId === selectedProviderId);

  const planEntries = [
    { key: "Provider", value: plan.providerName + " (" + plan.providerId + ")" },
    { key: "Release", value: plan.release },
    { key: "Artifact", value: plan.artifact.id + "@" + plan.artifact.version },
    { key: "Artifact type", value: plan.artifact.type },
    {
      key: "Artifact SHA-256",
      value: plan.artifact.sha256 ? truncateHash(plan.artifact.sha256, 24, 12) : "not recorded",
    },
    { key: "Architecture", value: plan.architecture },
    { key: "Target image", value: plan.target },
    { key: "Boot header", value: "v" + plan.headerVersion },
    { key: "Page size", value: formatBytes(plan.pageSize) },
    { key: "Source SHA-256", value: truncateHash(plan.sourceImageSha256, 24, 12) },
    { key: "Plan id", value: plan.id },
    { key: "Reproducible", value: plan.reproducible ? "yes" : "no" },
  ];

  const configurationEntries = Object.entries(plan.configuration).map(([key, value]) => ({
    key,
    value: String(value),
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-base font-semibold tracking-tight">{plan.providerName}</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">{candidate?.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {candidate?.status === "planned" ? <Badge variant="neutral">Not available</Badge> : null}
          <Badge variant="outline">{plan.target}</Badge>
          <Badge variant="neutral">v{plan.headerVersion}</Badge>
        </div>
      </div>

      <ErrorPanel error={error} />

      <div className="rounded-lg border border-info/30 bg-info-muted px-4 py-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              {plan.providerId === "mock"
                ? "This is the Mock Provider."
                : "This runs the upstream " + plan.providerName + " implementation."}
            </p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              {plan.providerId === "mock"
                ? "It rewrites the kernel cmdline and writes a bootconfig manifest so the pipeline can be verified end to end. It does not root a device."
                : "KernelPatch is injected into the kernel image inside boot.img by the upstream kptools build running in WebAssembly. The ramdisk is untouched, the original AVB signature is dropped, and flashing the result is your responsibility."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patch plan</CardTitle>
            <CardDescription>
              Provider, release and artifact are pinned so the same plan can be reproduced later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KeyValueList entries={planEntries} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Plan configuration passed to the provider.</CardDescription>
            </CardHeader>
            <CardContent>
              <KeyValueList entries={configurationEntries} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>The stages executed inside the Web Worker.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1.5">
                {plan.steps.map((step) => (
                  <li key={step.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-foreground">{step.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{step.progress}%</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t border-border pt-1.5 text-xs">
                  <span className="font-medium text-foreground">Complete</span>
                  <span className="font-mono text-[11px] text-muted-foreground">100%</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {planResponse.providerNotes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Provider notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {planResponse.providerNotes.map((note) => (
                <li key={note} className="text-[11px] leading-4 text-muted-foreground">
                  {note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>
            Device images are usually whole-partition dumps, so only the boot image itself is kept by
            default.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Preserve the original image size</p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Zero pads the output to {formatBytes(analysis.summary.totalSize)} so tools that expect a
              partition sized image keep their file size. The AVB signature stays invalid either way.
            </p>
          </div>
          <Switch
            aria-label="Preserve the original image size"
            checked={preserveSizeOverride ?? plan.configuration.preserveImageSize === "true"}
            onCheckedChange={(checked) => {
              setPreserveSizeOverride(checked);
              if (!selectedProviderId) return;
              void selectProvider(selectedProviderId, {
                configuration: { preserveImageSize: String(checked) },
              });
            }}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate("/analyze")}>
          <ArrowLeft />
          Back to analysis
        </Button>
        <Button variant="primary" disabled={isBusy} onClick={() => navigate("/processing")}>
          {isBusy ? <LoaderCircle className="animate-spin" /> : <Play />}
          Start patch
        </Button>
      </div>
    </div>
  );
}
