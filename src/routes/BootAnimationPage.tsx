import { ArrowRight, Clock, Download, LoaderCircle, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorPanel } from "@/components/app/error-panel";
import { ImagePicker } from "@/components/app/image-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/i18n/use-translation";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import { useForgeStore } from "@/stores/forge-store";

const WINDOW = 24;

/**
 * The boot animation editor. A boot animation is a zip of a desc.txt and part directories; this page
 * lists the parts and their frames, plays the animation the way the system would, lets a frame be
 * replaced and the desc be edited, and packs the archive again. An animation nothing was changed in
 * keeps its desc.txt and every frame exactly as they were.
 */
export function BootAnimationPage() {
  const t = useT();
  const source = useForgeStore((state) => state.source);
  const stage = useForgeStore((state) => state.stage);
  const error = useForgeStore((state) => state.error);
  const animation = useForgeStore((state) => state.animation);
  const animationSourceId = useForgeStore((state) => state.animationSourceId);
  const part = useForgeStore((state) => state.animationPart);
  const replacements = useForgeStore((state) => state.animationReplacements);
  const artifacts = useForgeStore((state) => state.artifacts);
  const loadAnimation = useForgeStore((state) => state.loadAnimation);
  const selectAnimationPart = useForgeStore((state) => state.selectAnimationPart);
  const readAnimationFrame = useForgeStore((state) => state.readAnimationFrame);
  const replaceAnimationFrame = useForgeStore((state) => state.replaceAnimationFrame);
  const clearAnimationReplacement = useForgeStore((state) => state.clearAnimationReplacement);
  const editAnimationGlobal = useForgeStore((state) => state.editAnimationGlobal);
  const editAnimationPart = useForgeStore((state) => state.editAnimationPart);
  const packAnimation = useForgeStore((state) => state.packAnimation);
  const artifactBlob = useForgeStore((state) => state.artifactBlob);

  const [offset, setOffset] = useState(0);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const ready = animation !== null && animationSourceId === source?.id;
  const frames = useMemo(
    () => animation?.parts.find((candidate) => candidate.path === part)?.frames ?? [],
    [animation, part],
  );
  const windowFrames = frames.slice(offset, offset + WINDOW);

  useEffect(() => {
    if (source && stage !== "analyzing" && animationSourceId !== source.id) void loadAnimation();
  }, [source, stage, animationSourceId, loadAnimation]);

  // the frames are pictures, so the browser can show them directly; the object URLs are kept here
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const load = async () => {
      for (const entry of windowFrames) {
        if (cancelled) return;
        if (useForgeStore.getState().animationReplacements[entry.name]) continue;
        if (typeof URL.createObjectURL !== "function") return;
        const existing = await readAnimationFrame(entry.name);
        if (!existing || cancelled) continue;
        try {
          // the bytes are a whole file, so their buffer is the picture jsdom can wrap in a Blob
          const url = URL.createObjectURL(new Blob([existing.buffer as ArrayBuffer], { type: "image/png" }));
          setUrls((current) => (current[entry.name] ? current : { ...current, [entry.name]: url }));
        } catch {
          // a preview that cannot be shown is not a reason to fail the tool
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, part, offset, readAnimationFrame]);

  const draw = useCallback(async () => {
    const element = canvas.current;
    if (!element || !ready || frames.length === 0) return;
    const bytes = await readAnimationFrame(frames[frame % frames.length].name);
    if (!bytes) return;
    if (typeof createImageBitmap === "undefined") return;
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const context = element.getContext("2d");
    if (!context) return;
    element.width = animation?.width ?? bitmap.width;
    element.height = animation?.height ?? bitmap.height;
    context.clearRect(0, 0, element.width, element.height);
    context.drawImage(bitmap, 0, (element.height - bitmap.height) / 2);
    bitmap.close?.();
  }, [ready, frames, frame, readAnimationFrame, animation]);

  useEffect(() => {
    void draw();
  }, [draw]);

  useEffect(() => {
    if (!playing || !ready || frames.length === 0) return;
    const timer = window.setInterval(() => setFrame((current) => current + 1), Math.max(16, 1000 / animation.fps));
    return () => window.clearInterval(timer);
  }, [playing, ready, frames.length, animation]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!target) return;
      setBusy(true);
      try {
        if (typeof createImageBitmap === "undefined") throw new Error("no createImageBitmap");
        const bitmap = await createImageBitmap(file);
        const element = document.createElement("canvas");
        element.width = bitmap.width;
        element.height = bitmap.height;
        const context = element.getContext("2d");
        if (!context) throw new Error("no 2d context");
        context.drawImage(bitmap, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => element.toBlob(resolve, "image/png"));
        bitmap.close?.();
        if (!blob) throw new Error("no png");
        replaceAnimationFrame(target, {
          data: new Uint8Array(await blob.arrayBuffer()),
          sourceName: file.name,
          width: element.width,
          height: element.height,
        });
      } catch (caught) {
        console.error(caught);
      } finally {
        setBusy(false);
        setTarget(null);
        if (input.current) input.current.value = "";
      }
    },
    [target, replaceAnimationFrame],
  );

  const packed = artifacts.filter((artifact) => artifact.tool === "animation");
  const last = packed.at(-1);
  const replacedCount = Object.keys(replacements).length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">{t("tool.animation.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("tool.animation.description")}</p>
      </div>

      <ErrorPanel error={error} />

      {source === null ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("animation.hint")}</p>
          <ImagePicker showLimit={false} />
        </div>
      ) : !ready ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
          {t("extract.reading")}
        </p>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Sparkles className="size-3.5 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <CardTitle>
                  {animation.width}×{animation.height} · {animation.fps} fps ·{" "}
                  {t("animation.summary", {
                    parts: String(animation.parts.length),
                    frames: String(animation.parts.reduce((sum, entry) => sum + entry.frames.length, 0)),
                  })}
                </CardTitle>
                <CardDescription>
                  {animation.dialect === "vendor-g" ? t("animation.vendorDialect") : t("animation.standardDialect")}{" "}
                  {t("animation.keepsOriginal")}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {t("animation.size")}
                <input
                  aria-label={t("animation.width")}
                  className="w-20 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                  type="number"
                  min={1}
                  value={animation.width}
                  onChange={(event) => editAnimationGlobal({ width: Number(event.target.value) })}
                />
                ×
                <input
                  aria-label={t("animation.height")}
                  className="w-20 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                  type="number"
                  min={1}
                  value={animation.height}
                  onChange={(event) => editAnimationGlobal({ height: Number(event.target.value) })}
                />
                {t("animation.fps")}
                <input
                  aria-label={t("animation.fps")}
                  className="w-16 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                  type="number"
                  min={1}
                  value={animation.fps}
                  onChange={(event) => editAnimationGlobal({ fps: Number(event.target.value) })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <canvas ref={canvas} className="max-h-48 w-auto rounded border border-border bg-black" />
                <div className="space-y-2">
                  <Button variant="secondary" size="sm" onClick={() => setPlaying(!playing)}>
                    {playing ? <Pause /> : <Play />}
                    {playing ? t("animation.pause") : t("animation.play")}
                  </Button>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {frames.length === 0 ? "-" : ((frame % Math.max(1, frames.length)) + 1) + " / " + frames.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("animation.parts")}</CardTitle>
              <CardDescription>{t("animation.partsHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {animation.parts.map((entry) => (
                  <li key={entry.path} className="flex flex-wrap items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <Badge variant={entry.path === part ? "success" : "neutral"}>{entry.type}</Badge>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{entry.path}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {entry.frames.length} {t("animation.frames")}
                    </span>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {t("animation.count")}
                      <input
                        className="w-14 rounded border border-border bg-surface px-1 py-0.5 font-mono text-[11px]"
                        type="number"
                        min={0}
                        value={entry.count}
                        onChange={(event) => editAnimationPart(entry.path, { count: Number(event.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {t("animation.pauseFrames")}
                      <input
                        className="w-14 rounded border border-border bg-surface px-1 py-0.5 font-mono text-[11px]"
                        type="number"
                        min={0}
                        value={entry.pause}
                        onChange={(event) => editAnimationPart(entry.path, { pause: Number(event.target.value) })}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        selectAnimationPart(entry.path);
                        // the strip and the player start at the beginning of a part
                        setOffset(0);
                        setFrame(0);
                      }}
                    >
                      {t("animation.show")}
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Clock className="size-3.5 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <CardTitle>{part ?? "-"}</CardTitle>
                <CardDescription>{t("animation.framesHint")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
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
              <div className="flex flex-wrap gap-2">
                {windowFrames.map((entry) => {
                  const replacement = replacements[entry.name];
                  return (
                    <div key={entry.name} className="w-24 space-y-1">
                      <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded border border-border bg-surface-muted">
                        {replacement ? (
                          <span className="px-1 text-center text-[10px] text-muted-foreground">{replacement.sourceName}</span>
                        ) : urls[entry.name] ? (
                          <img src={urls[entry.name]} alt={entry.name} className="max-h-24 max-w-24" />
                        ) : (
                          <LoaderCircle className="size-3 animate-spin text-muted-foreground" aria-hidden />
                        )}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {entry.name.replace(/^.*\//, "")}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setTarget(entry.name);
                            input.current?.click();
                          }}
                        >
                          {t("animation.replace")}
                        </Button>
                        {replacement ? (
                          <Button variant="ghost" size="sm" onClick={() => clearAnimationReplacement(entry.name)}>
                            <RotateCcw />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - WINDOW))}
                >
                  {t("animation.previous")}
                </Button>
                <span className="font-mono">
                  {frames.length === 0 ? 0 : offset + 1}–{Math.min(offset + WINDOW, frames.length)} / {frames.length}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={offset + WINDOW >= frames.length}
                  onClick={() => setOffset(offset + WINDOW)}
                >
                  {t("animation.next")}
                </Button>
                <span>{t("animation.replaced", { count: String(replacedCount) })}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Download className="size-3.5 text-muted-foreground" aria-hidden />
              <CardTitle>{t("animation.pack")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await packAnimation();
                  setBusy(false);
                }}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : null}
                {t("animation.pack")}
                <ArrowRight />
              </Button>
              {last ? (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {t("animation.packed", { count: last.params?.replaced ?? "0" })}{" "}
                  {last.params?.verified === "entries-intact"
                    ? t("animation.verified")
                    : t("animation.differs")}
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
