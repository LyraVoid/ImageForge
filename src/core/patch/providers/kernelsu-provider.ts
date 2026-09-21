import type { ArtifactRegistry } from "../../artifacts/registry";
import { KERNELSU_KSUINIT_ID } from "../../artifacts/catalog";
import { AbortedError, IncompatibleProviderError, PatchError } from "../../errors";
import { sha256Hex } from "../../hash";
import {
  COMPRESSION_LABEL,
  decodeRamdisk,
  decompressSection,
  describeCompression,
  encodeRamdisk,
  findEntry,
  isPayloadUsable,
  kmiFromRelease,
  parseImage,
  readKernelRelease,
  readModuleInfo,
  removeEntry,
  renameEntry,
  repackBootImage,
  sectionOf,
  upsertEntry,
  verifyImage,
} from "../../image";
import type { CompressionDescriptor, CpioArchive, ParsedImage, VerifyExpectations } from "../../image";
import type {
  PatchAnalysis,
  PatchOptions,
  PatchPlan,
  PatchPlanContext,
  PatchPlanStep,
  PatchProvider,
  PatchResult,
  PatchRunContext,
  PatchVerificationResult,
} from "../types";

/** Plan configuration key holding the device KMI, for example android15-6.6. */
export const KERNELSU_KMI_SETTING = "kmi";

/** Plan configuration key holding extra ksud flags, for example "norc=1 allow_shell=1". */
export const KERNELSU_CONFIG_SETTING = "ksuConfig";

/** Entry names, exactly as ksud writes them. */
export const KERNELSU_INIT_ENTRY = "init";
export const KERNELSU_INIT_BACKUP_ENTRY = "init.real";
export const KERNELSU_MODULE_ENTRY = "kernelsu.ko";
export const KERNELSU_CONFIG_ENTRY = "ksu_config";

export const KERNELSU_REQUIRED_MANAGER = "me.weishu.kernelsu";

/**
 * The KMI a plan pins, or an empty string when it has not been chosen yet. The plan stores the
 * sentinel "unset" so it can be displayed, but nothing outside the plan should ever have to know
 * that: this turns it back into "not chosen".
 */
export function plannedKmi(configuration: Record<string, string> | undefined): string {
  const value = (configuration?.[KERNELSU_KMI_SETTING] ?? "").trim();
  return value === "unset" || value === "none" ? "" : value;
}
export const KERNELSU_MODULE_NAME = "kernelsu";

/**
 * Magisk's ramdisk layout, from its own scripts/boot_patch.sh: it puts its payload under
 * overlay.d/ and keeps its configuration in .backup/.magisk. ksud refuses to patch such an
 * image and so does this provider.
 */
function findMagiskMarker(archive: CpioArchive): string | undefined {
  for (const entry of archive.entries) {
    if (entry.name === ".backup/.magisk" || entry.name === "overlay.d" || entry.name.startsWith("overlay.d/")) {
      return entry.name;
    }
  }
  return undefined;
}

const PLAN_STEPS: PatchPlanStep[] = [
  { id: "analyze", label: "Read the boot image", progress: 5 },
  { id: "extract", label: "Expand the ramdisk", progress: 20 },
  { id: "prepare", label: "Check the ramdisk and the module", progress: 40 },
  { id: "patch", label: "Rewrite the ramdisk", progress: 60 },
  { id: "repack", label: "Repack the boot image", progress: 80 },
  { id: "verify", label: "Verify the produced image", progress: 95 },
];

function readFlags(value: string | undefined): string[] {
  const raw = (value ?? "").trim();
  if (raw === "" || raw === "none") return [];
  return raw.split(/[,\s]+/).filter((flag) => flag !== "");
}

async function computePlanId(plan: PatchPlan): Promise<string> {
  const canonical = [
    "provider=" + plan.providerId,
    "release=" + plan.release,
    "artifact=" + plan.artifact.id,
    "target=" + plan.target,
    "headerVersion=" + String(plan.headerVersion),
    "source=" + plan.sourceImageSha256,
    ...Object.keys(plan.configuration)
      .sort()
      .map((key) => key + "=" + plan.configuration[key]),
  ].join("\n");
  return (await sha256Hex(new TextEncoder().encode(canonical))).slice(0, 32);
}

export class KernelsuPatchProvider implements PatchProvider {
  readonly id = "kernelsu";
  readonly name = "KernelSU";
  private readonly artifacts: ArtifactRegistry;

  constructor(artifacts: ArtifactRegistry) {
    this.artifacts = artifacts;
  }

  async analyze(_image: ParsedImage): Promise<PatchAnalysis> {
    return {
      providerId: this.id,
      summary:
        "Replaces the ramdisk init with the KernelSU init wrapper and adds the KernelSU loadable module, exactly as ksud does.",
      supportedTargets: ["boot", "init_boot"],
      notes: [
        "The ramdisk is modified: on GKI Android 13+ that is init_boot.img, otherwise a boot.img that carries a ramdisk.",
        "The loadable module has to match the device KMI (for example android15-6.6) and is supplied by the user; it is verified before use.",
        "A ramdisk that Magisk already patched is refused.",
        "Vendor boot images with a ramdisk table are not supported yet.",
        "The KernelSU manager app (me.weishu.kernelsu) has to be installed for the produced image to be usable.",
      ],
    };
  }

  private loadRamdisk(image: ParsedImage): { bytes: Uint8Array; descriptor: CompressionDescriptor } {
    if (image.format === "vendor_boot") {
      throw new IncompatibleProviderError(
        "This provider cannot write vendor boot ramdisks yet.",
        "Vendor boot images with a ramdisk table are not supported by the KernelSU provider yet.",
      );
    }
    const ramdisk = sectionOf(image, "ramdisk");
    if (!ramdisk || ramdisk.size === 0) {
      throw new IncompatibleProviderError(
        "The image has no ramdisk section, so KernelSU has nothing to replace.",
        "This image carries no ramdisk, so KernelSU cannot be installed into it.",
      );
    }
    const descriptor = describeCompression(ramdisk.data);
    if (!isPayloadUsable(descriptor.format)) {
      throw new IncompatibleProviderError(
        "Ramdisk compression is " + COMPRESSION_LABEL[descriptor.format] + ".",
        "This build cannot expand that ramdisk compression, so the ramdisk cannot be rewritten safely.",
      );
    }
    return { bytes: ramdisk.data, descriptor };
  }

  /**
   * The KMI comes from the option when given, otherwise from the kernel banner of the image.
   * When the image carries a kernel the two must agree: a module for another KMI will not load
   * and the device would not boot.
   */
  private async resolveKmi(
    image: ParsedImage,
    options: PatchOptions,
  ): Promise<{ kmi: string; source: string }> {
    const selected = (options.configuration?.[KERNELSU_KMI_SETTING] ?? "").trim();
    const kernel = sectionOf(image, "kernel");
    let detected: string | undefined;
    if (kernel && kernel.size > 0) {
      const descriptor = describeCompression(kernel.data);
      if (isPayloadUsable(descriptor.format)) {
        const raw = await decompressSection(kernel.data, descriptor);
        const release = readKernelRelease(raw);
        if (release) detected = kmiFromRelease(release);
      }
    }

    // A kernel in the image is authoritative: it is the kernel the module has to load into.
    if (detected !== undefined) {
      return {
        kmi: detected,
        source:
          selected === "" || selected === detected
            ? "detected from the kernel banner"
            : "detected from the kernel banner; the selection " + selected + " was ignored",
      };
    }
    // init_boot.img carries no kernel, so there the selection is the only source. Leaving it
    // unset is allowed here: the plan says so, and the patch refuses to run until it is chosen.
    if (selected !== "") {
      return { kmi: selected, source: "selected (this image carries no kernel to detect one from)" };
    }
    return { kmi: "unset", source: "not selected" };
  }

  async resolve(
    image: ParsedImage,
    options: PatchOptions,
    sourceImageSha256: string,
    planContext?: PatchPlanContext,
  ): Promise<PatchPlan> {
    const ramdisk = this.loadRamdisk(image);
    const ksuinit = this.artifacts.resolve({ providerId: this.id, artifactId: KERNELSU_KSUINIT_ID });
    const kmi = await this.resolveKmi(image, options);

    const carriedModules = planContext?.attachmentNames ?? [];
    const plannedModules = carriedModules.length > 0 ? carriedModules : readFlags(options.configuration?.["modules"]);
    const configFlags = readFlags(options.configuration?.[KERNELSU_CONFIG_SETTING]);
    const preserveImageSize = (options.configuration?.preserveImageSize ?? "false") === "true";

    const plan: PatchPlan = {
      id: "",
      providerId: this.id,
      providerName: this.name,
      release: ksuinit.release.release,
      artifact: ksuinit.artifact,
      architecture: image.architecture ?? "unknown",
      target: image.format === "boot" ? "boot" : "init_boot",
      headerVersion: image.headerVersion,
      pageSize: image.pageSize,
      sourceImageSha256,
      configuration: {
        ...(options.configuration ?? {}),
        injection: "ramdisk",
        kmi: kmi.kmi,
        kmiSource: kmi.source,
        initEntry: KERNELSU_INIT_ENTRY,
        initBackupEntry: KERNELSU_INIT_BACKUP_ENTRY,
        moduleEntry: KERNELSU_MODULE_ENTRY,
        moduleSource: plannedModules.length === 0 ? "none" : plannedModules.join(","),
        ksuConfig: configFlags.length === 0 ? "none" : configFlags.join(" "),
        requiredManager: KERNELSU_REQUIRED_MANAGER,
        ramdiskCompression: COMPRESSION_LABEL[ramdisk.descriptor.format],
        ramdiskSectionSize: String(ramdisk.bytes.length),
        preserveImageSize: preserveImageSize ? "true" : "false",
      },
      steps: PLAN_STEPS.map((step) => ({ ...step })),
      createdAt: new Date().toISOString(),
      reproducible: true,
      notes: [
        "The kernel is left untouched: only the ramdisk changes.",
        "init is renamed to init.real and a KernelSU init wrapper takes its place, so the stock init still runs after the wrapper.",
        kmi.kmi === "unset"
          ? "No device KMI is selected yet. Pick it on the patch page before starting: init_boot.img carries no kernel, so it cannot be read from the image."
          : "The KMI is " + kmi.kmi + " (" + kmi.source + ").",
        plannedModules.length === 0
          ? "No KernelSU module is attached yet: attach the {kmi}_kernelsu.ko file that matches this KMI before starting the patch."
          : "The attached module " +
            plannedModules.join(", ") +
            " is written to the ramdisk as " +
            KERNELSU_MODULE_ENTRY +
            ". Its licence is the user's responsibility (KernelSU's kernel directory is GPL-2.0-only).",
        "A ramdisk that Magisk already patched is refused, like ksud does.",
        "Reproducible for the pinned ksuinit artifact: the same input and module yield the same ramdisk.",
      ],
    };
    plan.id = await computePlanId(plan);
    return plan;
  }

  async patch(image: ParsedImage, plan: PatchPlan, context: PatchRunContext): Promise<PatchResult> {
    const emit = (stage: PatchPlanStep["id"] | "complete", progress: number, message: string): void => {
      if (context.signal?.aborted) throw new AbortedError();
      context.onProgress?.({ stage: stage as never, progress, message });
    };

    if (plan.providerId !== this.id) {
      throw new PatchError("This plan belongs to " + plan.providerId + ".", "Internal plan mismatch.");
    }

    const ramdisk = this.loadRamdisk(image);
    emit("extract", 20, "Expanding the ramdisk");
    const decoded = await decodeRamdisk(ramdisk.bytes);
    const archive = decoded.archive;
    const entriesBefore = archive.entries.length;

    emit("prepare", 40, "Checking the ramdisk and the module");
    const magisk = findMagiskMarker(archive);
    if (magisk !== undefined) {
      throw new PatchError(
        "The ramdisk already contains Magisk (" + magisk + ").",
        "KernelSU refuses to patch a ramdisk that Magisk already patched.",
      );
    }

    const attachments = context.attachments ?? [];
    const planned = (plan.configuration.moduleSource ?? "none") === "none"
      ? []
      : (plan.configuration.moduleSource ?? "").split(",").filter((name) => name !== "");
    if (planned.length === 0) {
      throw new PatchError(
        "The plan does not pin a KernelSU module, so there is nothing to embed.",
        "Attach the module that matches the device KMI and plan again.",
      );
    }
    for (const attachment of attachments) {
      if (!planned.includes(attachment.name)) {
        throw new PatchError(
          "Attachment " + attachment.name + " is not part of the plan (" + planned.join(", ") + ").",
          "Re-plan after attaching or removing the KernelSU module.",
        );
      }
    }
    const module = attachments[0];
    if (!module) {
      throw new PatchError(
        "The KernelSU module was planned but no module was attached to this run.",
        "Attach the module that matches the device KMI and try again.",
      );
    }

    const moduleInfo = readModuleInfo(module.bytes);
    if (moduleInfo.name !== KERNELSU_MODULE_NAME) {
      throw new PatchError(
        "The attached module declares name=" + String(moduleInfo.name) + " instead of " + KERNELSU_MODULE_NAME + ".",
        "That file is not a KernelSU loadable module.",
      );
    }

    // The KMI pins the kernel version, and a module records the version it was built against in
    // its vermagic. Comparing them catches a module picked for the wrong KMI, which would not
    // load and would leave the device unable to boot.
    const kmiValue = plannedKmi(plan.configuration);
    if (kmiValue === "") {
      throw new PatchError(
        "This plan has no device KMI.",
        "Select the device KMI (for example android15-6.6) before starting the patch.",
      );
    }
    const kmiVersion = kmiValue.includes("-") ? (kmiValue.split("-")[1] ?? "") : "";
    const moduleKernel = (moduleInfo.vermagic ?? "").split(" ")[0] ?? "";
    if (kmiVersion !== "" && moduleKernel !== "" && !moduleKernel.startsWith(kmiVersion + ".")) {
      throw new PatchError(
        "The attached module was built for kernel " +
          moduleKernel +
          " but the KMI " +
          kmiValue +
          " means kernel " +
          kmiVersion +
          ".",
        "The module does not match the selected KMI (" + kmiValue + ").",
      );
    }

    const ksuinitBytes = await this.artifacts.loadVerifiedPayload(plan.artifact);

    emit("patch", 60, "Rewriting the ramdisk");
    const alreadyPatched = findEntry(archive, KERNELSU_MODULE_ENTRY) !== undefined;
    let initBackup: string;
    if (!alreadyPatched) {
      if (findEntry(archive, KERNELSU_INIT_ENTRY)) {
        if (!renameEntry(archive, KERNELSU_INIT_ENTRY, KERNELSU_INIT_BACKUP_ENTRY)) {
          throw new PatchError(
            KERNELSU_INIT_BACKUP_ENTRY + " already exists, so the original init cannot be kept.",
            "This ramdisk looks like it was already modified by another tool.",
          );
        }
        initBackup = "init renamed to " + KERNELSU_INIT_BACKUP_ENTRY;
      } else {
        initBackup = "no init in the ramdisk";
      }
    } else {
      initBackup = "already patched, kept the existing " + KERNELSU_INIT_BACKUP_ENTRY;
    }

    upsertEntry(archive, KERNELSU_INIT_ENTRY, ksuinitBytes, 0o100755);
    upsertEntry(archive, KERNELSU_MODULE_ENTRY, module.bytes, 0o100755);

    const configFlags = readFlags(plan.configuration.ksuConfig);
    if (configFlags.length === 0) removeEntry(archive, KERNELSU_CONFIG_ENTRY);
    else upsertEntry(archive, KERNELSU_CONFIG_ENTRY, new TextEncoder().encode(configFlags.join(" ")), 0o100644);
    // ksud removes this legacy marker; keeping it would confuse a later restore.
    removeEntry(archive, "allow_shell");

    emit("repack", 80, "Repacking the boot image");
    const encoded = await encodeRamdisk(archive, decoded.descriptor);
    const outcome = repackBootImage({
      image,
      ramdisk: encoded,
      ...(plan.configuration.preserveImageSize === "true" ? { padTo: image.totalSize } : {}),
    });
    const sha256 = await sha256Hex(outcome.bytes);
    const moduleSha256 = await sha256Hex(module.bytes);
    const ksuinitSha256 = await sha256Hex(ksuinitBytes);
    const ramdiskSectionSha256 = await sha256Hex(encoded);

    return {
      plan,
      bytes: outcome.bytes,
      sha256,
      sizeBytes: outcome.bytes.length,
      warnings: [
        ...outcome.warnings,
        initBackup === "no init in the ramdisk"
          ? "The ramdisk has no init entry, so the wrapper cannot hand over to the stock init."
          : "KernelSU patches the ramdisk only; flashing this image is the user's responsibility and ImageForge never flashes devices.",
      ],
      metadata: {
        provider: plan.providerId,
        providerName: plan.providerName,
        release: plan.release,
        artifact: plan.artifact.id,
        artifactVersion: plan.artifact.version,
        artifactSha256: plan.artifact.sha256 ?? "unknown",
        ksuinitSha256,
        kmi: plan.configuration.kmi ?? "unknown",
        kmiSource: plan.configuration.kmiSource ?? "unknown",
        moduleEntry: KERNELSU_MODULE_ENTRY,
        moduleSource: module.name,
        moduleSize: String(module.bytes.length),
        moduleSha256,
        moduleDeclaredName: moduleInfo.name ?? "unknown",
        moduleVermagic: moduleInfo.vermagic ?? "unknown",
        moduleLicense: moduleInfo.license ?? "unknown",
        moduleParameters: moduleInfo.parameters.length === 0 ? "none" : moduleInfo.parameters.join(","),
        initEntry: KERNELSU_INIT_ENTRY,
        initBackup,
        ksuConfig: plan.configuration.ksuConfig ?? "none",
        requiredManager: KERNELSU_REQUIRED_MANAGER,
        archiveEntriesBefore: String(entriesBefore),
        archiveEntriesAfter: String(archive.entries.length),
        ramdiskCompression: COMPRESSION_LABEL[ramdisk.descriptor.format],
        ramdiskSectionSizeBefore: String(ramdisk.bytes.length),
        ramdiskSectionSizeAfter: String(encoded.length),
        ramdiskSectionSha256,
        imageSizeBefore: String(image.totalSize),
        imageSizeAfter: String(outcome.bytes.length),
        preserveImageSize: plan.configuration.preserveImageSize ?? "false",
        target: plan.target,
        headerVersion: "v" + plan.headerVersion,
        sourceImageSha256: plan.sourceImageSha256,
        planId: plan.id,
        reproducible: "not verified",
      },
    };
  }

  async verify(result: PatchResult, context?: PatchRunContext): Promise<PatchVerificationResult> {
    if (context?.signal?.aborted) throw new AbortedError();
    const expectations: VerifyExpectations = {
      format: result.plan.target,
      headerVersion: result.plan.headerVersion,
    };
    if (result.metadata.ramdiskSectionSha256) expectations.ramdiskSha256 = result.metadata.ramdiskSectionSha256;
    const verification = await verifyImage(result.bytes, expectations);

    // Content check: the produced ramdisk really has to carry the wrapper and the module.
    const moduleEntry = result.metadata.moduleEntry ?? KERNELSU_MODULE_ENTRY;
    try {
      const image = parseImage(result.bytes);
      const ramdisk = sectionOf(image, "ramdisk");
      if (!ramdisk) {
        verification.valid = false;
        verification.warnings.push("The produced image has no ramdisk section.");
      } else {
        const decoded = await decodeRamdisk(ramdisk.data);
        for (const name of [result.metadata.initEntry ?? KERNELSU_INIT_ENTRY, moduleEntry]) {
          if (!findEntry(decoded.archive, name)) {
            verification.valid = false;
            verification.warnings.push("The produced ramdisk does not contain " + name + ".");
          }
        }
      }
    } catch (error) {
      verification.valid = false;
      verification.warnings.push(
        "The produced ramdisk could not be read back: " + (error instanceof Error ? error.message : String(error)),
      );
    }

    return {
      verification,
      artifactSha256: result.plan.artifact.sha256,
      checks: verification.checks,
    };
  }
}
