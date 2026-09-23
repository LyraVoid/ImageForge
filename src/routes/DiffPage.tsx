import { ArrowRight, LoaderCircle, Scale } from "lucide-react";
import { useState } from "react";
import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

const RANGE_WINDOW = 40;

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
  const [rangeOffset, setRangeOffset] = useState(0);
  // the first artifact is the default: the state only holds a choice the user actually made
  const chosen = artifacts.some((artifact) => artifact.id === chosenId)
    ? chosenId
    : (artifacts[0]?.id ?? "");

  const largest = diff ? Math.max(diff.sizeA, diff.sizeB) : 0;
  const visibleRanges = diff?.ranges.slice(rangeOffset, rangeOffset + RANGE_WINDOW) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("tool.diff.title")}</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">{t("tool.diff.description")}</p>
      </header>

      <ErrorPanel error={error} />

      {source === null ? (
        <ImagePicker
          showLimit={false}
          compact
          title={t("diff.hint")}
          formats={t("dropzone.formats.diff")}
          accept=""
          maxBytes={Number.MAX_SAFE_INTEGER}
          icon={Scale}
        />
      ) : (
        <>
          <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
            <header className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3">
              <Scale className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold tracking-tight">{source.name}</h2>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {formatBytes(source.sizeBytes)}
                </p>
              </div>
              <Badge variant="outline">{artifacts.length}</Badge>
            </header>
            <div className="space-y-3 p-4">
              {artifacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("diff.noArtifacts")}</p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="shrink-0">{t("diff.against")}</span>
                    <select
                      aria-label={t("diff.against")}
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 font-mono text-[11px]"
                      value={chosen}
                      onChange={(event) => setChosenId(event.target.value)}
                    >
                      {artifacts.map((artifact) => (
                        <option key={artifact.id} value={artifact.id}>
                          {artifact.name} ({formatBytes(artifact.sizeBytes)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="primary"
                    disabled={busy || chosen === ""}
                    onClick={async () => {
                      setBusy(true);
                      setRangeOffset(0);
                      await compareWithArtifact(chosen);
                      setBusy(false);
                    }}
                    className="sm:w-36"
                  >
                    {busy ? <LoaderCircle className="animate-spin" /> : null}
                    {t("diff.compare")}
                    <ArrowRight />
                  </Button>
                </div>
              )}
            </div>
          </section>

          {diff ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <main className="min-w-0 space-y-5">
                <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
                  <header className="border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold tracking-tight">
                      {diff.identical
                        ? t("diff.identical")
                        : t("diff.different", {
                            bytes: formatBytes(diff.differingBytes),
                            ranges: String(diff.ranges.length),
                          })}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatBytes(diff.sizeA)} vs {formatBytes(diff.sizeB)}
                      {diff.truncated ? " · " + t("diff.truncated") : ""}
                    </p>
                  </header>
                  <div className="space-y-4 p-4">
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
                    <>
                      <div className="overflow-hidden rounded-md border border-border">
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead className="border-b border-border bg-surface-muted/60 text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-normal">{t("diff.offset")}</th>
                              <th className="px-3 py-2 font-normal">{t("diff.length")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {visibleRanges.map((range) => (
                              <tr key={range.start}>
                                <td className="px-3 py-2">{range.start}</td>
                                <td className="px-3 py-2">{range.length}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {rangeOffset + 1}–{Math.min(rangeOffset + RANGE_WINDOW, diff.ranges.length)} /{" "}
                          {diff.ranges.length}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={rangeOffset === 0}
                            onClick={() => setRangeOffset(Math.max(0, rangeOffset - RANGE_WINDOW))}
                          >
                            {t("animation.previous")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={rangeOffset + RANGE_WINDOW >= diff.ranges.length}
                            onClick={() => setRangeOffset(rangeOffset + RANGE_WINDOW)}
                          >
                            {t("animation.next")}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : null}
                  {diff.ranges.length > rangeOffset + RANGE_WINDOW ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t("diff.more", {
                        count: String(diff.ranges.length - (rangeOffset + RANGE_WINDOW)),
                      })}
                    </p>
                  ) : null}
                  </div>
                </section>
              </main>

              <aside className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-subtle lg:sticky lg:top-20">
                <header className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold tracking-tight">{t("diff.sections")}</h2>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {diff.sections === null ? t("diff.notBoot") : t("diff.sectionsHint")}
                  </p>
                </header>
                {diff.sections === null ? null : (
                  <div className="p-4">
                    <ul className="space-y-3">
                      {diff.sections.map((section) => (
                        <li key={section.name + section.start} className="space-y-1.5">
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
                  </div>
                )}
              </aside>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
