import { Download, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { KeyValueList } from "@/components/app/key-value-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

export function ResultPage() {
  const navigate = useNavigate();
  const output = useForgeStore((state) => state.output);
  const error = useForgeStore((state) => state.error);
  const reset = useForgeStore((state) => state.reset);
  const handleDownload = useCallback(() => {
    if (!output) return;
    const url = URL.createObjectURL(output.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = output.fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [output]);

  if (!output) return <Navigate to="/" replace />;

  const checks = output.verification.checks;
  const metadataEntries = Object.entries(output.metadata).map(([key, value]) => ({ key, value }));
  const warningEntries = Array.from(new Set([...output.warnings, ...output.verification.verification.warnings]));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Patch complete</h1>
        <p className="text-xs text-muted-foreground">
          The output image was repacked and re-verified in the browser.
        </p>
      </div>

      <ErrorPanel error={error} />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="font-mono">{output.fileName}</CardTitle>
            <CardDescription>
              {formatBytes(output.sizeBytes)} · target {output.plan.target} · provider{" "}
              {output.plan.providerName}
            </CardDescription>
          </div>
          <Badge variant={output.verification.verification.valid ? "success" : "danger"}>
            <ShieldCheck className="size-3" aria-hidden />
            {output.verification.verification.valid ? "Verified" : "Needs attention"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Verification</p>
            <div className="space-y-2">
              {checks.map((entry) => (
                <StatusBadge key={entry.id} status={entry.status} label={entry.label} detail={entry.detail} />
              ))}
            </div>
          </div>

          {output.metadata.imageSizeBefore !== undefined &&
          output.metadata.imageSizeBefore !== output.metadata.imageSizeAfter ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              Input {formatBytes(Number(output.metadata.imageSizeBefore))} → output{" "}
              {formatBytes(Number(output.metadata.imageSizeAfter))}. The input was a whole-partition image:
              partition padding and the AVB blob are not part of a boot image, so the output is the compact
              boot image that mkbootimg and Magisk also produce. The kernel itself is unchanged apart from the
              patch.
            </p>
          ) : null}

          <CodeBlock label="sha-256" value={output.sha256} wrap />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" onClick={handleDownload}>
              <Download />
              Download image
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await reset();
                navigate("/");
              }}
            >
              <RotateCcw />
              Patch another image
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-info/30 bg-info-muted px-4 py-3">
        {output.plan.providerId === "mock" ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            Produced by the Mock Provider. This output demonstrates the pipeline, not a root solution: it
            rewrites the kernel cmdline and the bootconfig manifest. Flashing it will not grant root.
          </p>
        ) : (
          <p className="text-[11px] leading-4 text-muted-foreground">
            Produced by {output.plan.providerName}
            {output.metadata.kpimgVersion ? " with KernelPatch " + output.metadata.kpimgVersion : ""}. Only the
            kernel section was modified. The AVB signature was dropped, so verified boot will fail unless the
            image is re-signed or verification is disabled. ImageForge never flashes a device.
          </p>
        )}
      </div>

      {warningEntries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {warningEntries.map((warning) => (
                <li key={warning} className="text-[11px] leading-4 text-muted-foreground">
                  {warning}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Technical details</CardTitle>
          <CardDescription>Patch metadata recorded by the engine and the provider.</CardDescription>
        </CardHeader>
        <CardContent>
          <KeyValueList entries={metadataEntries} />
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
          Inspect the artifact registry and runtime settings
        </Link>
      </p>
    </div>
  );
}
