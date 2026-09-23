import { ArrowRight, ChevronRight, Download, FolderOpen, HardDrive, Layers, LoaderCircle, PackageOpen, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { SourcePanel } from "@/components/app/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const segments = path.split("/").filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("tool.unpack.title")}</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">{t("tool.unpack.description")}</p>
        {insideEntry === null ? null : (
          <p className="font-mono text-[11px] text-muted-foreground">
            {t("unpack.inside", { entry: insideEntry })}
          </p>
        )}
      </header>

      <ErrorPanel error={error} />

      {source === null ? (
        <ImagePicker
          showLimit={false}
          compact
          title={t("unpack.hint")}
          formats={t("dropzone.formats.unpack")}
          accept=".img,application/octet-stream"
          maxBytes={Number.MAX_SAFE_INTEGER}
          icon={HardDrive}
        />
      ) : isPackage ? (
        <section className="rounded-lg border border-border bg-surface p-4 shadow-subtle">
          <div className="flex items-start gap-3">
            <PackageOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight">{t("unpack.packageHint")}</h2>
              <Button variant="link" className="mt-2" onClick={() => navigate(EXTRACT_TOOL.path)}>
                {t(EXTRACT_TOOL.titleKey)}
                <ArrowRight />
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <SourcePanel source={source} />

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <main className="min-w-0">
              {view === null ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
                  {t("extract.reading")}
                </p>
              ) : view.kind === "sparse" ? (
                <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                  <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <HardDrive className="size-4 text-muted-foreground" aria-hidden />
                    <div>
                      <h2 className="text-sm font-semibold tracking-tight">sparse</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatBytes(view.outputBytes)}
                      </p>
                    </div>
                  </header>
                  <div className="space-y-4 p-4">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <Summary label={t("unpack.blockSize")} value={formatBytes(view.header.blockSize)} />
                      <Summary label={t("unpack.blocks")} value={String(view.header.totalBlocks)} />
                      <Summary label={t("unpack.chunks")} value={String(view.chunkCount)} />
                      <Summary label={t("unpack.output")} value={formatBytes(view.outputBytes)} />
                    </dl>
                    <Button
                      variant="primary"
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
                  </div>
                </section>
              ) : view.kind === "super" ? (
                <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                  <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <HardDrive className="size-4 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold tracking-tight">{t("unpack.partitions")}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("unpack.metadata", {
                          size: formatBytes(view.geometry.metadataMaxSize),
                          slots: String(view.geometry.metadataSlotCount),
                          block: formatBytes(view.geometry.logicalBlockSize),
                        })}
                      </p>
                    </div>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] table-fixed text-left text-[11px]">
                      <thead className="border-b border-border bg-surface-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium">{t("unpack.name")}</th>
                          <th className="w-28 px-2 py-2 text-right font-medium">{t("unpack.size")}</th>
                          <th className="w-32 px-2 py-2 font-medium">{t("unpack.group")}</th>
                          <th className="w-28 px-4 py-2 text-right font-medium" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {view.partitions.map((partition) => (
                          <tr key={partition.name} className="hover:bg-surface-muted/45">
                            <td className="min-w-0 px-4 py-2">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-mono">{partition.name}</span>
                                {partition.readOnly ? (
                                  <Badge variant="outline">{t("unpack.readonly")}</Badge>
                                ) : null}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                              {formatBytes(partition.sizeBytes)}
                            </td>
                            <td className="truncate px-2 py-2 text-muted-foreground">
                              {partition.group}
                            </td>
                            <td className="px-4 py-2 text-right">
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
                  </div>
                </section>
              ) : view.kind === "erofs" || view.kind === "ext4" ? (
                <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                  <header className="space-y-3 border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold tracking-tight">{t("unpack.browse")}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">{entries.length}</p>
                      </div>
                      <Button variant="ghost" size="sm" disabled={path === "/"} onClick={() => void browseFilesystem(parent)}>
                        <Undo2 />
                        <span className="hidden sm:inline">{t("unpack.up")}</span>
                      </Button>
                    </div>
                    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-[11px]" aria-label={t("unpack.browse")}>
                      <Button variant="ghost" size="sm" onClick={() => void browseFilesystem("/")}>
                        /
                      </Button>
                      {segments.map((segment, index) => {
                        const target = "/" + segments.slice(0, index + 1).join("/");
                        return (
                          <span key={target} className="flex shrink-0 items-center gap-1">
                            <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
                            <Button variant="ghost" size="sm" className="font-mono" onClick={() => void browseFilesystem(target)}>
                              {segment}
                            </Button>
                          </span>
                        );
                      })}
                    </nav>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[38rem] table-fixed text-left text-[11px]">
                      <thead className="border-b border-border bg-surface-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium">{t("unpack.name")}</th>
                          <th className="w-28 px-2 py-2 font-medium">{t("detect.content")}</th>
                          <th className="w-24 px-2 py-2 text-right font-medium">{t("unpack.size")}</th>
                          <th className="w-44 px-4 py-2 text-right font-medium">{t("detect.tools")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entries.map((entry) => {
                          const file = path === "/" ? "/" + entry.name : path + "/" + entry.name;
                          return (
                            <tr key={file} className="hover:bg-surface-muted/45">
                              <td className="min-w-0 px-4 py-2">
                                <button
                                  type="button"
                                  className="block max-w-full truncate font-mono text-left hover:text-primary"
                                  disabled={entry.fileType !== "directory"}
                                  onClick={() => void browseFilesystem(file)}
                                >
                                  {entry.name}
                                </button>
                              </td>
                              <td className="px-2 py-2">
                                <span className="flex flex-wrap gap-1">
                                  <Badge variant="outline">{entry.fileType}</Badge>
                                  {entry.dataLayout === "compressed" || entry.dataLayout === "compressed-compact" ? (
                                    <Badge variant="neutral">{t("unpack.compressedBadge")}</Badge>
                                  ) : null}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                                {entry.fileType === "directory" ? "" : formatBytes(entry.sizeBytes)}
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex justify-end gap-1">
                                  {entry.fileType === "directory" ? (
                                    <Button variant="ghost" size="sm" onClick={() => void browseFilesystem(file)}>
                                      <ChevronRight />
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={busy !== null}
                                        onClick={() => void handleErofsFile(file)}
                                      >
                                        {busy === file ? <LoaderCircle className="animate-spin" /> : null}
                                        {t("unpack.readFile")}
                                      </Button>
                                      {/* a zip inside an image is very often a boot animation: open it straight away */}
                                      {/\.zip$/i.test(entry.name) ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={busy !== null}
                                          onClick={async () => {
                                            setBusy(file);
                                            const opened = await openFilesystemFile(file);
                                            setBusy(null);
                                            if (opened) navigate("/tools/bootanimation");
                                          }}
                                        >
                                          <span className="hidden xl:inline">{t("animation.open")}</span>
                                          <FolderOpen className="xl:hidden" />
                                        </Button>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <section className="rounded-lg border border-border bg-surface p-4 shadow-subtle">
                  <h2 className="text-sm font-semibold tracking-tight">{t("unpack.incompatible")}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {view.kind === "unsupported" ? record(view.detected.label) : ""}
                  </p>
                </section>
              )}
            </main>

            <aside className="space-y-4">
              <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle lg:sticky lg:top-20">
                <header className="flex items-start gap-2 border-b border-border px-4 py-3">
                  <Layers className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight">{t("super.title")}</h2>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("super.hint")}</p>
                  </div>
                </header>
                <div className="space-y-3 p-3">
                  {imageArtifacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("super.none")}</p>
                  ) : (
                    <>
                      <ul className="divide-y divide-border">
                        {imageArtifacts.map((artifact) => (
                          <li key={artifact.id} className="flex items-center gap-2 py-2 first:pt-0">
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
                      <div className="grid grid-cols-[1fr_1fr] gap-2 text-[11px] text-muted-foreground">
                        <label className="space-y-1">
                          {t("super.deviceSize")}
                          <input
                            aria-label={t("super.deviceSize")}
                            className="h-9 w-full rounded-md border border-border bg-surface px-2 font-mono text-xs"
                            type="number"
                            min={1}
                            placeholder={t("super.auto")}
                            value={deviceSize}
                            onChange={(event) => setDeviceSize(event.target.value)}
                          />
                        </label>
                        <label className="space-y-1">
                          {t("super.alignment")}
                          <select
                            aria-label={t("super.alignment")}
                            className="h-9 w-full rounded-md border border-border bg-surface px-2 text-xs"
                            value={alignment}
                            onChange={(event) => setAlignment(Number(event.target.value))}
                          >
                            <option value={1024 * 1024}>{t("super.alignment.mib")}</option>
                            <option value={4096}>{t("super.alignment.block")}</option>
                          </select>
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
                        className="w-full"
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
                    </>
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Download className="size-4 text-muted-foreground" aria-hidden />
                  <h2 className="text-sm font-semibold tracking-tight">{t("extract.extracted")}</h2>
                </header>
                {artifacts.length === 0 ? (
                  <p className="px-4 py-5 text-xs text-muted-foreground">{t("extract.empty")}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {artifacts.map((artifact) => (
                      <li key={artifact.id} className="space-y-2 px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[11px]">{artifact.name}</p>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {formatBytes(artifact.sizeBytes)}
                            {artifact.params?.streamed === "true" ? " · " + t("artifact.streamed") : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
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
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
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
