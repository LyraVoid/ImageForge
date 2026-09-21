import { ExternalLink, Layers, MemoryStick, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { ARTIFACT_CATALOG, MAX_SUPPORTED_IMAGE_BYTES, PROVIDER_DESCRIPTORS } from "@/core";
import type { PatchProviderDescriptor } from "@/core";
import { KeyValueList } from "@/components/app/key-value-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatBytes, truncateHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useForgeStore } from "@/stores/forge-store";
import { useThemeStore } from "@/stores/theme-store";
import type { ThemeMode } from "@/stores/theme-store";
import { loadWasmModule } from "@/wasm/loader";
import type { WasmStatus } from "@/wasm/abi";

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function ProviderRow({ descriptor }: { descriptor: PatchProviderDescriptor }) {
  return (
    <div className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-foreground">{descriptor.name}</span>
        <Badge variant={descriptor.status === "available" ? "success" : "neutral"}>
          {descriptor.status === "available" ? "Available" : "Planned"}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground">{descriptor.id}</span>
        {descriptor.website ? (
          <a
            href={descriptor.website}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[11px] text-primary underline-offset-4 hover:underline"
          >
            upstream
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">{descriptor.description}</p>
      {descriptor.notes.length > 0 ? (
        <ul className="space-y-0.5">
          {descriptor.notes.map((note) => (
            <li key={note} className="text-[11px] leading-4 text-muted-foreground">
              — {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
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
    { key: "Executor", value: workerMode === "worker" ? "Web Worker (Comlink RPC)" : "Inline session (no Worker available)" },
    { key: "WASM module", value: wasm ? (wasm.available ? "loaded " + (wasm.version ?? "") : "TypeScript fallback") : "checking" },
    { key: "WASM path", value: wasm?.path ?? "/wasm/imageforge.wasm" },
    { key: "Image size limit", value: formatBytes(MAX_SUPPORTED_IMAGE_BYTES) },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Runtime, registry and appearance. Everything is stored locally.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Design tokens switch between the light and dark themes.</CardDescription>
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
                {option.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Terminal className="size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>Heavy work executes off the main thread.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <KeyValueList entries={runtimeEntries} />
          {wasm && !wasm.available && wasm.reason ? (
            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
              Reason: {wasm.reason} Run <code>pnpm wasm:build</code> to produce the WebAssembly module.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Layers className="size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle>Artifact registry</CardTitle>
            <CardDescription>
              Versions, architectures and digests are declared here, never hardcoded in the UI.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {ARTIFACT_CATALOG.releases.map((release) => (
            <div key={release.providerId + release.release} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-foreground">
                  {release.providerId}@{release.release}
                </span>
                <Badge variant="neutral">{release.artifacts.length} artifact(s)</Badge>
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
                      sha256 {artifact.sha256 ? truncateHash(artifact.sha256, 32, 16) : "not recorded"}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">source {artifact.source ?? "unknown"}</p>
                  </li>
                ))}
              </ul>
              {release.notes ? (
                <p className="text-[11px] leading-4 text-muted-foreground">{release.notes}</p>
              ) : null}
              <Separator />
            </div>
          ))}
          <p className="text-[11px] leading-4 text-muted-foreground">
            Remote artifact downloads are not part of this build. Upstream releases, their build systems and
            their licenses must be reviewed before a provider is implemented.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <MemoryStick className="size-3.5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle>Patch providers</CardTitle>
            <CardDescription>Providers only see the normalized image produced by the Image Engine.</CardDescription>
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
          <CardTitle>License</CardTitle>
          <CardDescription>ImageForge is AGPL-3.0-or-later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] leading-4 text-muted-foreground">
            Third-party components keep their own licenses and are never re-licensed. See LICENSE, NOTICE and
            THIRD_PARTY_LICENSES/ in the repository root. No upstream root solution code is bundled in this
            build.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
