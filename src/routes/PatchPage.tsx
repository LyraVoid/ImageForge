import { ArrowLeft, ChevronDown, Info, Layers, LoaderCircle, Play, Settings2, ShieldCheck, Workflow } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import { ErrorPanel } from "@/components/app/error-panel";
import { KeyValueList } from "@/components/app/key-value-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatBytes, truncateHash } from "@/lib/format";
import {
  APATCH_FLAVOR_SETTING,
  APATCH_FLAVORS,
  KERNELSU_KMI_SETTING,
  KERNELSU_DEFAULT_FLAVOR,
  KERNELSU_FLAVORS,
  KERNELSU_FLAVOR_SETTING,
  KNOWN_KMIS,
  MAGISK_DEFAULT_FLAVOR,
  MAGISK_FLAVORS,
  MAGISK_FLAVOR_SETTING,
  MAGISK_KEEP_FORCE_ENCRYPT_SETTING,
  MAGISK_KEEP_VERITY_SETTING,
  MAGISK_PREINIT_DEVICE_SETTING,
  plannedKmi,
} from "@/core";
import { PATCH_ROUTES } from "@/app/tools";
import { useRecordText, useT } from "@/i18n/use-translation";
import type { MessageKey } from "@/i18n";
import { mergePlanOptions } from "@/stores/plan-options";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useForgeStore } from "@/stores/forge-store";

/** What each provider writes, so the banner never describes another provider's work. */
const BANNER_BODY: Record<string, MessageKey> = {
  mock: "patch.banner.mock.body",
  apatch: "patch.banner.apatch.body",
  kernelsu: "patch.banner.kernelsu.body",
  magisk: "patch.banner.magisk.body",
};

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: typeof Info;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PatchPage() {
  const t = useT();
  const record = useRecordText();
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
  const kpimgInputRef = useRef<HTMLInputElement>(null);
  const attachments = useForgeStore((state) => state.attachments);
  const setAttachments = useForgeStore((state) => state.setAttachments);

  const isCustomFlavour = (): boolean =>
    plan !== null && plan.providerId === "apatch" && readOptionFromPlan(plan, APATCH_FLAVOR_SETTING) === "custom";

  const readOption = (key: string, fallback: string): string =>
    optionDraft[key] ?? plan?.configuration[key] ?? fallback;

  function readOptionFromPlan(target: { configuration: Record<string, string> }, key: string): string {
    return optionDraft[key] ?? target.configuration[key] ?? "";
  }

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

  if (!analysis) return <Navigate to={PATCH_ROUTES.image} replace />;
  if (!selectedProviderId) return <Navigate to={PATCH_ROUTES.analyze} replace />;
  if (!planResponse) {
    if (!isBusy) return <Navigate to={PATCH_ROUTES.analyze} replace />;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground shadow-subtle">
        <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
        {t("patch.building")}
      </div>
    );
  }

  const plan = planResponse.plan;
  const candidate = analysis.compatibility.candidates.find((entry) => entry.providerId === selectedProviderId);
  const bannerBody = BANNER_BODY[plan.providerId];
  const flavour = APATCH_FLAVORS.find((entry) => entry.id === readOption(APATCH_FLAVOR_SETTING, "upstream"));

  const planEntries = [
    { key: t("patch.field.provider"), value: plan.providerName + " (" + plan.providerId + ")" },
    { key: t("patch.field.release"), value: plan.release },
    { key: t("patch.field.artifact"), value: plan.artifact.type + " · " + plan.artifact.version },
    { key: t("patch.field.artifactType"), value: plan.artifact.type },
    {
      key: t("patch.field.artifactSha256"),
      value: plan.artifact.sha256 ? truncateHash(plan.artifact.sha256, 24, 12) : t("patch.value.notRecorded"),
    },
    { key: t("patch.field.architecture"), value: plan.architecture },
    { key: t("patch.field.target"), value: plan.target },
    { key: t("patch.field.header"), value: "v" + plan.headerVersion },
    { key: t("patch.field.pageSize"), value: formatBytes(plan.pageSize) },
    { key: t("patch.field.sourceSha256"), value: truncateHash(plan.sourceImageSha256, 24, 12) },
    { key: t("patch.field.planId"), value: plan.id },
    { key: t("patch.field.reproducible"), value: plan.reproducible ? t("patch.value.yes") : t("patch.value.no") },
  ];
  const summaryEntries = [
    { key: t("patch.field.provider"), value: plan.providerName },
    { key: t("patch.field.release"), value: plan.release },
    { key: t("patch.field.artifact"), value: plan.artifact.id + "@" + plan.artifact.version },
    { key: t("patch.field.target"), value: plan.target + " · v" + plan.headerVersion },
    { key: t("patch.field.architecture"), value: plan.architecture },
  ];

  const configurationEntries = Object.entries(plan.configuration).map(([key, value]) => ({
    key,
    label: record(key),
    value: String(value),
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-base font-semibold tracking-tight">{plan.providerName}</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {candidate ? record(candidate.description) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {candidate?.status === "planned" ? (
            <Badge variant="neutral">{t("analyze.method.notAvailable")}</Badge>
          ) : null}
          <Badge variant="outline">{plan.target}</Badge>
          <Badge variant="neutral">v{plan.headerVersion}</Badge>
        </div>
      </div>

      <ErrorPanel error={error} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <div className="rounded-lg border border-info/30 bg-info-muted px-4 py-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">
                  {plan.providerId === "mock"
                    ? t("patch.banner.mock.title")
                    : t("patch.banner.upstream", { provider: plan.providerName })}
                </p>
                {bannerBody ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">{t(bannerBody)}</p>
                ) : null}
              </div>
            </div>
          </div>

          {planResponse.providerNotes.length > 0 ? (
            <SettingsSection icon={Info} title={t("patch.notes")}>
            <ul className="space-y-1.5">
              {planResponse.providerNotes.map((note) => (
                <li key={note} className="text-[11px] leading-4 text-muted-foreground">
                  {record(note)}
                </li>
              ))}
            </ul>
            </SettingsSection>
          ) : null}

      {plan.providerId === "apatch" ? (
        <SettingsSection
          icon={Layers}
          title={t("patch.kpimg.title")}
          description={t("patch.kpimg.description")}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Select
                aria-label={t("patch.kpimg.title")}
                className="max-w-xs"
                value={readOption(APATCH_FLAVOR_SETTING, "upstream")}
                onChange={(event) => applyOption({ [APATCH_FLAVOR_SETTING]: event.target.value })}
              >
                {APATCH_FLAVORS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {record(entry.label)}
                  </option>
                ))}
                <option value="custom">{t("patch.kpimg.custom")}</option>
              </Select>
              {isCustomFlavour() ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    ref={kpimgInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => void handleAttachmentSelection(event)}
                  />
                  <Button variant="secondary" size="sm" onClick={() => kpimgInputRef.current?.click()}>
                    <Layers />
                    {t("patch.kpimg.attach")}
                  </Button>
                  <Badge variant={attachments.length > 0 ? "primary" : "neutral"}>
                    {attachments.length === 0
                      ? t("patch.kpimg.none")
                      : (plan.configuration.kernelPatchSource ?? t("patch.kpimg.attached"))}
                  </Badge>
                  {attachments.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => void setAttachments([])}>
                      {t("common.clear")}
                    </Button>
                  ) : null}
                  <p className="w-full text-[11px] leading-4 text-muted-foreground">{t("patch.kpimg.hint")}</p>
                </div>
              ) : (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {flavour ? record(flavour.source) : ""}
                </p>
              )}
            </div>
            <p className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
              {t("patch.kpimg.requiredManager")}
              <br />
              <span className="text-foreground">
                {isCustomFlavour() ? t("patch.kpimg.unknownManager") : (flavour?.managerPackage ?? t("patch.kpimg.unknownManager"))}
              </span>
            </p>
          </div>
        </SettingsSection>
      ) : null}

      {plan.providerId === "apatch" ? (
        <SettingsSection
          icon={Layers}
          title={t("patch.kpm.title")}
          description={t("patch.kpm.description")}
        >
          <div className="space-y-2">
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
                {t("patch.kpm.attach")}
              </Button>
              <Badge
                variant={
                  plan.configuration.kpmModules !== undefined && plan.configuration.kpmModules !== "none"
                    ? "primary"
                    : "neutral"
                }
              >
                {plan.configuration.kpmModules === undefined || plan.configuration.kpmModules === "none"
                  ? t("patch.kpm.none")
                  : t("patch.planValue", { value: plan.configuration.kpmModules })}
              </Badge>
              {attachments.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => void setAttachments([])}>
                  {t("common.clear")}
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
            <p className="text-[11px] leading-4 text-muted-foreground">{t("patch.kpm.hint")}</p>
          </div>
        </SettingsSection>
      ) : null}

      {plan.providerId === "kernelsu" ? (
        <SettingsSection
          icon={Layers}
          title={t("patch.kernelsu.title")}
          description={t("patch.kernelsu.description")}
        >
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">{t("patch.kernelsu.manager")}</p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {t("patch.kernelsu.manager.description")}
              </p>
              <Select
                aria-label={t("patch.kernelsu.manager")}
                className="max-w-xs"
                value={readOption(KERNELSU_FLAVOR_SETTING, KERNELSU_DEFAULT_FLAVOR)}
                onChange={(event) => applyOption({ [KERNELSU_FLAVOR_SETTING]: event.target.value })}
              >
                {KERNELSU_FLAVORS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {record(entry.label) + " · " + record(entry.source)}
                  </option>
                ))}
              </Select>
            </div>
            <Select
              aria-label={t("patch.kernelsu.title")}
              className="max-w-xs"
              value={chosenKmi()}
              onChange={(event) => applyOption({ [KERNELSU_KMI_SETTING]: event.target.value })}
            >
              <option value="">{t("patch.kernelsu.selectKmi")}</option>
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
                {chosenKmi() === ""
                  ? t("patch.kernelsu.override")
                  : t("patch.kernelsu.overrideWith", { name: chosenKmi() + "_kernelsu.ko" })}
              </Button>
              <Badge variant={attachments.length > 0 ? "primary" : "neutral"}>
                {attachments.length === 0
                  ? t("patch.kernelsu.noModule")
                  : t("patch.planValue", { value: plan.configuration.moduleSource ?? "" })}
              </Badge>
              {attachments.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => void setAttachments([])}>
                  {t("common.clear")}
                </Button>
              ) : null}
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">
              {t("patch.kernelsu.hint.before")}
              <code className="mx-1">
                {chosenKmi() === "" ? "{kmi}_kernelsu.ko" : chosenKmi() + "_kernelsu.ko"}
              </code>
              {t("patch.kernelsu.hint.after")}
              <code className="mx-1">uname -r</code>
              {t("patch.kernelsu.hint.tail")}
            </p>
          </div>
        </SettingsSection>
      ) : null}

      {plan.providerId === "magisk" ? (
        <SettingsSection
          icon={Settings2}
          title={t("patch.magisk.title")}
          description={t("patch.magisk.description")}
        >
          <div className="divide-y divide-border">
          <div className="space-y-1 py-3 first:pt-0">
            <p className="text-xs font-medium text-foreground">{t("patch.magisk.flavor")}</p>
            <p className="text-[11px] leading-4 text-muted-foreground">{t("patch.magisk.flavor.description")}</p>
            <Select
              aria-label={t("patch.magisk.flavor")}
              className="mt-1 max-w-xs"
              value={readOption(MAGISK_FLAVOR_SETTING, MAGISK_DEFAULT_FLAVOR)}
              onChange={(event) => applyOption({ [MAGISK_FLAVOR_SETTING]: event.target.value })}
            >
              {MAGISK_FLAVORS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {record(entry.label) + " · " + record(entry.source)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">{t("patch.magisk.keepVerity")}</p>
              <p className="text-[11px] leading-4 text-muted-foreground">{t("patch.magisk.keepVerity.body")}</p>
            </div>
            <Switch
              aria-label={t("patch.magisk.keepVerity")}
              checked={readOption(MAGISK_KEEP_VERITY_SETTING, "true") === "true"}
              onCheckedChange={(checked) =>
                applyOption({ [MAGISK_KEEP_VERITY_SETTING]: String(checked) })
              }
            />
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">{t("patch.magisk.keepForceEncrypt")}</p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {t("patch.magisk.keepForceEncrypt.body")}
              </p>
            </div>
            <Switch
              aria-label={t("patch.magisk.keepForceEncrypt")}
              checked={readOption(MAGISK_KEEP_FORCE_ENCRYPT_SETTING, "true") === "true"}
              onCheckedChange={(checked) =>
                applyOption({ [MAGISK_KEEP_FORCE_ENCRYPT_SETTING]: String(checked) })
              }
            />
          </div>
          <div className="space-y-2 py-3 last:pb-0">
            <p className="text-xs font-medium text-foreground">{t("patch.magisk.preinit")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={t("patch.magisk.preinit")}
                className="max-w-xs"
                placeholder={plan.configuration.preinitDevice === "auto" ? t("patch.magisk.preinit.placeholder") : ""}
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
                {t("common.apply")}
              </Button>
              <Badge variant={plan.configuration.preinitDevice === "auto" ? "neutral" : "primary"}>
                {t("patch.planValue", { value: plan.configuration.preinitDevice ?? "auto" })}
              </Badge>
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">
              {t("patch.magisk.preinit.hint.before")}
              <code className="mx-1">magisk --preinit-device</code>
              {t("patch.magisk.preinit.hint.after")}
            </p>
          </div>
          </div>
        </SettingsSection>
      ) : null}

      {plan.providerId === "apatch" ? (
        <SettingsSection
          icon={ShieldCheck}
          title={t("patch.superkey.title")}
          description={t("patch.superkey.description")}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                aria-label={t("patch.superkey.title")}
                className="max-w-xs"
                placeholder={
                  plan.configuration.superkeyMode === "custom"
                    ? t("patch.superkey.placeholder.set")
                    : t("patch.superkey.placeholder.none")
                }
                value={superkeyDraft}
                onChange={(event) => setSuperkeyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyOption({ superkey: superkeyDraft });
                }}
              />
              <Button variant="secondary" onClick={() => applyOption({ superkey: superkeyDraft })}>
                {t("common.apply")}
              </Button>
              <Badge variant={plan.configuration.superkeyMode === "custom" ? "success" : "neutral"}>
                {t("patch.planValue", { value: plan.configuration.superkeyMode ?? t("patch.value.none") })}
              </Badge>
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">{t("patch.superkey.hint")}</p>
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection
        icon={Settings2}
        title={t("patch.output.title")}
        description={t("patch.output.description")}
      >
        <div className="divide-y divide-border">
        <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">{t("patch.output.preserve")}</p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              {t("patch.output.preserve.body", { size: formatBytes(analysis.summary.totalSize) })}
            </p>
          </div>
          <Switch
            aria-label={t("patch.output.preserve")}
            checked={readOption("preserveImageSize", "false") === "true"}
            onCheckedChange={(checked) => applyOption({ preserveImageSize: String(checked) })}
          />
        </div>
        <div className="flex items-start justify-between gap-4 py-3 last:pb-0">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">{t("patch.output.keepSignature")}</p>
            <p className="text-[11px] leading-4 text-muted-foreground">{t("patch.output.keepSignature.body")}</p>
          </div>
          <Switch
            aria-label={t("patch.output.keepSignature")}
            checked={readOption("keepSignature", "true") === "true"}
            onCheckedChange={(checked) => applyOption({ keepSignature: String(checked) })}
          />
        </div>
        </div>
      </SettingsSection>

        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
            <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">{t("patch.plan")}</h2>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("patch.plan.description")}</p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-success-muted text-success">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
            </header>
            <div className="p-4">
              <KeyValueList entries={summaryEntries} stacked />

              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={isBusy}
                  onClick={() => navigate(PATCH_ROUTES.run)}
                >
                  {isBusy ? <LoaderCircle className="animate-spin" /> : <Play />}
                  {t("patch.start")}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate(PATCH_ROUTES.analyze)}
                >
                  <ArrowLeft />
                  {t("patch.back")}
                </Button>
              </div>
            </div>
          </section>

          <details className="group overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
            <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
              <Settings2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-tight">{t("patch.configuration")}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {t("patch.configuration.description")}
                </span>
              </span>
              <ChevronDown
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="space-y-5 border-t border-border p-4">
              <div>
                <h3 className="text-xs font-semibold tracking-tight">{t("patch.plan.details")}</h3>
                <div className="mt-2">
                  <KeyValueList entries={planEntries} />
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold tracking-tight">{t("patch.configuration")}</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {t("patch.configuration.description")}
                </p>
                <div className="mt-2">
                  <KeyValueList entries={configurationEntries} />
                </div>
              </div>
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-tight">
                  <Workflow className="size-3.5 text-muted-foreground" aria-hidden />
                  {t("patch.pipeline")}
                </h3>
                <ol className="mt-2 space-y-1.5">
                  {plan.steps.map((step) => (
                    <li key={step.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-foreground">{record(step.label)}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{step.progress}%</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 border-t border-border pt-1.5 text-xs">
                    <span className="font-medium text-foreground">{t("patch.pipeline.complete")}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">100%</span>
                  </li>
                </ol>
              </div>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
