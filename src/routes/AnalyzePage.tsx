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
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-subtle sm:flex-row sm:items-center",
        !selectable && "opacity-80",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
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
        <p className="text-xs text-muted-foreground">{record(candidate.description)}</p>
        {candidate.reasons.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {reasonMessages(t, candidate).map((reason) => (
              <li key={reason} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {candidate.warnings.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {candidate.warnings.map((warning) => (
              <li key={warning.code} className="flex items-start gap-1.5 text-[11px] text-warning">
                <ShieldAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>{warningMessage(t, warning)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={!selectable}
        onClick={() => onSelect(candidate.providerId)}
        className="shrink-0"
      >
        {selectable ? t("analyze.method.select") : t("analyze.method.unavailable")}
        <ArrowRight />
      </Button>
    </div>
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

  if (!analysis) return <Navigate to="/" replace />;

  const warnings = Array.from(new Set([...analysis.summary.warnings, ...analysis.compatibility.warnings]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">{t("analyze.title")}</h1>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {file?.name ?? "image"} · {formatBytes(file?.size ?? analysis.summary.totalSize)} ·{" "}
            {analysis.summary.format} v{analysis.summary.headerVersion}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">
            {analysis.wasm.available ? t("analyze.wasm") : t("analyze.fallback")}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await reset();
              navigate("/");
            }}
          >
            <RotateCcw />
            {t("analyze.newImage")}
          </Button>
        </div>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-2">
        {analysis.report.groups.map((group) => (
          <Card key={group.id} className={group.id === "image" ? "lg:col-span-2" : undefined}>
            <CardHeader>
              <CardTitle>{record(group.title)}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldList fields={group.fields} columns={group.id === "image" ? 2 : 1} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
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

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{t("analyze.methods")}</h2>
          <p className="text-xs text-muted-foreground">{t("analyze.methods.description")}</p>
        </div>
        <div className="space-y-2">
          {analysis.compatibility.candidates.map((candidate) => (
            <CandidateCard
              key={candidate.providerId}
              candidate={candidate}
              busy={isBusy}
              onSelect={async (providerId) => {
                const plan = await selectProvider(providerId);
                if (plan) navigate("/patch");
              }}
            />
          ))}
        </div>
      </section>

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
