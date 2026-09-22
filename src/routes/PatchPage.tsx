import { ArrowLeft, Info, Layers, LoaderCircle, Play } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { KeyValueList } from "@/components/app/key-value-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatBytes, truncateHash } from "@/lib/format";
import {
  APATCH_FLAVOR_SETTING,
  APATCH_FLAVORS,
  KERNELSU_KMI_SETTING,
  KNOWN_KMIS,
  MAGISK_KEEP_FORCE_ENCRYPT_SETTING,
  MAGISK_KEEP_VERITY_SETTING,
  MAGISK_PREINIT_DEVICE_SETTING,
  plannedKmi,
} from "@/core";
import { mergePlanOptions } from "@/stores/plan-options";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useForgeStore } from "@/stores/forge-store";

export function PatchPage() {
  const navigate = useNavigate();
  const analysis = useForgeStore((state) => state.analysis);
  const planResponse = useForgeStore((state) => state.planResponse);
  const selectedProviderId = useForgeStore((state) => state.selectedProviderId);
  const error = useForgeStore((state) => state.error);
  const isBusy = useForgeStore((state) => state.isBusy);
  const selectProvider = useForgeStore((state) => state.selectProvider);
  // Options the user changed on this page. They are sent to the worker as a re-plan so
  // the plan stays the single source of truth, and they keep the inputs responsive.
  const [optionDraft, setOptionDraft] = useState<Record<string, string>>({});
  const [superkeyDraft, setSuperkeyDraft] = useState("");
  const [preinitDraft, setPreinitDraft] = useState("");
  const kpmInputRef = useRef<HTMLInputElement>(null);
  const attachments = useForgeStore((state) => state.attachments);
  const setAttachments = useForgeStore((state) => state.setAttachments);

  const readOption = (key: string, fallback: string): string =>
    optionDraft[key] ?? plan?.configuration[key] ?? fallback;

  // A plan can pin kmi="unset" (nothing chosen yet); the sentinel must never reach the UI.
  const chosenKmi = (): string => plannedKmi(plan?.configuration);

  const applyOption = (patch: Record<string, string>): void => {
    if (!plan || !selectedProviderId) return;
    const next = mergePlanOptions(plan.configuration, optionDraft, patch);
    setOptionDraft(next);
    void selectProvider(selectedProviderId, { configuration: next });
  };

  const handleAttachmentSelection = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;
    const loaded = await Promise.all(
      selected.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
    );
    const merged = [
      ...attachments.filter((existing) => !loaded.some((entry) => entry.name === existing.name)),
      ...loaded,
    ];
    await setAttachments(merged);
  };

  if (!analysis) return <Navigate to="/" replace />;
  if (!selectedProviderId) return <Navigate to="/analyze" replace />;
  if (!planResponse) {
    if (!isBusy) return <Navigate to="/analyze" replace />;
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
          Building the patch plan
        </CardContent>
      </Card>
    );
  }

  const plan = planResponse.plan;
  const candidate = analysis.compatibility.candidates.find((entry) => entry.providerId === selectedProviderId);

  const planEntries = [
    { key: "Provider", value: plan.providerName + " (" + plan.providerId + ")" },
    { key: "Release", value: plan.release },
    { key: "Artifact", value: plan.artifact.id + "@" + plan.artifact.version },
    { key: "Artifact type", value: plan.artifact.type },
    {
      key: "Artifact SHA-256",
      value: plan.artifact.sha256 ? truncateHash(plan.artifact.sha256, 24, 12) : "not recorded",
    },
    { key: "Architecture", value: plan.architecture },
    { key: "Target image", value: plan.target },
    { key: "Boot header", value: "v" + plan.headerVersion },
    { key: "Page size", value: formatBytes(plan.pageSize) },
    { key: "Source SHA-256", value: truncateHash(plan.sourceImageSha256, 24, 12) },
    { key: "Plan id", value: plan.id },
    { key: "Reproducible", value: plan.reproducible ? "yes" : "no" },
  ];

  const configurationEntries = Object.entries(plan.configuration).map(([key, value]) => ({
    key,
    value: String(value),
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-base font-semibold tracking-tight">{plan.providerName}</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">{candidate?.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {candidate?.status === "planned" ? <Badge variant="neutral">Not available</Badge> : null}
          <Badge variant="outline">{plan.target}</Badge>
          <Badge variant="neutral">v{plan.headerVersion}</Badge>
        </div>
      </div>

      <ErrorPanel error={error} />

      <div className="rounded-lg border border-info/30 bg-info-muted px-4 py-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              {plan.providerId === "mock"
                ? "This is the Mock Provider."
                : "This runs the upstream " + plan.providerName + " implementation."}
            </p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              {plan.providerId === "mock"
                ? "It rewrites the kernel cmdline and writes a bootconfig manifest so the pipeline can be verified end to end. It does not root a device."
                : "KernelPatch is injected into the kernel image inside boot.img by the upstream kptools build running in WebAssembly. The ramdisk is untouched, the original AVB signature is dropped, and flashing the result is your responsibility."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patch plan</CardTitle>
            <CardDescription>
              Provider, release and artifact are pinned so the same plan can be reproduced later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KeyValueList entries={planEntries} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Plan configuration passed to the provider.</CardDescription>
            </CardHeader>
            <CardContent>
              <KeyValueList entries={configurationEntries} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>The stages executed inside the Web Worker.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1.5">
                {plan.steps.map((step) => (
                  <li key={step.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-foreground">{step.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{step.progress}%</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t border-border pt-1.5 text-xs">
                  <span className="font-medium text-foreground">Complete</span>
                  <span className="font-mono text-[11px] text-muted-foreground">100%</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {planResponse.providerNotes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Provider notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {planResponse.providerNotes.map((note) => (
                <li key={note} className="text-[11px] leading-4 text-muted-foreground">
                  {note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {plan.providerId === "apatch" ? (
        <Card>
          <CardHeader>
            <CardTitle>KernelPatch flavour</CardTitle>
            <CardDescription>
              Which core image is injected. Each build only trusts its own manager app, so the
              manager below must be installed for the patch to be usable.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Select
                aria-label="KernelPatch flavour"
                className="max-w-xs"
                value={readOption(APATCH_FLAVOR_SETTING, "upstream")}
                onChange={(event) => applyOption({ [APATCH_FLAVOR_SETTING]: event.target.value })}
              >
                {APATCH_FLAVORS.map((flavor) => (
                  <option key={flavor.id} value={flavor.id}>
                    {flavor.label}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {APATCH_FLAVORS.find((flavor) => flavor.id === readOption(APATCH_FLAVOR_SETTING, "upstream"))
                  ?.source ?? ""}
              </p>
            </div>
            <p className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
              required manager
              <br />
              <span className="text-foreground">
                {APATCH_FLAVORS.find((flavor) => flavor.id === readOption(APATCH_FLAVOR_SETTING, "upstream"))
                  ?.managerPackage ?? "unknown"}
              </span>
            </p>
          </CardContent>
        </Card>
      ) : null}

      {plan.providerId === "apatch" ? (
        <Card>
          <CardHeader>
            <CardTitle>KernelPatch modules (KPM)</CardTitle>
            <CardDescription>
              Optional. Each module is embedded into the patched kernel image. The bytes stay in your
              browser and are only handed to the patch worker for this run; the plan records the names.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={kpmInputRef}
                type="file"
                multiple
                accept=".kpm"
                className="hidden"
                onChange={(event) => void handleAttachmentSelection(event)}
              />
              <Button variant="secondary" onClick={() => kpmInputRef.current?.click()}>
                <Layers />
                Attach .kpm files
              </Button>
              <Badge
                variant={
                  plan.configuration.kpmModules !== undefined && plan.configuration.kpmModules !== "none"
                    ? "primary"
                    : "neutral"
                }
              >
                {plan.configuration.kpmModules === undefined || plan.configuration.kpmModules === "none"
                  ? "plan: no modules"
                  : "plan: " + plan.configuration.kpmModules}
              </Badge>
              {attachments.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => void setAttachments([])}>
                  Clear
                </Button>
              ) : null}
            </div>
            {attachments.length > 0 ? (
              <ul className="space-y-1">
                {attachments.map((file) => (
                  <li key={file.name} className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[11px] text-foreground">{file.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {formatBytes(file.bytes.length)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[11px] leading-4 text-muted-foreground">
              Modules are embedded exactly as provided. Whether a module loads at boot depends on the
              module and the kernel, and its licence is yours to check.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {plan.providerId === "kernelsu" ? (
        <Card>
          <CardHeader>
            <CardTitle>Device KMI and module</CardTitle>
            <CardDescription>
              The KernelSU module has to match the kernel module interface of the device. It can only be
              read from an image that carries a kernel, so an init_boot image needs it selected here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select
              aria-label="Kernel module interface"
              className="max-w-xs"
              value={chosenKmi()}
              onChange={(event) => applyOption({ [KERNELSU_KMI_SETTING]: event.target.value })}
            >
              <option value="">select the device KMI</option>
              {KNOWN_KMIS.map((kmi) => (
                <option key={kmi} value={kmi}>
                  {kmi}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={kpmInputRef}
                type="file"
                accept=".ko"
                className="hidden"
                onChange={(event) => void handleAttachmentSelection(event)}
              />
              <Button variant="secondary" onClick={() => kpmInputRef.current?.click()}>
                <Layers />
                {chosenKmi() === "" ? "Override the bundled module" : "Override with " + chosenKmi() + "_kernelsu.ko"}
              </Button>
              <Badge variant={attachments.length > 0 ? "primary" : "neutral"}>
                {attachments.length === 0
                  ? "plan: no module attached"
                  : "plan: " + (plan.configuration.moduleSource ?? "module attached")}
              </Badge>
              {attachments.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => void setAttachments([])}>
                  Clear
                </Button>
              ) : null}
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">
              This build already ships the module for the selected KMI and uses it by default; attaching one
              (named <code className="mx-1">{chosenKmi() === "" ? "{kmi}_kernelsu.ko" : chosenKmi() + "_kernelsu.ko"}</code>
              ) overrides it. Find the KMI with
              <code className="mx-1">uname -r</code> on the device: 6.6.118-android15-... means android15-6.6.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {plan.providerId === "magisk" ? (
        <Card>
          <CardHeader>
            <CardTitle>Magisk options</CardTitle>
            <CardDescription>
              These are what Magisk reads at boot from .backup/.magisk.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Keep verity (KEEPVERITY)</p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                On keeps verity enabled and leaves fstab alone. Off removes magiskboot's verity flags
                from any fstab entry inside the ramdisk and drops verity_key.
              </p>
            </div>
            <Switch
              aria-label="Keep verity"
              checked={readOption(MAGISK_KEEP_VERITY_SETTING, "true") === "true"}
              onCheckedChange={(checked) =>
                applyOption({ [MAGISK_KEEP_VERITY_SETTING]: String(checked) })
              }
            />
          </CardContent>
          <CardContent className="flex items-start justify-between gap-4 border-t border-border/60 pt-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                Keep forced encryption (KEEPFORCEENCRYPT)
              </p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                On keeps forced encryption and leaves fstab alone. Off removes the encryption flags
                magiskboot removes (forceencrypt, forcefdeorfbe, fileencryption).
              </p>
            </div>
            <Switch
              aria-label="Keep forced encryption"
              checked={readOption(MAGISK_KEEP_FORCE_ENCRYPT_SETTING, "true") === "true"}
              onCheckedChange={(checked) =>
                applyOption({ [MAGISK_KEEP_FORCE_ENCRYPT_SETTING]: String(checked) })
              }
            />
          </CardContent>
          <CardContent className="space-y-2 border-t border-border/60 pt-4">
            <p className="text-xs font-medium text-foreground">
              Pre-init storage (PREINITDEVICE)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Pre-init storage partition"
                className="max-w-xs"
                placeholder={plan.configuration.preinitDevice === "auto" ? "auto (Magisk detects it)" : ""}
                value={preinitDraft}
                onChange={(event) => setPreinitDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyOption({ [MAGISK_PREINIT_DEVICE_SETTING]: preinitDraft.trim() });
                }}
              />
              <Button
                variant="secondary"
                onClick={() => applyOption({ [MAGISK_PREINIT_DEVICE_SETTING]: preinitDraft.trim() })}
              >
                Apply
              </Button>
              <Badge variant={plan.configuration.preinitDevice === "auto" ? "neutral" : "primary"}>
                plan: {plan.configuration.preinitDevice ?? "auto"}
              </Badge>
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Read it on the device with <code className="mx-1">magisk --preinit-device</code>, for
              example sda10. Leaving it empty lets Magisk detect it at boot.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {plan.providerId === "apatch" ? (
        <Card>
          <CardHeader>
            <CardTitle>Root credentials</CardTitle>
            <CardDescription>
              Optional. Without a key the injected KernelPatch authenticates the manager by its
              signature. With one, the key is hashed into the kernel so an authorised client can
              use it and rotate it at runtime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                aria-label="Root superkey"
                className="max-w-xs"
                placeholder={
                  plan.configuration.superkeyMode === "custom" ? "a superkey is set" : "no superkey (default)"
                }
                value={superkeyDraft}
                onChange={(event) => setSuperkeyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyOption({ superkey: superkeyDraft });
                }}
              />
              <Button variant="secondary" onClick={() => applyOption({ superkey: superkeyDraft })}>
                Apply
              </Button>
              <Badge variant={plan.configuration.superkeyMode === "custom" ? "success" : "neutral"}>
                plan: {plan.configuration.superkeyMode ?? "none"}
              </Badge>
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">
              The key is sent to the patch worker for this run only. Only its SHA-256 is written
              into the kernel; the plan, the metadata and the produced image never contain the key
              itself. Leave the field empty and apply to go back to the signature default.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>
            Device images are usually whole-partition dumps, so only the boot image itself is kept by
            default.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Preserve the original image size</p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Zero pads the output to {formatBytes(analysis.summary.totalSize)} so tools that expect a
              partition sized image keep their file size. The AVB signature stays invalid either way.
            </p>
          </div>
          <Switch
            aria-label="Preserve the original image size"
            checked={readOption("preserveImageSize", "false") === "true"}
            onCheckedChange={(checked) => applyOption({ preserveImageSize: String(checked) })}
          />
        </CardContent>
        <CardContent className="flex items-start justify-between gap-4 border-t border-border/60 pt-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Keep the original AVB bytes</p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              The official patchers keep the signature area of the source image. Those bytes are stale
              after a patch either way, so verified boot fails with or without them; turn this off to
              leave the area empty instead.
            </p>
          </div>
          <Switch
            aria-label="Keep the original AVB bytes"
            checked={readOption("keepSignature", "true") === "true"}
            onCheckedChange={(checked) => applyOption({ keepSignature: String(checked) })}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate("/analyze")}>
          <ArrowLeft />
          Back to analysis
        </Button>
        <Button variant="primary" disabled={isBusy} onClick={() => navigate("/processing")}>
          {isBusy ? <LoaderCircle className="animate-spin" /> : <Play />}
          Start patch
        </Button>
      </div>
    </div>
  );
}
