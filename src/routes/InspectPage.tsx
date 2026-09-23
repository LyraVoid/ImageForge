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
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("tool.inspect.title")}</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">{t("tool.inspect.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">
            <Info className="size-3" aria-hidden />
            {t("unpack.readonly")}
          </Badge>
          {analysis ? (
            <Badge variant="outline">
              {analysis.wasm.available ? t("analyze.wasm") : t("analyze.fallback")}
            </Badge>
          ) : null}
          <DiagnosticsButton />
        </div>
      </header>

      <ErrorPanel error={error} />

      {source === null ? (
        <ImagePicker
          showLimit={false}
          continueToPatcher={false}
          compact
          title={t("inspect.hint")}
          formats={t("dropzone.formats.inspect")}
          accept=""
          maxBytes={Number.MAX_SAFE_INTEGER}
          icon={FileSearch}
        />
      ) : (
        <>
          <SourcePanel source={source} />

          {isPackage ? (
            <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
              <header className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold tracking-tight">{t("inspect.package")}</h2>
              </header>
              <div className="p-4">
                <Button variant="primary" onClick={() => navigate("/tools/extract")}>
                  {t("tool.extract.title")}
                  <ArrowRight />
                </Button>
              </div>
            </section>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
              <main className="min-w-0 space-y-5">
                {analysis?.summary.warnings.length ? (
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

                {analysis ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      {analysis.report.groups.map((group) => (
                        <Card key={group.id} className={group.id === "image" ? "md:col-span-2" : undefined}>
                          <CardHeader>
                            <CardTitle>{record(group.title)}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <FieldList fields={group.fields} columns={group.id === "image" ? 2 : 1} />
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {analysis.report.technical.fields.length > 0 ? (
                      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                        <header className="border-b border-border px-4 py-3">
                          <h2 className="text-sm font-semibold tracking-tight">{t("analyze.technical")}</h2>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("analyze.technical.description")}
                          </p>
                        </header>
                        <div className="p-4">
                          <FieldList fields={analysis.report.technical.fields} columns={2} />
                        </div>
                      </section>
                    ) : null}

                    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                      <header className="border-b border-border px-4 py-3">
                        <h2 className="text-sm font-semibold tracking-tight">{t("inspect.digests")}</h2>
                      </header>
                      <dl className="grid gap-3 p-4 sm:grid-cols-2">
                        <div className="min-w-0 rounded-md bg-surface-muted px-3 py-2">
                          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">sha256</dt>
                          <dd className="mt-1 break-all font-mono text-[11px]">{analysis.sha256}</dd>
                        </div>
                        <div className="min-w-0 rounded-md bg-surface-muted px-3 py-2">
                          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">crc32</dt>
                          <dd className="mt-1 break-all font-mono text-[11px]">{analysis.crc32}</dd>
                        </div>
                      </dl>
                    </section>
                  </>
                ) : null}
              </main>

              <aside className="space-y-4 lg:sticky lg:top-20">
                {analysis ? (
                  <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                    <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                      <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                      <div>
                        <h2 className="text-sm font-semibold tracking-tight">{t("inspect.methods")}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {analysis.compatibility.candidates.length}
                        </p>
                      </div>
                    </header>
                    <ul className="divide-y divide-border">
                      {analysis.compatibility.candidates.map((candidate) => (
                        <li key={candidate.providerId} className="space-y-1.5 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-foreground">{candidate.name}</span>
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
                          {reasonMessages(t, candidate).length > 0 ? (
                            <p className="text-[11px] leading-4 text-muted-foreground">
                              {reasonMessages(t, candidate).join(" ")}
                            </p>
                          ) : null}
                          {candidate.warnings.map((warning) => (
                            <p key={warning.code} className="flex items-start gap-1.5 text-[11px] leading-4 text-warning">
                              <ShieldAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                              {warningMessage(t, warning)}
                            </p>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {view !== null && view.kind !== "unsupported" ? (
                  <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                    <header className="border-b border-border px-4 py-3">
                      <h2 className="text-sm font-semibold tracking-tight">{t("inspect.container")}</h2>
                    </header>
                    <div className="space-y-3 p-4">
                      {view.kind === "sparse" ? (
                        <dl className="grid grid-cols-1 gap-2 text-[11px]">
                          <Detail label={t("unpack.blockSize")} value={formatBytes(view.header.blockSize)} />
                          <Detail label={t("unpack.blocks")} value={String(view.header.totalBlocks)} />
                          <Detail label={t("unpack.chunks")} value={String(view.chunkCount)} />
                          <Detail label={t("unpack.output")} value={formatBytes(view.outputBytes)} />
                        </dl>
                      ) : view.kind === "super" ? (
                        <dl className="grid grid-cols-1 gap-2 text-[11px]">
                          <Detail
                            label={t("unpack.metadata", {
                              size: formatBytes(view.geometry.metadataMaxSize),
                              slots: String(view.geometry.metadataSlotCount),
                              block: formatBytes(view.geometry.logicalBlockSize),
                            })}
                            value=""
                          />
                          <Detail label={t("unpack.partitions")} value={String(view.partitions.length)} />
                        </dl>
                      ) : view.kind === "erofs" ? (
                        <dl className="grid grid-cols-1 gap-2 text-[11px]">
                          <Detail label="erofs" value={formatBytes(view.superblock.blockSize)} />
                          <Detail label="volume" value={view.superblock.volumeName} />
                          <Detail label="inodes" value={String(view.superblock.inos)} />
                          <Detail label="features" value={"0x" + view.superblock.featureIncompat.toString(16)} />
                        </dl>
                      ) : (
                        <dl className="grid grid-cols-1 gap-2 text-[11px]">
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
                    </div>
                  </section>
                ) : null}

                <p className="flex items-start gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                  <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {t("inspect.readOnly")}
                </p>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className="shrink-0 text-right font-mono">{value}</dd>
    </div>
  );
}
