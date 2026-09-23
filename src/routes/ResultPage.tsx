import { Download, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { PATCH_ROUTES } from "@/app/tools";
import { DiagnosticsButton } from "@/components/app/diagnostics-button";
import { ErrorPanel } from "@/components/app/error-panel";
import { KeyValueList } from "@/components/app/key-value-list";
import { ReadinessChecklist } from "@/components/app/readiness-checklist";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { checkLabel } from "@/i18n/engine-keys";
import { useRecordText, useT } from "@/i18n/use-translation";
import type { Translator } from "@/i18n";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

function providerNote(
  t: Translator,
  providerId: string,
  providerName: string,
  kernelPatchVersion: string | undefined,
): string {
  if (providerId === "mock") return t("result.note.mock");
  if (providerId === "apatch") {
    return t("result.note.apatch", {
      provider: providerName,
      kernelPatch: kernelPatchVersion
        ? t("result.note.withKernelPatch", { version: kernelPatchVersion })
        : "",
    });
  }
  return t("result.note.ramdisk", { provider: providerName });
}

export function ResultPage() {
  const t = useT();
  const record = useRecordText();
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

  if (!output) return <Navigate to={PATCH_ROUTES.image} replace />;

  const checks = output.verification.checks;
  const metadataEntries = Object.entries(output.metadata).map(([key, value]) => ({
    key,
    label: record(key),
    value,
  }));
  const warningEntries = Array.from(new Set([...output.warnings, ...output.verification.verification.warnings]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("result.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("result.subtitle")}</p>
      </div>

      <ErrorPanel error={error} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("result.verification")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {checks.map((entry) => (
                <StatusBadge
                  key={entry.id}
                  status={entry.status}
                  label={checkLabel(t, entry)}
                  detail={entry.detail}
                />
              ))}

              {output.metadata.imageSizeBefore !== undefined &&
              output.metadata.imageSizeBefore !== output.metadata.imageSizeAfter ? (
                <p className="border-t border-border pt-3 text-[11px] leading-4 text-muted-foreground">
                  {t("result.compactNote", {
                    input: formatBytes(Number(output.metadata.imageSizeBefore)),
                    output: formatBytes(Number(output.metadata.imageSizeAfter)),
                  })}
                </p>
              ) : null}

              {output.metadata.preserveImageSize === "true" ? (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {t("result.paddedNote", { size: formatBytes(Number(output.metadata.imageSizeAfter)) })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <ReadinessChecklist
            plan={output.plan}
            metadata={output.metadata}
            verification={output.verification}
            sizeBytes={output.sizeBytes}
          />

          <div className="rounded-lg border border-info/30 bg-info-muted px-4 py-3">
            <p className="text-[11px] leading-4 text-muted-foreground">
              {providerNote(t, output.plan.providerId, output.plan.providerName, output.metadata.kpimgVersion)}
            </p>
          </div>

          {warningEntries.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("result.warnings")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {warningEntries.map((warning) => (
                    <li key={warning} className="text-[11px] leading-4 text-muted-foreground">
                      {record(warning)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{t("result.technical")}</CardTitle>
                <CardDescription>{t("result.technical.description")}</CardDescription>
              </div>
              <DiagnosticsButton className="shrink-0" />
            </CardHeader>
            <CardContent>
              <KeyValueList entries={metadataEntries} />
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate font-mono">{output.fileName}</CardTitle>
                  <CardDescription className="mt-1">
                    {t("result.meta", {
                      size: formatBytes(output.sizeBytes),
                      target: output.plan.target,
                      provider: output.plan.providerName,
                    })}
                  </CardDescription>
                </div>
                <Badge variant={output.verification.verification.valid ? "success" : "danger"}>
                  <ShieldCheck className="size-3" aria-hidden />
                  {output.verification.verification.valid ? t("result.verified") : t("result.needsAttention")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <CodeBlock label="sha-256" value={output.sha256} wrap />
              <Button variant="primary" size="lg" className="w-full" onClick={handleDownload}>
                <Download />
                {t("result.download")}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={async () => {
                  await reset();
                  navigate(PATCH_ROUTES.image);
                }}
              >
                <RotateCcw />
                {t("result.another")}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
          {t("result.settingsLink")}
        </Link>
      </p>
    </div>
  );
}
