import { ArrowRight, Download, ImageIcon, LoaderCircle, RotateCcw, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SplashResolutionMode } from "@/core/logo";
import { useT } from "@/i18n/use-translation";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import { useForgeStore } from "@/stores/forge-store";

const MODES: SplashResolutionMode[] = ["direct", "followOriginal", "autoAdapt", "custom"];

/**
 * The splash editor: the frames of an OPPO/Realme/OnePlus splash image, one picture per frame the
 * user can replace, the four adaptation modes, and a repack that keeps every untouched frame's bytes
 * as they are. It never flashes anything: the result is a partition image to download.
 */
export function LogoPage() {
  const t = useT();
  const source = useForgeStore((state) => state.source);
  const stage = useForgeStore((state) => state.stage);
  const error = useForgeStore((state) => state.error);
  const splash = useForgeStore((state) => state.splash);
  const previews = useForgeStore((state) => state.splashPreviews);
  const replacements = useForgeStore((state) => state.splashReplacements);
  const mode = useForgeStore((state) => state.splashMode);
  const customWidth = useForgeStore((state) => state.splashCustomWidth);
  const customHeight = useForgeStore((state) => state.splashCustomHeight);
  const artifacts = useForgeStore((state) => state.artifacts);
  const loadSplash = useForgeStore((state) => state.loadSplash);
  const readSplashFramePreview = useForgeStore((state) => state.readSplashFramePreview);
  const replaceSplashFrame = useForgeStore((state) => state.replaceSplashFrame);
  const clearSplashReplacement = useForgeStore((state) => state.clearSplashReplacement);
  const replaceSplashFramesFromFiles = useForgeStore((state) => state.replaceSplashFramesFromFiles);
  const setSplashMode = useForgeStore((state) => state.setSplashMode);
  const packSplash = useForgeStore((state) => state.packSplash);
  const exportSplashFrames = useForgeStore((state) => state.exportSplashFrames);
  const artifactBlob = useForgeStore((state) => state.artifactBlob);
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [batch, setBatch] = useState<{ matched: number; count: number; unmatched: string[] } | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const batchInput = useRef<HTMLInputElement | null>(null);

  /** Decodes a picture the user picked into straight RGBA, which is what the adaptation reads. */
  const decodePicture = useCallback(async (file: File) => {
    if (typeof createImageBitmap === "undefined") throw new Error("no createImageBitmap");
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close?.();
    return {
      name: file.name,
      rgba: new Uint8Array(pixels.data),
      width: bitmap.width,
      height: bitmap.height,
    };
  }, []);

  const handleBatch = useCallback(
    async (files: File[]) => {
      setBusy(true);
      setUploadError(false);
      try {
        const decoded = [];
        for (const file of files) decoded.push(await decodePicture(file));
        const result = replaceSplashFramesFromFiles(decoded);
        setBatch({ matched: result.matched.length, count: files.length, unmatched: result.unmatched });
      } catch {
        setUploadError(true);
      } finally {
        setBusy(false);
        if (batchInput.current) batchInput.current.value = "";
      }
    },
    [decodePicture, replaceSplashFramesFromFiles],
  );

  useEffect(() => {
    if (source && stage !== "analyzing" && splash === null) void loadSplash();
  }, [source, stage, splash, loadSplash]);

  // Frames are ten megabytes each, so previews are read one after another and appear as they arrive.
  useEffect(() => {
    if (!splash) return;
    let cancelled = false;
    const load = async () => {
      for (const frame of splash.frames) {
        if (cancelled) return;
        if (useForgeStore.getState().splashPreviews[frame.index]) continue;
        await readSplashFramePreview(frame.index);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [splash, readSplashFramePreview]);

  const handleFile = useCallback(
    async (file: File) => {
      if (target === null) return;
      setBusy(true);
      setUploadError(false);
      try {
        replaceSplashFrame(target, await decodePicture(file));
      } catch {
        setUploadError(true);
      } finally {
        setBusy(false);
        setTarget(null);
        if (input.current) input.current.value = "";
      }
    },
    [target, replaceSplashFrame, decodePicture],
  );

  const packed = artifacts.filter((artifact) => artifact.tool === "logo" || artifact.tool === "export");
  const last = packed.at(-1);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">{t("tool.logo.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("tool.logo.description")}</p>
      </div>

      <ErrorPanel error={error} />

      {source === null ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("logo.hint")}</p>
          <ImagePicker showLimit={false} />
        </div>
      ) : splash === null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
          {t("extract.reading")}
        </p>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <ImageIcon className="size-3.5 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <CardTitle>
                  {t("logo.summary", {
                    frames: String(splash.frames.length),
                    width: String(splash.headerWidth),
                    height: String(splash.headerHeight),
                    size: formatBytes(splash.sizeBytes),
                  })}
                </CardTitle>
                <CardDescription>
                  {t(("logo.format." + splash.format) as never)} · {t("logo.headerNote")}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Wand2 className="size-3.5 text-muted-foreground" aria-hidden />
              <CardTitle>{t("logo.mode")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {MODES.map((candidate) => (
                <Button
                  key={candidate}
                  variant={mode === candidate ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setSplashMode(candidate)}
                >
                  {t(("logo.mode." + candidate) as never)}
                </Button>
              ))}
              {mode === "custom" ? (
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {t("logo.width")}
                  <input
                    className="w-16 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                    type="number"
                    min={1}
                    value={customWidth ?? ""}
                    onChange={(event) => setSplashMode("custom", { width: Number(event.target.value) })}
                  />
                  {t("logo.height")}
                  <input
                    className="w-16 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                    type="number"
                    min={1}
                    value={customHeight ?? ""}
                    onChange={(event) => setSplashMode("custom", { height: Number(event.target.value) })}
                  />
                </span>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("logo.frames")}</CardTitle>
              <CardDescription>{t("logo.replaceHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={input}
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <input
                ref={batchInput}
                className="hidden"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length > 0) void handleBatch(files);
                }}
              />
              <div className="flex flex-wrap items-center gap-2 pb-2">
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => batchInput.current?.click()}>
                  {t("logo.batch")}
                </Button>
                {batch ? (
                  <span className="text-[11px] text-muted-foreground">
                    {t("logo.batchResult", { matched: String(batch.matched), count: String(batch.count) })}
                    {batch.unmatched.length > 0
                      ? " " + t("logo.batchUnmatched", { names: batch.unmatched.join(", ") })
                      : ""}
                  </span>
                ) : null}
              </div>
              <ul className="divide-y divide-border">
                {splash.frames.map((frame) => {
                  const preview = previews[frame.index];
                  const replacement = replacements[frame.index];
                  return (
                    <li key={frame.index} className="flex flex-wrap items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <FrameThumb preview={replacement ? replacement.preview : preview} />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate font-mono text-[11px] text-foreground">{frame.name.trim()}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("logo.stored", {
                            width: String(frame.width),
                            height: String(frame.height),
                            compressed: formatBytes(frame.compressedSize),
                            real: formatBytes(frame.realSize),
                          })}
                        </p>
                      </div>
                      {replacement ? (
                        <Badge variant="success">
                          {replacement.sourceName} · {replacement.target.width}×{replacement.target.height}
                        </Badge>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setTarget(frame.index);
                          input.current?.click();
                        }}
                      >
                        {t("logo.replace")}
                      </Button>
                      {replacement ? (
                        <Button variant="ghost" size="sm" onClick={() => clearSplashReplacement(frame.index)}>
                          <RotateCcw />
                          {t("logo.reset")}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {uploadError ? <p className="pt-2 text-[11px] text-warning">{t("logo.uploadFailed")}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Download className="size-3.5 text-muted-foreground" aria-hidden />
              <CardTitle>{t("logo.pack")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await packSplash();
                    setBusy(false);
                  }}
                >
                  {busy ? <LoaderCircle className="animate-spin" /> : null}
                  {t("logo.pack")}
                  <ArrowRight />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await exportSplashFrames();
                    setBusy(false);
                  }}
                >
                  {t("logo.export")}
                </Button>
              </div>
              {last ? (
                <p
                  className={cn(
                    "text-[11px] leading-4",
                    Number(last.params?.sizeDelta ?? "0") > 0 ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {t("logo.packed", { count: last.params?.replaced ?? "0" })}{" "}
                  {Number(last.params?.sizeDelta ?? "0") > 0
                    ? t("logo.grows", { size: formatBytes(Number(last.params?.sizeDelta ?? "0")) })
                    : t("logo.same")}{" "}
                  {last.params?.verified === "identical"
                    ? t("logo.verified.identical")
                    : last.params?.verified === "frames-intact"
                      ? t("logo.verified.framesIntact")
                      : t("logo.verified.different")}
                </p>
              ) : null}
              {packed.length > 0 ? (
                <ul className="space-y-2">
                  {packed.map((artifact) => (
                    <li
                      key={artifact.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{artifact.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatBytes(artifact.sizeBytes)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const blob = await artifactBlob(artifact.id);
                          if (blob) downloadBlob(blob, artifact.name);
                        }}
                      >
                        <Download />
                        {t("extract.download")}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** Draws a preview's pixels straight onto a canvas; no browser image decoding is involved. */
function FrameThumb({ preview }: { preview?: { width: number; height: number; rgba: Uint8Array } }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !preview) return;
    const context = element.getContext("2d");
    if (!context) return;
    element.width = preview.width;
    element.height = preview.height;
    const image = new ImageData(
      new Uint8ClampedArray(preview.rgba),
      preview.width,
      preview.height,
    );
    context.putImageData(image, 0, 0);
  }, [preview]);

  return (
    <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-muted">
      {preview ? (
        <canvas ref={canvas} className="max-h-10 max-w-16" />
      ) : (
        <LoaderCircle className="size-3 animate-spin text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}