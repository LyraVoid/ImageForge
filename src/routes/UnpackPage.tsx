import { ArrowRight, ChevronRight, Download, FolderOpen, HardDrive, Layers, LoaderCircle, PackageOpen, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { SourcePanel } from "@/components/app/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EXTRACT_TOOL, PATCH_ROUTES } from "@/app/tools";
import { useRecordText, useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { downloadBlob } from "@/lib/download";
import { useForgeStore } from "@/stores/forge-store";

/**
 * The unpack tool: sparse images become raw images, super images give up their logical partitions,
 * and an erofs image can be walked and its flat files taken out. Everything reads in ranges, so a
 * multi gigabyte image is browsed without being loaded.
 */
export function UnpackPage() {
  const t = useT();
  const navigate = useNavigate();
  const source = useForgeStore((state) => state.source);
  const stage = useForgeStore((state) => state.stage);
  const error = useForgeStore((state) => state.error);
  const view = useForgeStore((state) => state.partitionView);
  const insideEntry = useForgeStore((state) => state.insideEntry);
  const listing = useForgeStore((state) => state.filesystemListing);
  const artifacts = useForgeStore((state) => state.artifacts);
  const inspectPartition = useForgeStore((state) => state.inspectPartition);
  const unpackSparse = useForgeStore((state) => state.unpackSparse);
  const extractLogicalPartition = useForgeStore((state) => state.extractLogicalPartition);
  const browseFilesystem = useForgeStore((state) => state.browseFilesystem);
  const extractFilesystemFile = useForgeStore((state) => state.extractFilesystemFile);
  const artifactBlob = useForgeStore((state) => state.artifactBlob);
  const packSparse = useForgeStore((state) => state.packSparse);
  const packSuper = useForgeStore((state) => state.packSuper);
  const [selected, setSelected] = useState<string[]>([]);
  const [deviceSize, setDeviceSize] = useState("");
  const [alignment, setAlignment] = useState(1024 * 1024);
  const [packing, setPacking] = useState(false);
  const [metadataOnly, setMetadataOnly] = useState(false);
  const imageArtifacts = artifacts.filter((artifact) => /\.img$/i.test(artifact.name));
  const sendToPatcher = useForgeStore((state) => state.sendToPatcher);
  const record = useRecordText();
  const openArtifactAsSource = useForgeStore((state) => state.openArtifactAsSource);
  const openFilesystemFile = useForgeStore((state) => state.openFilesystemFile);
  const [busy, setBusy] = useState<string | null>(null);

  const isPackage = source !== null && source.kind === "package";

  useEffect(() => {
    if (source && !isPackage && stage !== "analyzing" && view === null) void inspectPartition();
  }, [source, isPackage, stage, view, inspectPartition, insideEntry]);

  const handleDownload = async (artifactId: string, name: string) => {
    const blob = await artifactBlob(artifactId);
    if (blob) downloadBlob(blob, name);
  };

  const handleErofsFile = async (path: string) => {
    setBusy(path);
    const bytes = await extractFilesystemFile(path);
    setBusy(null);
    if (bytes) download(path.split("/").pop() ?? "file", bytes);
  };

  const entries = listing?.entries ?? [];
  const path = listing?.path ?? "/";
  const parent = path === "/" ? "/" : path.replace(/\/[^/]+$/, "") || "/";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">{t("tool.unpack.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("tool.unpack.description")}</p>
        {insideEntry === null ? null : (
          <p className="font-mono text-[11px] text-muted-foreground">
            {t("unpack.inside", { entry: insideEntry })}
          </p>
        )}
      </div>

      <ErrorPanel error={error} />

      {source === null ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("unpack.hint")}</p>
          <ImagePicker showLimit={false} />
        </div>
      ) : isPackage ? (
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <PackageOpen className="size-3.5 text-muted-foreground" aria-hidden />
            <div>
              <CardTitle>{t("unpack.packageHint")}</CardTitle>
              <CardDescription>
                <Button variant="link" onClick={() => navigate(EXTRACT_TOOL.path)}>
                  {t(EXTRACT_TOOL.titleKey)}
                  <ArrowRight />
                </Button>
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <>
          <SourcePanel source={source} />

          {view === null ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
              {t("extract.reading")}
            </p>
          ) : view.kind === "sparse" ? (
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <HardDrive className="size-3.5 text-muted-foreground" aria-hidden />
                <CardTitle>sparse</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                  <Summary label={t("unpack.blockSize")} value={formatBytes(view.header.blockSize)} />
                  <Summary label={t("unpack.blocks")} value={String(view.header.totalBlocks)} />
                  <Summary label={t("unpack.chunks")} value={String(view.chunkCount)} />
                  <Summary label={t("unpack.output")} value={formatBytes(view.outputBytes)} />
                </dl>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy("sparse");
                    await unpackSparse();
                    setBusy(null);
                  }}
                >
                  {busy === "sparse" ? <LoaderCircle className="animate-spin" /> : null}
                  {t("unpack.unpack")}
                </Button>
              </CardContent>
            </Card>
          ) : view.kind === "super" ? (
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <HardDrive className="size-3.5 text-muted-foreground" aria-hidden />
                <div>
                  <CardTitle>{t("unpack.partitions")}</CardTitle>
                  <CardDescription>
                    {t("unpack.metadata", {
                      size: formatBytes(view.geometry.metadataMaxSize),
                      slots: String(view.geometry.metadataSlotCount),
                      block: formatBytes(view.geometry.logicalBlockSize),
                    })}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <table className="w-full text-[11px]">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium">{t("unpack.name")}</th>
                      <th className="text-right font-medium">{t("unpack.size")}</th>
                      <th className="text-left font-medium">{t("unpack.group")}</th>
                      <th className="text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {view.partitions.map((partition) => (
                      <tr key={partition.name} className="border-t border-border">
                        <td className="py-1.5 font-mono">
                          {partition.name}
                          {partition.readOnly ? (
                            <Badge variant="outline" className="ml-2">
                              {t("unpack.readonly")}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground">
                          {formatBytes(partition.sizeBytes)}
                        </td>
                        <td className="py-1.5 text-muted-foreground">{partition.group}</td>
                        <td className="py-1.5 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy !== null}
                            onClick={async () => {
                              setBusy(partition.name);
                              await extractLogicalPartition(partition.name);
                              setBusy(null);
                            }}
                          >
                            {busy === partition.name ? <LoaderCircle className="animate-spin" /> : null}
                            {t("extract.extract")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : view.kind === "erofs" || view.kind === "ext4" ? (
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <CardTitle>{t("unpack.browse")}</CardTitle>
                  <CardDescription className="truncate font-mono">{path}</CardDescription>
                </div>
                <Button variant="ghost" size="sm" disabled={path === "/"} onClick={() => void browseFilesystem(parent)}>
                  <Undo2 />
                  {t("unpack.up")}
                </Button>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {entries.map((entry) => (
                    <li key={path + "/" + entry.name} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{entry.name}</span>
                      <Badge variant="outline">{entry.fileType}</Badge>
                      {entry.dataLayout === "compressed" || entry.dataLayout === "compressed-compact" ? (
                        <Badge variant="neutral">{t("unpack.compressedBadge")}</Badge>
                      ) : null}
                      <span className="w-20 text-right font-mono text-[11px] text-muted-foreground">
                        {entry.fileType === "directory" ? "" : formatBytes(entry.sizeBytes)}
                      </span>
                      {entry.fileType === "directory" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void browseFilesystem(path === "/" ? "/" + entry.name : path + "/" + entry.name)
                          }
                        >
                          <ChevronRight />
                        </Button>
                      ) : (
                        <>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void handleErofsFile(path === "/" ? "/" + entry.name : path + "/" + entry.name)}
                        >
                          {busy !== null ? <LoaderCircle className="animate-spin" /> : null}
                          {t("unpack.readFile")}
                        </Button>
                        {/* a zip inside an image is very often a boot animation: open it straight away */}
                        {/\.zip$/i.test(entry.name) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy !== null}
                            onClick={async () => {
                              const file = path === "/" ? "/" + entry.name : path + "/" + entry.name;
                              setBusy(file);
                              const opened = await openFilesystemFile(file);
                              setBusy(null);
                              if (opened) navigate("/tools/bootanimation");
                            }}
                          >
                            {t("animation.open")}
                          </Button>
                        ) : null}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t("unpack.incompatible")}</CardTitle>
                <CardDescription>
                  {view.kind === "unsupported" ? record(view.detected.label) : ""}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Layers className="size-3.5 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <CardTitle>{t("super.title")}</CardTitle>
                <CardDescription>{t("super.hint")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {imageArtifacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("super.none")}</p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {imageArtifacts.map((artifact) => (
                      <li key={artifact.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={artifact.name}
                          checked={selected.includes(artifact.id)}
                          onChange={() =>
                            setSelected((current) =>
                              current.includes(artifact.id)
                                ? current.filter((id) => id !== artifact.id)
                                : [...current, artifact.id],
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{artifact.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatBytes(artifact.sizeBytes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {t("super.deviceSize")}
                    <input
                      aria-label={t("super.deviceSize")}
                      className="w-24 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                      type="number"
                      min={1}
                      placeholder={t("super.auto")}
                      value={deviceSize}
                      onChange={(event) => setDeviceSize(event.target.value)}
                    />
                    {t("super.alignment")}
                    <select
                      aria-label={t("super.alignment")}
                      className="rounded border border-border bg-surface px-2 py-1 text-[11px]"
                      value={alignment}
                      onChange={(event) => setAlignment(Number(event.target.value))}
                    >
                      <option value={1024 * 1024}>{t("super.alignment.mib")}</option>
                      <option value={4096}>{t("super.alignment.block")}</option>
                    </select>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        aria-label={t("super.metadataOnly")}
                        checked={metadataOnly}
                        onChange={() => setMetadataOnly(!metadataOnly)}
                      />
                      {t("super.metadataOnly")}
                    </label>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={selected.length === 0 || packing}
                      onClick={async () => {
                        setPacking(true);
                        await packSuper({
                          artifactIds: selected,
                          deviceSize: Number(deviceSize) > 0 ? Number(deviceSize) : undefined,
                          alignment,
                          metadataOnly,
                        });
                        setPacking(false);
                      }}
                    >
                      {packing ? <LoaderCircle className="animate-spin" /> : null}
                      {t("super.pack")}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Download className="size-3.5 text-muted-foreground" aria-hidden />
              <CardTitle>{t("extract.extracted")}</CardTitle>
            </CardHeader>
            <CardContent>
              {artifacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("extract.empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {artifacts.map((artifact) => (
                    <li
                      key={artifact.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{artifact.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatBytes(artifact.sizeBytes)}
                      </span>
                      {artifact.params?.streamed === "true" ? (
                        <span className="text-[11px] text-muted-foreground">{t("artifact.streamed")}</span>
                      ) : null}
                      {artifact.kind === "boot-container" ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={async () => {
                            const analysis = await sendToPatcher(artifact.id);
                            if (analysis) navigate(PATCH_ROUTES.analyze);
                          }}
                        >
                          {t("extract.useInPatcher")}
                          <ArrowRight />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDownload(artifact.id, artifact.name)}
                      >
                        <Download />
                        {t("extract.download")}
                      </Button>
                      {artifact.name.endsWith(".img") ? (
                        <Button variant="ghost" size="sm" onClick={() => void packSparse(artifact.id)}>
                          {t("sparse.pack")}
                        </Button>
                      ) : null}
                      {/\.zip$/i.test(artifact.name) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await openArtifactAsSource(artifact.id);
                            navigate("/tools/bootanimation");
                          }}
                        >
                          {t("animation.open")}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function download(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}