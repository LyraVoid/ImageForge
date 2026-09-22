import type { ArtifactRegistry } from "../../artifacts/registry";
import {
  MAGISK_INIT_LD_XZ_ID,
  MAGISK_MAGISKINIT_ID,
  MAGISK_MAGISK_XZ_ID,
  MAGISK_STUB_XZ_ID,
} from "../../artifacts/catalog";
import { AbortedError, PatchError } from "../../errors";
import { sha1Hex, sha256Hex } from "../../hash";
import {
  COMPRESSION_LABEL,
  decodeRamdisk,
  encodeRamdisk,
  encodeXz,
  findEntry,
  parseImage,
  removeEntry,
  upsertEntry,
  verifyImage,
} from "../../image";
import type { CpioArchive, CpioEntry, ParsedImage, VerifyExpectations } from "../../image";
import { KEEP_SIGNATURE_SETTING, PRESERVE_IMAGE_SIZE_SETTING, outputOptions } from "./output-options";
import {
  findKernelsuMarker,
  findMagiskMarker,
  loadRamdiskSection,
  ramdiskBytesForVerification,
  repackWithRamdisk,
} from "./ramdisk-support";
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

import {
  MAGISK_BACKUP_DIR,
  MAGISK_BACKUP_INIT_ENTRY,
  MAGISK_BACKUP_RMLIST_ENTRY,
  MAGISK_CONFIG_ENTRY,
  MAGISK_INIT_ENTRY,
  MAGISK_INIT_LD_ENTRY,
  MAGISK_KEEP_FORCE_ENCRYPT_SETTING,
  MAGISK_KEEP_VERITY_SETTING,
  MAGISK_MAGISK_ENTRY,
  MAGISK_OVERLAY_DIR,
  MAGISK_OVERLAY_SBIN_DIR,
  MAGISK_PREINIT_DEVICE_SETTING,
  MAGISK_REQUIRED_MANAGER,
  MAGISK_STUB_ENTRY,
  MAGISK_VERITY_KEY_ENTRY,
  buildMagiskConfig,
} from "./magisk-config";

/**
 * The patterns magiskboot removes from fstab entries, in the order it tries them
 * (native/src/boot/patch.rs:64,82 in v30.7).
 */
const VERITY_PATTERNS = ["verifyatboot", "verify", "avb_keys", "avb", "support_scfs", "fsverity"];
const ENCRYPTION_PATTERNS = ["forceencrypt", "forcefdeorfbe", "fileencryption"];

/** Removes every occurrence of the first matching pattern, like magiskboot's remove_pattern. */
function removePatterns(data: Uint8Array, patterns: string[]): Uint8Array {
  const encoded = patterns.map((pattern) => new TextEncoder().encode(pattern));
  const kept: number[] = [];
  let read = 0;
  while (read < data.length) {
    const hit = encoded.find((pattern) => pattern.every((byte, index) => data[read + index] === byte));
    if (hit) read += hit.length;
    else {
      kept.push(data[read]);
      read += 1;
    }
  }
  return Uint8Array.from(kept);
}

/** The fstab entries Magisk is willing to touch (cpio.rs:512). */
function isFstabEntry(entry: CpioEntry): boolean {
  if ((entry.mode & 0o170000) !== 0o100000) return false;
  if (entry.name.startsWith(".backup")) return false;
  if (entry.name.startsWith("twrp")) return false;
  if (entry.name.startsWith("recovery")) return false;
  return entry.name.startsWith("fstab");
}

export interface FstabPatchReport {
  patched: string[];
  removedVerityKey: boolean;
}

/** The ramdisk patch step of magiskboot, with the same conditions and the same removals. */
function patchFstab(
  archive: CpioArchive,
  options: { keepVerity: boolean; keepForceEncrypt: boolean },
): FstabPatchReport {
  const report: FstabPatchReport = { patched: [], removedVerityKey: false };
  const removable: string[] = [];

  for (const entry of archive.entries) {
    const fstab =
      (!options.keepVerity || !options.keepForceEncrypt) && isFstabEntry(entry);
    if (!options.keepVerity) {
      if (fstab) {
        const patched = removePatterns(entry.data, VERITY_PATTERNS);
        if (patched.length !== entry.data.length) {
          entry.data = patched;
          report.patched.push("verity flags removed from " + entry.name);
        }
      } else if (entry.name === MAGISK_VERITY_KEY_ENTRY) {
        removable.push(entry.name);
      }
    }
    if (!options.keepForceEncrypt && fstab) {
      const patched = removePatterns(entry.data, ENCRYPTION_PATTERNS);
      if (patched.length !== entry.data.length) {
        entry.data = patched;
        report.patched.push("encryption flags removed from " + entry.name);
      }
    }
  }

  for (const name of removable) {
    if (removeEntry(archive, name)) report.removedVerityKey = true;
  }
  return report;
}

const PLAN_STEPS: PatchPlanStep[] = [
  { id: "analyze", label: "Read the boot image", progress: 5 },
  { id: "extract", label: "Expand the ramdisk", progress: 20 },
  { id: "prepare", label: "Check the ramdisk", progress: 40 },
  { id: "patch", label: "Rewrite the ramdisk", progress: 60 },
  { id: "repack", label: "Repack the boot image", progress: 80 },
  { id: "verify", label: "Verify the produced image", progress: 95 },
];

function readFlag(configuration: Record<string, string> | undefined, key: string, fallback: boolean): boolean {
  const raw = configuration?.[key];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true";
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

function ensureDirectory(archive: CpioArchive, name: string, mode: number): void {
  if (findEntry(archive, name)) return;
  upsertEntry(archive, name, new Uint8Array(0), mode);
}

export class MagiskPatchProvider implements PatchProvider {
  readonly id = "magisk";
  readonly name = "Magisk";
  private readonly artifacts: ArtifactRegistry;

  constructor(artifacts: ArtifactRegistry) {
    this.artifacts = artifacts;
  }

  async analyze(_image: ParsedImage): Promise<PatchAnalysis> {
    return {
      providerId: this.id,
      summary:
        "Replaces the ramdisk init with magiskinit and adds Magisk's payloads under overlay.d/sbin, exactly as Magisk's own patcher does.",
      supportedTargets: ["boot", "init_boot"],
      notes: [
        "The ramdisk is modified: on GKI Android 13+ that is init_boot.img, otherwise a boot.img that carries a ramdisk.",
        "Magisk is GPL-3.0 throughout and its payloads are bundled, so nothing has to be supplied.",
        "The stock init is replaced rather than renamed. Magisk's own patcher also keeps a compressed copy of it inside the ramdisk for its uninstall path, which this build does not write, so restoring later needs a stock image.",
        "A ramdisk that Magisk or KernelSU already patched is refused.",
        "The Magisk app (com.topjohnwu.magisk) has to be installed on the device for the produced image to be usable.",
      ],
    };
  }

  private artifact(id: string) {
    return this.artifacts.resolve({ providerId: this.id, artifactId: id }).artifact;
  }

  async resolve(
    image: ParsedImage,
    options: PatchOptions,
    sourceImageSha256: string,
    _planContext?: PatchPlanContext,
  ): Promise<PatchPlan> {
    const ramdisk = loadRamdiskSection(image);
    const magiskinit = this.artifact(MAGISK_MAGISKINIT_ID);
    const keepVerity = readFlag(options.configuration, MAGISK_KEEP_VERITY_SETTING, true);
    const keepForceEncrypt = readFlag(options.configuration, MAGISK_KEEP_FORCE_ENCRYPT_SETTING, true);
    const preinitDevice = (options.configuration?.[MAGISK_PREINIT_DEVICE_SETTING] ?? "").trim();
    const output = outputOptions(options.configuration, undefined);

    const plan: PatchPlan = {
      id: "",
      providerId: this.id,
      providerName: this.name,
      release: magiskinit.version,
      artifact: magiskinit,
      architecture: image.architecture ?? "unknown",
      target: image.format,
      headerVersion: image.headerVersion,
      pageSize: image.pageSize,
      sourceImageSha256,
      configuration: {
        ...(options.configuration ?? {}),
        injection: "ramdisk",
        initEntry: MAGISK_INIT_ENTRY,
        initHandling: "replaced by magiskinit",
        magiskArtifacts: [MAGISK_MAGISKINIT_ID, MAGISK_MAGISK_XZ_ID, MAGISK_STUB_XZ_ID, MAGISK_INIT_LD_XZ_ID].join(","),
        [MAGISK_KEEP_VERITY_SETTING]: keepVerity ? "true" : "false",
        [MAGISK_KEEP_FORCE_ENCRYPT_SETTING]: keepForceEncrypt ? "true" : "false",
        [MAGISK_PREINIT_DEVICE_SETTING]: preinitDevice === "" ? "auto" : preinitDevice,
        sha1Source: image.source === undefined ? "unavailable" : "the source image",
        requiredManager: MAGISK_REQUIRED_MANAGER,
        ramdiskCompression: COMPRESSION_LABEL[ramdisk.descriptor.format],
        ramdiskSectionSize: String(ramdisk.bytes.length),
        [PRESERVE_IMAGE_SIZE_SETTING]: output.preserveImageSize ? "true" : "false",
        [KEEP_SIGNATURE_SETTING]: output.keepSignature ? "true" : "false",
      },
      steps: PLAN_STEPS.map((step) => ({ ...step })),
      createdAt: new Date().toISOString(),
      reproducible: true,
      notes: [
        "The kernel is left untouched: only the ramdisk changes.",
        "init is replaced by magiskinit; Magisk's payloads are written to overlay.d/sbin and its configuration to .backup/.magisk.",
        keepVerity || keepForceEncrypt
          ? "Verity is kept: " + (keepVerity ? "yes" : "no") + ", forced encryption is kept: " + (keepForceEncrypt ? "yes" : "no") + ". Only the flags that are not kept are removed from fstab entries."
          : "Neither verity nor forced encryption is kept, so both are removed from any fstab entry inside the ramdisk.",
        preinitDevice === ""
          ? "PREINITDEVICE is not set: Magisk falls back to detecting it on the device. Set it (magisk --preinit-device, for example sda10) to pin it."
          : "PREINITDEVICE is pinned to " + preinitDevice + ".",
        "SHA1 in the configuration is the digest of the whole source image, which is what Magisk's app records for its uninstall path.",
        "The uninstall backup Magisk's own patcher keeps inside the ramdisk is written too: the stock init as .backup/init.xz and the list of added paths as .backup/.rmlist.",
        "A ramdisk that Magisk or KernelSU already patched is refused.",
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

    const ramdisk = loadRamdiskSection(image);
    emit("extract", 20, "Expanding the ramdisk");
    const decoded = await decodeRamdisk(ramdisk.bytes);
    const archive = decoded.archive;
    const entriesBefore = archive.entries.length;

    emit("prepare", 40, "Checking the ramdisk");
    const magisk = findMagiskMarker(archive);
    if (magisk !== undefined) {
      throw new PatchError(
        "The ramdisk already contains Magisk (" + magisk + ").",
        "Restore a stock image first: Magisk's own patcher restores its backup before re-patching, and this build does not write that backup.",
      );
    }
    const kernelsu = findKernelsuMarker(archive);
    if (kernelsu !== undefined) {
      throw new PatchError(
        "The ramdisk already contains KernelSU (" + kernelsu + ").",
        "Two root solutions would run at once; restore a stock image before switching.",
      );
    }

    const magiskinitBytes = await this.artifacts.loadVerifiedPayload(plan.artifact);
    const payloadIds = [MAGISK_MAGISK_XZ_ID, MAGISK_STUB_XZ_ID, MAGISK_INIT_LD_XZ_ID];
    const payloadEntries = [MAGISK_MAGISK_ENTRY, MAGISK_STUB_ENTRY, MAGISK_INIT_LD_ENTRY];
    const payloads: Array<{ entry: string; bytes: Uint8Array }> = [];
    for (let index = 0; index < payloadIds.length; index += 1) {
      payloads.push({
        entry: payloadEntries[index],
        bytes: await this.artifacts.loadVerifiedPayload(this.artifact(payloadIds[index])),
      });
    }

    emit("patch", 60, "Rewriting the ramdisk");
    const keepVerity = readFlag(plan.configuration, MAGISK_KEEP_VERITY_SETTING, true);
    const keepForceEncrypt = readFlag(plan.configuration, MAGISK_KEEP_FORCE_ENCRYPT_SETTING, true);
    const fstab = patchFstab(archive, { keepVerity, keepForceEncrypt });

    // Magisk keeps the stock init inside the ramdisk, xz compressed, so its app can restore the
    // image without a stock file; the same trick is possible here now that the codec is available.
    const stockInitEntry = findEntry(archive, MAGISK_INIT_ENTRY);
    // Snapshot it: replacing the entry mutates the same object, so reading it afterwards would
    // hand back magiskinit instead of the stock init.
    const stockInit = stockInitEntry === undefined ? undefined : new Uint8Array(stockInitEntry.data);
    upsertEntry(archive, MAGISK_INIT_ENTRY, magiskinitBytes, 0o100750);
    ensureDirectory(archive, MAGISK_OVERLAY_DIR, 0o040750);
    ensureDirectory(archive, MAGISK_OVERLAY_SBIN_DIR, 0o040750);
    for (const payload of payloads) upsertEntry(archive, payload.entry, payload.bytes, 0o100644);

    // .backup/.rmlist lists the paths the patch added, NUL separated and sorted, which is exactly
    // what a restore deletes again.
    const addedPaths = [MAGISK_OVERLAY_DIR, MAGISK_OVERLAY_SBIN_DIR, MAGISK_INIT_LD_ENTRY, MAGISK_MAGISK_ENTRY, MAGISK_STUB_ENTRY].sort();
    let rmlistSize = 0;
    for (const name of addedPaths) rmlistSize += name.length + 1;
    const rmlist = new Uint8Array(rmlistSize);
    let rmlistOffset = 0;
    for (const name of addedPaths) {
      const encoded = new TextEncoder().encode(name);
      rmlist.set(encoded, rmlistOffset);
      rmlistOffset += encoded.length + 1;
    }

    const preinit = plan.configuration[MAGISK_PREINIT_DEVICE_SETTING] ?? "";
    const configBytes = buildMagiskConfig({
      keepVerity,
      keepForceEncrypt,
      ...(preinit === "" || preinit === "auto" ? {} : { preinitDevice: preinit }),
      ...(image.source === undefined ? {} : { sha1: await sha1Hex(image.source) }),
    });
    ensureDirectory(archive, MAGISK_BACKUP_DIR, 0o040000);
    upsertEntry(archive, MAGISK_CONFIG_ENTRY, configBytes, 0o100000);
    upsertEntry(archive, MAGISK_BACKUP_RMLIST_ENTRY, rmlist, 0o100000);
    let backupSha256 = "none";
    if (stockInit) {
      const compressed = await encodeXz(stockInit);
      upsertEntry(archive, MAGISK_BACKUP_INIT_ENTRY, compressed, 0o100750);
      backupSha256 = await sha256Hex(compressed);
    }

    emit("repack", 80, "Repacking the boot image");
    const encoded = await encodeRamdisk(archive, decoded.descriptor);
    const output = outputOptions(plan.configuration, context.options?.configuration);
    const outcome = repackWithRamdisk(image, ramdisk, encoded, {
      preserveImageSize: output.preserveImageSize,
      keepSignature: output.keepSignature,
    });
    const sha256 = await sha256Hex(outcome.bytes);
    const ramdiskSectionSha256 = await sha256Hex(encoded);

    return {
      plan,
      bytes: outcome.bytes,
      sha256,
      sizeBytes: outcome.bytes.length,
      warnings: [
        ...outcome.warnings,
        "Magisk patches the ramdisk only; flashing this image is the user's responsibility and ImageForge never flashes devices.",
        "Magisk's app can restore this image by itself: the stock init is kept inside the ramdisk as .backup/init.xz. Keep a stock image anyway.",
      ],
      metadata: {
        provider: plan.providerId,
        providerName: plan.providerName,
        release: plan.release,
        artifact: plan.artifact.id,
        artifactVersion: plan.artifact.version,
        artifactSha256: plan.artifact.sha256 ?? "unknown",
        magiskinitSha256: await sha256Hex(magiskinitBytes),
        initEntry: MAGISK_INIT_ENTRY,
        initHandling: "replaced by magiskinit",
        payloads: payloads.map((payload) => payload.entry).join(","),
        payloadDigests: (
          await Promise.all(
            payloads.map(async (payload) => payload.entry + ":" + (await sha256Hex(payload.bytes)).slice(0, 16)),
          )
        ).join(","),
        keepVerity: keepVerity ? "true" : "false",
        keepForceEncrypt: keepForceEncrypt ? "true" : "false",
        fstabPatched: fstab.patched.length === 0 ? "nothing to patch" : fstab.patched.join("; "),
        verityKeyRemoved: fstab.removedVerityKey ? "yes" : "no",
        config: new TextDecoder().decode(configBytes).trim().replace(/\n/g, " | "),
        configSha256: await sha256Hex(configBytes),
        stockInitSaved: stockInit ? "yes (" + MAGISK_BACKUP_INIT_ENTRY + ")" : "no init in the source ramdisk",
        backupInitSha256: backupSha256,
        rmlist: addedPaths.join(" "),
        requiredManager: MAGISK_REQUIRED_MANAGER,
        archiveEntriesBefore: String(entriesBefore),
        archiveEntriesAfter: String(archive.entries.length),
        ramdiskCompression: COMPRESSION_LABEL[ramdisk.descriptor.format],
        ramdiskSectionSizeBefore: String(ramdisk.bytes.length),
        ramdiskSectionSizeAfter: String(encoded.length),
        ramdiskSectionSha256,
        imageSizeBefore: String(image.totalSize),
        imageSizeAfter: String(outcome.bytes.length),
        preserveImageSize: output.preserveImageSize ? "true" : "false",
        keepSignature: output.keepSignature ? "true" : "false",
        target: plan.target,
        targetRamdisk: ramdisk.vendor === undefined
          ? "the ramdisk section"
          : "vendor fragment " + ramdisk.vendor.index + " (" + (ramdisk.vendor.typeName || ramdisk.vendor.type) + ")",
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

    const required = [
      MAGISK_INIT_ENTRY,
      MAGISK_MAGISK_ENTRY,
      MAGISK_STUB_ENTRY,
      MAGISK_INIT_LD_ENTRY,
      MAGISK_CONFIG_ENTRY,
      MAGISK_BACKUP_RMLIST_ENTRY,
    ];
    try {
      const ramdiskBytes = ramdiskBytesForVerification(parseImage(result.bytes));
      if (!ramdiskBytes) {
        verification.valid = false;
        verification.warnings.push("The produced image has no ramdisk to read back.");
      } else {
        const decoded = await decodeRamdisk(ramdiskBytes);
        for (const name of required) {
          if (!findEntry(decoded.archive, name)) {
            verification.valid = false;
            verification.warnings.push("The produced ramdisk does not contain " + name + ".");
          }
        }
        const config = findEntry(decoded.archive, MAGISK_CONFIG_ENTRY);
        if (config && !new TextDecoder().decode(config.data).includes("KEEPVERITY=")) {
          verification.valid = false;
          verification.warnings.push("The Magisk configuration in the produced ramdisk looks wrong.");
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
