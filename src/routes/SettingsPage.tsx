import { ExternalLink, Languages, Layers, MemoryStick, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ARTIFACT_CATALOG, MAX_SUPPORTED_IMAGE_BYTES, PROVIDER_DESCRIPTORS } from "@/core";
import type { PatchProviderDescriptor } from "@/core";
import { KeyValueList } from "@/components/app/key-value-list";
import { Badge } from "@/components/ui/badge";
import { LanguageOptions } from "@/components/ui/language-menu";
import { useRecordText, useT } from "@/i18n/use-translation";
import type { MessageKey } from "@/i18n";
import { APP_VERSION } from "@/lib/app-meta";
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
    <div className="space-y-1.5 py-4">
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

function SettingsGroup({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: typeof Terminal;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-4">
      <div className="flex items-start gap-3">
        {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
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
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">{t("settings.subtitle")}</p>
        <p className="text-[11px] text-muted-foreground">
          {t("settings.version", { version: APP_VERSION })}
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle lg:sticky lg:top-20">
          <SettingsGroup
            title={t("settings.appearance.title")}
            description={t("settings.appearance.description")}
          >
            <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-muted p-0.5">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  aria-pressed={mode === option.value}
                  className={cn(
                    "min-h-8 rounded-sm px-3 text-xs font-medium transition-colors",
                    mode === option.value
                      ? "bg-surface text-foreground shadow-subtle"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </SettingsGroup>

          <div className="border-t border-border">
            <SettingsGroup
              icon={Languages}
              title={t("settings.language.title")}
              description={t("settings.language.description")}
            >
              <LanguageOptions />
            </SettingsGroup>
          </div>

          <div className="border-t border-border">
            <SettingsGroup
              icon={Terminal}
              title={t("settings.runtime.title")}
              description={t("settings.runtime.description")}
            >
              <KeyValueList entries={runtimeEntries} stacked />
              {wasm && !wasm.available && wasm.reason ? (
                <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
                  {t("settings.runtime.reason", { reason: wasm.reason, command: "pnpm wasm:build" })}
                </p>
              ) : null}
            </SettingsGroup>
          </div>
        </section>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
            <header className="flex items-start gap-3 border-b border-border px-4 py-3">
              <Layers className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">{t("settings.artifacts.title")}</h2>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {t("settings.artifacts.description")}
                </p>
              </div>
            </header>
            <div>
              {ARTIFACT_CATALOG.releases.map((release, releaseIndex) => (
                <section key={release.providerId + release.release} className={releaseIndex > 0 ? "border-t border-border" : ""}>
                  <header className="flex flex-wrap items-center gap-2 bg-surface-muted/35 px-4 py-2.5">
                    <span className="font-mono text-xs text-foreground">
                      {release.providerId}@{release.release}
                    </span>
                    <Badge variant="neutral">
                      {t("settings.artifacts.count", { count: release.artifacts.length })}
                    </Badge>
                  </header>
                  <ul className="divide-y divide-border">
                    {release.artifacts.map((artifact) => (
                      <li key={artifact.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)]">
                        <div className="min-w-0 space-y-1">
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
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {t("settings.artifacts.source", {
                              source: artifact.source ?? t("settings.artifacts.unknownSource"),
                            })}
                          </p>
                        </div>
                        <p className="break-all font-mono text-[11px] text-muted-foreground md:text-right">
                          sha256{" "}
                          {artifact.sha256
                            ? truncateHash(artifact.sha256, 32, 16)
                            : t("settings.artifacts.notRecorded")}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {release.notes ? (
                    <p className="border-t border-border px-4 py-2 text-[11px] leading-4 text-muted-foreground">
                      {release.notes}
                    </p>
                  ) : null}
                </section>
              ))}
              <p className="border-t border-border px-4 py-3 text-[11px] leading-4 text-muted-foreground">
                {t("settings.artifacts.remote")}
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
            <header className="flex items-start gap-3 border-b border-border px-4 py-3">
              <MemoryStick className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">{t("settings.providers.title")}</h2>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {t("settings.providers.description")}
                </p>
              </div>
            </header>
            <div className="divide-y divide-border px-4">
              {PROVIDER_DESCRIPTORS.map((descriptor) => (
                <ProviderRow key={descriptor.id} descriptor={descriptor} />
              ))}
            </div>
            <div className="border-t border-border px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">{t("settings.license.title")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.license.description")}</p>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{t("settings.license.body")}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
