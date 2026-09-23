import { ArrowRight, Info, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import type { PatchCandidate } from "@/core";
import { DiagnosticsButton } from "@/components/app/diagnostics-button";
import { ErrorPanel } from "@/components/app/error-panel";
import { FieldList } from "@/components/app/field-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PATCH_ROUTES } from "@/app/tools";
import { reasonMessages, warningMessage } from "@/i18n/engine-keys";
import { useRecordText, useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useForgeStore } from "@/stores/forge-store";

function CandidateCard({
  candidate,
  onSelect,
  busy,
}: {
  candidate: PatchCandidate;
  onSelect: (providerId: string) => void;
  busy: boolean;
}) {
  const t = useT();
  const record = useRecordText();
  const selectable = candidate.available && candidate.compatible && !busy;

  return (
    <li
      className={cn(
        "rounded-md border border-border bg-surface-muted/45 p-3",
        !selectable && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{candidate.name}</span>
        {candidate.status === "planned" ? (
          <Badge variant="neutral">{t("analyze.method.notAvailable")}</Badge>
        ) : candidate.compatible ? (
          <Badge variant="success">
            <ShieldCheck className="size-3" aria-hidden />
            {t("analyze.method.compatible")}
          </Badge>
        ) : (
          <Badge variant="warning">{t("analyze.method.incompatible")}</Badge>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{record(candidate.description)}</p>

      {candidate.reasons.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {reasonMessages(t, candidate).map((reason) => (
            <li key={reason} className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {candidate.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {candidate.warnings.map((warning) => (
            <li key={warning.code} className="flex items-start gap-1.5 text-[11px] leading-4 text-warning">
              <ShieldAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>{warningMessage(t, warning)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        variant="secondary"
        size="sm"
        disabled={!selectable}
        onClick={() => onSelect(candidate.providerId)}
        className="mt-3 w-full"
      >
        {selectable ? t("analyze.method.select") : t("analyze.method.unavailable")}
        <ArrowRight />
      </Button>
    </li>
  );
}

export function AnalyzePage() {
  const t = useT();
  const record = useRecordText();
  const navigate = useNavigate();
  const analysis = useForgeStore((state) => state.analysis);
  const file = useForgeStore((state) => state.file);
  const error = useForgeStore((state) => state.error);
  const isBusy = useForgeStore((state) => state.isBusy);
  const selectProvider = useForgeStore((state) => state.selectProvider);
  const reset = useForgeStore((state) => state.reset);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  if (!analysis) return <Navigate to={PATCH_ROUTES.image} replace />;

  const warnings = Array.from(new Set([...analysis.summary.warnings, ...analysis.compatibility.warnings]));
  const compatibleCount = analysis.compatibility.candidates.filter(
    (candidate) => candidate.available && candidate.compatible,
  ).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("analyze.title")}</h1>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {file?.name ?? "image"} · {formatBytes(file?.size ?? analysis.summary.totalSize)} ·{" "}
            {analysis.summary.format} v{analysis.summary.headerVersion}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">
            {analysis.wasm.available ? t("analyze.wasm") : t("analyze.fallback")}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await reset();
              navigate(PATCH_ROUTES.image);
            }}
          >
            <RotateCcw />
            {t("analyze.newImage")}
          </Button>
        </div>
      </header>

      <ErrorPanel error={error} />

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-warning/30 bg-warning-muted px-4 py-3">
          <p className="text-xs font-medium text-foreground">{t("analyze.parserNotes")}</p>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((warning) => (
              <li key={warning} className="text-[11px] leading-4 text-muted-foreground">
                {record(warning)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {analysis.report.groups.map((group) => (
              <Card key={group.id} className={group.id === "image" ? "sm:col-span-2" : undefined}>
                <CardHeader>
                  <CardTitle>{record(group.title)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FieldList fields={group.fields} columns={group.id === "image" ? 2 : 1} />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setTechnicalOpen(true)}>
                {t("analyze.technical")}
              </Button>
              <DiagnosticsButton />
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              sha256 {analysis.sha256.slice(0, 16)}… · crc32 {analysis.crc32}
            </p>
          </div>
        </div>

        <aside className="order-first lg:order-last lg:sticky lg:top-20">
          <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
            <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">{t("analyze.methods")}</h2>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {t("analyze.methods.description")}
                </p>
              </div>
              <Badge variant={compatibleCount > 0 ? "success" : "warning"}>{compatibleCount}</Badge>
            </header>
            <ul className="space-y-3 p-3">
              {analysis.compatibility.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.providerId}
                  candidate={candidate}
                  busy={isBusy}
                  onSelect={async (providerId) => {
                    const plan = await selectProvider(providerId);
                    if (plan) navigate(PATCH_ROUTES.plan);
                  }}
                />
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <Dialog open={technicalOpen} onOpenChange={setTechnicalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("analyze.technical")}</DialogTitle>
            <DialogDescription>{t("analyze.technical.description")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldList fields={analysis.report.technical.fields} columns={1} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
