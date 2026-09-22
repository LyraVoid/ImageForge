import { ExternalLink, Languages, Layers, MemoryStick, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { ARTIFACT_CATALOG, MAX_SUPPORTED_IMAGE_BYTES, PROVIDER_DESCRIPTORS } from "@/core";
import type { PatchProviderDescriptor } from "@/core";
import { KeyValueList } from "@/components/app/key-value-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageOptions } from "@/components/ui/language-menu";
import { Separator } from "@/components/ui/separator";
import { useRecordText, useT } from "@/i18n/use-translation";
import type { MessageKey } from "@/i18n";
import { formatBytes, truncateHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useForgeStore } from "@/stores/forge-store";
import { useThemeStore } from "@/stores/theme-store";
import type { ThemeMode } from "@/stores/theme-store";
import { loadWasmModule } from "@/wasm/loader";
import type { WasmStatus } from "@/wasm/abi";

const THEME_OPTIONS: Array<{ value: ThemeMode; labelKey: MessageKey }> = [
  { value: "light", labelKey: "shell.theme.light" },
  { value: "dark", labelKey: "shell.theme.dark" },
  { value: "system", labelKey: "shell.theme.system" },
];

function ProviderRow({ descriptor }: { descriptor: PatchProviderDescriptor }) {
  const t = useT();
  const record = useRecordText();

  return (
    <div className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-foreground">{descriptor.name}</span>
        <Badge variant={descriptor.status === "available" ? "success" : "neutral"}>
          {descriptor.status === "available"
            ? t("settings.providers.available")
            : t("settings.providers.planned")}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground">{descriptor.id}</span>
        {descriptor.website ? (
          <a
            href={descriptor.website}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[11px] text-primary underline-offset-4 hover:underline"
          >
            {t("settings.providers.upstream")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">{record(descriptor.description)}</p>
      {descriptor.notes.length > 0 ? (
        <ul className="space-y-0.5">
          {descriptor.notes.map((note) => (
            <li key={note} className="text-[11px] leading-4 text-muted-foreground">
              — {record(note)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const workerMode = useForgeStore((state) => state.workerMode);
  const [wasm, setWasm] = useState<WasmStatus | null>(null);

  useEffect(() => {
    let active = true;
    loadWasmModule()
      .then((module) => {
        if (active) setWasm(module.status);
      })
      .catch(() => {
        if (active) setWasm({ available: false, path: "/wasm/imageforge.wasm", version: null, reason: "load failed" });
      });
    return () => {
      active = false;
    };
  }, []);

  const runtimeEntries = [
    {
      key: t("settings.runtime.executor"),
      value:
        workerMode === "worker"
          ? t("settings.runtime.executor.worker")
          : t("settings.runtime.executor.inline"),
    },
    {
      key: t("settings.runtime.wasm"),
      value: wasm
        ? wasm.available
          ? wasm.version
            ? t("settings.runtime.wasm.loaded", { version: wasm.version })
            : t("settings.runtime.wasm.loaded", { version: "" }).trim()
          : t("settings.runtime.wasm.fallback")
        : t("settings.runtime.wasm.checking"),
    },
    { key: t("settings.runtime.wasmPath"), value: wasm?.path ?? "/wasm/imageforge.wasm" },
    { key: t("settings.runtime.limit"), value: formatBytes(MAX_SUPPORTED_IMAGE_BYTES) },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance.title")}</CardTitle>
          <CardDescription>{t("settings.appearance.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-muted p-0.5">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={mode === option.value}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === option.value
                    ? "bg-surface text-foreground shadow-subtle"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Languages className="size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle>{t("settings.language.title")}</CardTitle>
            <CardDescription>{t("settings.language.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LanguageOptions />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Terminal className="size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle>{t("settings.runtime.title")}</CardTitle>
            <CardDescription>{t("settings.runtime.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <KeyValueList entries={runtimeEntries} />
          {wasm && !wasm.available && wasm.reason ? (
            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
              {t("settings.runtime.reason", { reason: wasm.reason, command: "pnpm wasm:build" })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Layers className="size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle>{t("settings.artifacts.title")}</CardTitle>
            <CardDescription>{t("settings.artifacts.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {ARTIFACT_CATALOG.releases.map((release) => (
            <div key={release.providerId + release.release} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-foreground">
                  {release.providerId}@{release.release}
                </span>
                <Badge variant="neutral">
                  {t("settings.artifacts.count", { count: release.artifacts.length })}
                </Badge>
              </div>
              <ul className="space-y-2">
                {release.artifacts.map((artifact) => (
                  <li key={artifact.id} className="space-y-1 rounded-md border border-border bg-surface-muted px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-foreground">{artifact.id}</span>
                      <Badge variant="outline">{artifact.type}</Badge>
                      {artifact.architecture ? <Badge variant="neutral">{artifact.architecture}</Badge> : null}
                      {artifact.sizeBytes ? (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatBytes(artifact.sizeBytes)}
                        </span>
                      ) : null}
                    </div>
                    <p className="break-all font-mono text-[11px] text-muted-foreground">
                      sha256 {artifact.sha256 ? truncateHash(artifact.sha256, 32, 16) : t("settings.artifacts.notRecorded")}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {t("settings.artifacts.source", {
                        source: artifact.source ?? t("settings.artifacts.unknownSource"),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
              {release.notes ? (
                <p className="text-[11px] leading-4 text-muted-foreground">{release.notes}</p>
              ) : null}
              <Separator />
            </div>
          ))}
          <p className="text-[11px] leading-4 text-muted-foreground">{t("settings.artifacts.remote")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <MemoryStick className="size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle>{t("settings.providers.title")}</CardTitle>
            <CardDescription>{t("settings.providers.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {PROVIDER_DESCRIPTORS.map((descriptor) => (
            <ProviderRow key={descriptor.id} descriptor={descriptor} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.license.title")}</CardTitle>
          <CardDescription>{t("settings.license.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] leading-4 text-muted-foreground">{t("settings.license.body")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
