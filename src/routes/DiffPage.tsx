import { ArrowRight, LoaderCircle, Scale } from "lucide-react";
import { useState } from "react";
import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

/**
 * Comparing the image that is open with anything the workspace holds. Patches are checked this way:
 * the result of a patch is compared with the original, and a difference that reaches outside the part
 * it should touch is the first sign something moved that was not meant to.
 */
export function DiffPage() {
  const t = useT();
  const source = useForgeStore((state) => state.source);
  const error = useForgeStore((state) => state.error);
  const artifacts = useForgeStore((state) => state.artifacts);
  const diff = useForgeStore((state) => state.diff);
  const compareWithArtifact = useForgeStore((state) => state.compareWithArtifact);
  const [chosenId, setChosenId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // the first artifact is the default: the state only holds a choice the user actually made
  const chosen = artifacts.some((artifact) => artifact.id === chosenId)
    ? chosenId
    : (artifacts[0]?.id ?? "");

  const largest = diff ? Math.max(diff.sizeA, diff.sizeB) : 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">{t("tool.diff.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("tool.diff.description")}</p>
      </div>

      <ErrorPanel error={error} />

      {source === null ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("diff.hint")}</p>
          <ImagePicker showLimit={false} />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Scale className="size-3.5 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <CardTitle>{source.name}</CardTitle>
                <CardDescription>{formatBytes(source.sizeBytes)}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {artifacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("diff.noArtifacts")}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {t("diff.against")}
                  <select
                    aria-label={t("diff.against")}
                    className="max-w-64 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                    value={chosen}
                    onChange={(event) => setChosenId(event.target.value)}
                  >
                    {artifacts.map((artifact) => (
                      <option key={artifact.id} value={artifact.id}>
                        {artifact.name} ({formatBytes(artifact.sizeBytes)})
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy || chosen === ""}
                    onClick={async () => {
                      setBusy(true);
                      await compareWithArtifact(chosen);
                      setBusy(false);
                    }}
                  >
                    {busy ? <LoaderCircle className="animate-spin" /> : null}
                    {t("diff.compare")}
                    <ArrowRight />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {diff ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {diff.identical
                      ? t("diff.identical")
                      : t("diff.different", {
                          bytes: formatBytes(diff.differingBytes),
                          ranges: String(diff.ranges.length),
                        })}
                  </CardTitle>
                  <CardDescription>
                    {formatBytes(diff.sizeA)} vs {formatBytes(diff.sizeB)}
                    {diff.truncated ? " · " + t("diff.truncated") : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative h-6 w-full overflow-hidden rounded border border-border bg-surface-muted">
                    {diff.ranges.map((range) => (
                      <span
                        key={range.start}
                        className="absolute top-0 h-full bg-warning"
                        style={{
                          left: (100 * range.start) / largest + "%",
                          width: Math.max(0.15, (100 * range.length) / largest) + "%",
                        }}
                      />
                    ))}
                  </div>
                  {diff.ranges.length > 0 ? (
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="font-normal">{t("diff.offset")}</th>
                          <th className="font-normal">{t("diff.length")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.ranges.slice(0, 20).map((range) => (
                          <tr key={range.start}>
                            <td>{range.start}</td>
                            <td>{range.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {diff.ranges.length > 20 ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t("diff.more", { count: String(diff.ranges.length - 20) })}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("diff.sections")}</CardTitle>
                  <CardDescription>
                    {diff.sections === null ? t("diff.notBoot") : t("diff.sectionsHint")}
                  </CardDescription>
                </CardHeader>
                {diff.sections === null ? null : (
                  <CardContent>
                    <ul className="space-y-2">
                      {diff.sections.map((section) => (
                        <li key={section.name + section.start} className="space-y-1">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="min-w-0 flex-1 truncate font-mono">{section.name}</span>
                            <span className="font-mono text-muted-foreground">
                              {section.start}..{section.end}
                            </span>
                            <Badge variant={section.differingBytes > 0 ? "warning" : "neutral"}>
                              {formatBytes(section.differingBytes)}
                            </Badge>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded bg-surface-muted">
                            <span
                              className={section.differingBytes > 0 ? "block h-full bg-warning" : "block h-full"}
                              style={{
                                width:
                                  (100 * Math.min(section.differingBytes, section.end - section.start)) /
                                    Math.max(1, section.end - section.start) +
                                  "%",
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                )}
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
