import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TOOLS, toolById } from "@/app/tools";
import { CONTAINER_LABEL, CONTENT_LABEL, matchTools } from "@/core/workspace";
import type { WorkspaceSourceRecord } from "@/workers/protocol";
import { toolReasonMessage } from "@/i18n/engine-keys";
import { useRecordText, useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";

/**
 * What the user just opened, and what this site can do with it. The verdicts come from the workspace
 * matcher, not from this page, so a tool added to the registry appears here by itself.
 */
export function SourcePanel({ source }: { source: WorkspaceSourceRecord }) {
  const t = useT();
  const record = useRecordText();
  const capable = matchTools(source.kind, TOOLS).filter((match) => match.compatible);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">{t("detect.title")}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {source.name} · {formatBytes(source.sizeBytes)}
        </p>
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div className="min-w-0 space-y-0.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("detect.container")}
          </dt>
          <dd className="text-xs text-foreground">{record(CONTAINER_LABEL[source.detected.container])}</dd>
        </div>
        <div className="min-w-0 space-y-0.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("detect.content")}
          </dt>
          <dd className="text-xs text-foreground">
            {record(CONTENT_LABEL[source.detected.content])}
            {source.detected.headerVersion === undefined ? "" : " · v" + source.detected.headerVersion}
          </dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("detect.tools")}
        </p>
        {capable.length === 0 ? (
          <p className="text-[11px] leading-4 text-muted-foreground">{t("detect.none")}</p>
        ) : (
          <ul className="space-y-1">
            {capable.map((match) => {
              const tool = toolById(match.tool.id);
              return (
                <li key={match.tool.id} className="flex flex-wrap items-center gap-2">
                  <Info className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-xs text-foreground">
                    {tool ? t(tool.titleKey) : match.tool.id}
                  </span>
                  <Badge variant={match.implemented ? "success" : "neutral"}>
                    {match.implemented ? t("tools.badge.available") : t("tools.badge.planned")}
                  </Badge>
                  {match.reasons
                    .filter((reason) => reason.code === "planned")
                    .map((reason) => (
                      <span key={reason.code} className="text-[11px] text-muted-foreground">
                        {toolReasonMessage(t, reason)}
                      </span>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
