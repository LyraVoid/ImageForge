import { ArrowRight, FileSearch, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { DiagnosticsButton } from "@/components/app/diagnostics-button";
import { ErrorPanel } from "@/components/app/error-panel";
import { FieldList } from "@/components/app/field-list";
import { ImagePicker } from "@/components/app/image-picker";
import { SourcePanel } from "@/components/app/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UNPACK_TOOL } from "@/app/tools";
import { reasonMessages, warningMessage } from "@/i18n/engine-keys";
import { useRecordText, useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

/**
 * The inspect tool: everything ImageForge knows about an opened file, and nothing else. It shares the
 * workspace and the analysis the patcher uses — opening a boot image here analyses it exactly as the
 * patcher would — but it offers no action beyond looking, and it points at the tools that do act.
 */
export function InspectPage() {
  const t = useT();
  const record = useRecordText();
  const navigate = useNavigate();
  const source = useForgeStore((state) => state.source);
  const stage = useForgeStore((state) => state.stage);
  const analysis = useForgeStore((state) => state.analysis);
  const error = useForgeStore((state) => state.error);
  const view = useForgeStore((state) => state.partitionView);
  const inspectPartition = useForgeStore((state) => state.inspectPartition);
  const loadPackage = useForgeStore((state) => state.loadPackage);

  const isBoot = source?.kind === "boot-container";
  const isPackage = source?.kind === "package";

  useEffect(() => {
    if (!source || stage === "analyzing") return;
    if (isBoot) return; // the patcher's analysis already ran when the file was opened
    if (isPackage) {
      void loadPackage();
      return;
    }
    if (view === null) void inspectPartition();
  }, [source, stage, isBoot, isPackage, view, inspectPartition, loadPackage]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-base font-semibold tracking-tight">{t("tool.inspect.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("tool.inspect.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          {analysis ? (
            <Badge variant="neutral">
              {analysis.wasm.available ? t("analyze.wasm") : t("analyze.fallback")}
            </Badge>
          ) : null}
          <DiagnosticsButton />
        </div>
      </div>

      <ErrorPanel error={error} />

      {source === null ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("inspect.hint")}</p>
          <ImagePicker showLimit={false} />
        </div>
      ) : (
        <>
          <SourcePanel source={source} />

          {analysis ? (
            <>
              {analysis.summary.warnings.length > 0 ? (
                <div className="rounded-lg border border-warning/30 bg-warning-muted px-4 py-3">
                  <p className="text-xs font-medium text-foreground">{t("analyze.parserNotes")}</p>
                  <ul className="mt-1.5 space-y-1">
                    {analysis.summary.warnings.map((warning) => (
                      <li key={warning} className="text-[11px] leading-4 text-muted-foreground">
                        {record(warning)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

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

              <Card>
                <CardHeader>
                  <CardTitle>{t("inspect.digests")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">
                    sha256 {analysis.sha256}
                    <br />
                    crc32 {analysis.crc32}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("inspect.methods")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {analysis.compatibility.candidates.map((candidate) => (
                    <div key={candidate.providerId} className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-foreground">{candidate.name}</span>
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
                      <span className="text-[11px] text-muted-foreground">
                        {reasonMessages(t, candidate).join(" ")}
                      </span>
                      {candidate.warnings.map((warning) => (
                        <span key={warning.code} className="flex items-center gap-1 text-[11px] text-warning">
                          <ShieldAlert className="size-3" aria-hidden />
                          {warningMessage(t, warning)}
                        </span>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          ) : null}

          {view !== null && view.kind !== "unsupported" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("inspect.container")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {view.kind === "sparse" ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                    <Detail label={t("unpack.blockSize")} value={formatBytes(view.header.blockSize)} />
                    <Detail label={t("unpack.blocks")} value={String(view.header.totalBlocks)} />
                    <Detail label={t("unpack.chunks")} value={String(view.chunkCount)} />
                    <Detail label={t("unpack.output")} value={formatBytes(view.outputBytes)} />
                  </dl>
                ) : view.kind === "super" ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                    <Detail label={t("unpack.metadata", { size: formatBytes(view.geometry.metadataMaxSize), slots: String(view.geometry.metadataSlotCount), block: formatBytes(view.geometry.logicalBlockSize) })} value="" />
                    <Detail label={t("unpack.partitions")} value={String(view.partitions.length)} />
                  </dl>
                ) : view.kind === "erofs" ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                    <Detail label="erofs" value={formatBytes(view.superblock.blockSize)} />
                    <Detail label="volume" value={view.superblock.volumeName} />
                    <Detail label="inodes" value={String(view.superblock.inos)} />
                    <Detail label="features" value={"0x" + view.superblock.featureIncompat.toString(16)} />
                  </dl>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                    <Detail label="ext4" value={formatBytes(view.superblock.blockSize)} />
                    <Detail label="volume" value={view.superblock.volumeName} />
                    <Detail label="inode size" value={String(view.superblock.inodeSize)} />
                    <Detail label="features" value={"0x" + view.superblock.featureIncompat.toString(16)} />
                  </dl>
                )}
                <Button variant="secondary" size="sm" onClick={() => navigate(UNPACK_TOOL.path)}>
                  <FileSearch />
                  {t("inspect.browse")}
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {isPackage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("inspect.package")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" size="sm" onClick={() => navigate("/tools/extract")}>
                  {t("tool.extract.title")}
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="size-3 shrink-0" aria-hidden />
            {t("inspect.readOnly")}
          </p>
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className="shrink-0 font-mono">{value}</dd>
    </div>
  );
}
