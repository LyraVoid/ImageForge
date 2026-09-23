import { ArrowRight, Download, FileDown, FolderOpen, LoaderCircle, PackageOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { SourcePanel } from "@/components/app/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const sendToPatcher = useForgeStore((state) => state.sendToPatcher);
  const openInside = useForgeStore((state) => state.openInside);
  const artifactBlob = useForgeStore((state) => state.artifactBlob);
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
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">{t("tool.extract.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("tool.extract.description")}</p>
      </div>

      <ErrorPanel error={error} />

      {!isPackage ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("extract.openHint")}</p>
          <ImagePicker showLimit={false} />
        </div>
      ) : (
        <>
          <SourcePanel source={source} />

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <PackageOpen className="size-3.5 text-muted-foreground" aria-hidden />
              <div>
                <CardTitle>{t("extract.entries")}</CardTitle>
                <CardDescription>{t("extract.hint")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {listing === null ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
                  {t("extract.reading")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {listing.entries.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                        {entry.name}
                        {entry.container === null ? null : (
                          <span className="ml-2 text-muted-foreground">
                            {t("extract.from", { container: entry.container })}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatBytes(entry.sizeBytes)}
                      </span>
                      {entry.suggestedKind ? (
                        <Badge variant="outline">{record(kindLabel(entry.suggestedKind))}</Badge>
                      ) : null}
                      {entry.requiresSource ? (
                        <span className="text-[11px] text-muted-foreground">{t("extract.needsSource")}</span>
                      ) : (
                        <>
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
                            {t("extract.browse")}
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
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <FileDown className="size-3.5 text-muted-foreground" aria-hidden />
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
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                        {artifact.name}
                      </span>
                      <Badge variant="outline">{record(kindLabel(artifact.kind))}</Badge>
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

/** Kept next to the page so the error type is documented where the tool is. */
export const EXTRACT_TOOL_ERROR = PackageError;