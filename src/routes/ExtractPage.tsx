import { ArrowRight, Download, FileDown, FolderOpen, LoaderCircle, PackageOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { SourcePanel } from "@/components/app/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PATCH_ROUTES, UNPACK_TOOL } from "@/app/tools";
import { kindLabel } from "@/core/workspace";
import { PackageError } from "@/core/errors";
import { useRecordText, useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { downloadBlob } from "@/lib/download";
import { useForgeStore } from "@/stores/forge-store";

/**
 * The extract tool: it lists what a package holds (zip entries or OTA payload partitions), takes one
 * entry out at a time and keeps it in the workspace. Extraction never guesses: what an entry *is* is
 * detected from the extracted bytes, and the listing's kind is only the hint the format itself gave.
 */
export function ExtractPage() {
  const t = useT();
  const record = useRecordText();
  const navigate = useNavigate();
  const source = useForgeStore((state) => state.source);
  const stage = useForgeStore((state) => state.stage);
  const error = useForgeStore((state) => state.error);
  const listing = useForgeStore((state) => state.packageListing);
  const artifacts = useForgeStore((state) => state.artifacts);
  const loadPackage = useForgeStore((state) => state.loadPackage);
  const extractEntry = useForgeStore((state) => state.extractEntry);
  const extractEntries = useForgeStore((state) => state.extractEntries);
  const [selected, setSelected] = useState<string[]>([]);
  const [extractingMany, setExtractingMany] = useState(false);
  const sendToPatcher = useForgeStore((state) => state.sendToPatcher);
  const openInside = useForgeStore((state) => state.openInside);
  const artifactBlob = useForgeStore((state) => state.artifactBlob);
  const packSparse = useForgeStore((state) => state.packSparse);
  const [busyEntry, setBusyEntry] = useState<string | null>(null);

  const isPackage = source !== null && source.kind === "package";

  useEffect(() => {
    if (isPackage && listing === null && stage !== "analyzing") void loadPackage();
  }, [isPackage, listing, loadPackage, stage]);

  const handleExtract = async (entryId: string) => {
    setBusyEntry(entryId);
    await extractEntry(entryId);
    setBusyEntry(null);
  };

  const handleDownload = async (artifactId: string, name: string) => {
    const blob = await artifactBlob(artifactId);
    if (blob) downloadBlob(blob, name);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("tool.extract.title")}</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">{t("tool.extract.description")}</p>
        </div>
        {listing ? <Badge variant="outline">{listing.entries.length}</Badge> : null}
      </header>

      <ErrorPanel error={error} />

      {!isPackage ? (
        <ImagePicker
          showLimit={false}
          compact
          title={t("extract.openHint")}
          formats={t("dropzone.formats.extract")}
          accept=".zip,.bin,.img,application/zip,application/octet-stream"
          maxBytes={Number.MAX_SAFE_INTEGER}
          icon={PackageOpen}
        />
      ) : (
        <>
          <SourcePanel source={source} />

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
              <header className="space-y-3 border-b border-border px-4 py-3">
                <div className="flex items-start gap-3">
                  <PackageOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold tracking-tight">{t("extract.entries")}</h2>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("extract.hint")}</p>
                  </div>
                </div>
                {listing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={listing.entries.length === 0}
                      onClick={() =>
                        setSelected(
                          selected.length === listing.entries.length
                            ? []
                            : listing.entries.map((entry) => entry.id),
                        )
                      }
                    >
                      {selected.length === listing.entries.length && selected.length > 0
                        ? t("extract.selectNone")
                        : t("extract.selectAll")}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={selected.length === 0 || extractingMany}
                      onClick={async () => {
                        setExtractingMany(true);
                        await extractEntries(selected);
                        setExtractingMany(false);
                        setSelected([]);
                      }}
                    >
                      {extractingMany ? <LoaderCircle className="animate-spin" /> : null}
                      {t("extract.extractSelected", { count: String(selected.length) })}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      {t("extract.selected", { count: String(selected.length) })}
                    </span>
                  </div>
                ) : null}
              </header>

              {listing === null ? (
                <p className="flex items-center gap-2 px-4 py-6 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
                  {t("extract.reading")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-left text-[11px]">
                    <thead className="border-b border-border bg-surface-muted/60 text-muted-foreground">
                      <tr>
                        <th className="w-9 px-3 py-2 font-medium">
                          <span className="sr-only">{t("extract.selected", { count: "" }).trim()}</span>
                        </th>
                        <th className="px-2 py-2 font-medium">{t("unpack.name")}</th>
                        <th className="w-16 px-2 py-2 text-right font-medium sm:w-24">{t("unpack.size")}</th>
                        <th className="hidden w-36 px-2 py-2 font-medium md:table-cell">{t("detect.content")}</th>
                        <th className="w-24 px-3 py-2 text-right font-medium sm:w-[12rem]">{t("detect.tools")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {listing.entries.map((entry) => (
                        <tr key={entry.id} className="align-middle hover:bg-surface-muted/45">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={entry.name}
                              checked={selected.includes(entry.id)}
                              onChange={() =>
                                setSelected((current) =>
                                  current.includes(entry.id)
                                    ? current.filter((id) => id !== entry.id)
                                    : [...current, entry.id],
                                )
                              }
                            />
                          </td>
                          <td className="min-w-0 px-2 py-2">
                            <span className="block truncate font-mono text-foreground">{entry.name}</span>
                            {entry.container === null ? null : (
                              <span className="mt-0.5 block truncate text-muted-foreground">
                                {t("extract.from", { container: entry.container })}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                            {formatBytes(entry.sizeBytes)}
                          </td>
                          <td className="hidden px-2 py-2 md:table-cell">
                            {entry.suggestedKind ? (
                              <Badge variant="outline">{record(kindLabel(entry.suggestedKind))}</Badge>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {entry.requiresSource ? (
                              <p className="text-right leading-4 text-muted-foreground">{t("extract.needsSource")}</p>
                            ) : (
                              <div className="flex flex-wrap justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    // read it where it lies: a payload partition becomes a range source
                                    openInside(entry.id);
                                    navigate(UNPACK_TOOL.path);
                                  }}
                                >
                                  <FolderOpen />
                                  <span className="hidden sm:inline">{t("extract.browse")}</span>
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={busyEntry !== null}
                                  onClick={() => void handleExtract(entry.id)}
                                >
                                  {busyEntry === entry.id ? <LoaderCircle className="animate-spin" /> : null}
                                  {t("extract.extract")}
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-subtle lg:sticky lg:top-20">
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <FileDown className="size-4 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold tracking-tight">{t("extract.extracted")}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("settings.artifacts.count", { count: String(artifacts.length) })}
                  </p>
                </div>
              </header>
              {artifacts.length === 0 ? (
                <p className="px-4 py-6 text-xs text-muted-foreground">{t("extract.empty")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {artifacts.map((artifact) => (
                    <li key={artifact.id} className="space-y-2 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] text-foreground">{artifact.name}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{formatBytes(artifact.sizeBytes)}</span>
                          <Badge variant="outline">{record(kindLabel(artifact.kind))}</Badge>
                          {artifact.params?.streamed === "true" ? <span>{t("artifact.streamed")}</span> : null}
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
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/** Kept next to the page so the error type is documented where the tool is. */
export const EXTRACT_TOOL_ERROR = PackageError;
