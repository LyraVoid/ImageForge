import { align } from "../../binary";
import { RepackError } from "../../errors";
import type { BootImageHeaderFields, ParsedBootImage, ParsedImage, SectionName } from "../types";
import { sectionOf } from "../types";
import { BOOT_ARGS_SIZE, MODERN_PAGE_SIZE, bootHeaderSizeFor } from "./constants";
import { encodeBootHeader } from "./header";

export interface RepackBootImageRequest {
  image: ParsedImage;
  kernel?: Uint8Array | null;
  ramdisk?: Uint8Array | null;
  second?: Uint8Array | null;
  dtb?: Uint8Array | null;
  bootconfig?: Uint8Array | null;
  cmdline?: string;
  name?: string;
  keepSignature?: boolean;
}

export interface RepackLayoutEntry {
  name: SectionName;
  offset: number;
  size: number;
}

export interface RepackOutcome {
  bytes: Uint8Array;
  warnings: string[];
  layout: RepackLayoutEntry[];
}

interface PlannedSection {
  name: SectionName;
  data: Uint8Array;
}

const EMPTY = new Uint8Array(0);

function resolveSection(
  image: ParsedBootImage,
  name: SectionName,
  override: Uint8Array | null | undefined,
): Uint8Array {
  if (override === null) return EMPTY;
  if (override) return override;
  return sectionOf(image, name)?.data ?? EMPTY;
}

function plannedSections(data: Record<string, Uint8Array>): PlannedSection[] {
  const plan: PlannedSection[] = [];
  const add = (name: SectionName) => {
    const value = data[name];
    if (value && value.length > 0) plan.push({ name, data: value });
  };
  add("kernel");
  add("ramdisk");
  add("second");
  add("recovery_dtbo");
  add("dtb");
  add("bootconfig");
  return plan;
}

function splitLegacyCmdline(cmdline: string): { cmdline: string; extraCmdline: string } {
  return {
    cmdline: cmdline.slice(0, BOOT_ARGS_SIZE - 1),
    extraCmdline: cmdline.slice(BOOT_ARGS_SIZE - 1, BOOT_ARGS_SIZE - 1 + 1023),
  };
}

export function repackBootImage(request: RepackBootImageRequest): RepackOutcome {
  if (request.image.format === "vendor_boot") {
    throw new RepackError("Vendor boot images are read-only in this build; repacking is not implemented.");
  }
  const image: ParsedBootImage = request.image;
  if (image.format === "init_boot" && request.kernel && request.kernel.length > 0) {
    throw new RepackError("An init_boot image cannot carry a kernel payload.");
  }

  const warnings: string[] = [];
  const page = image.headerVersion >= 3 ? MODERN_PAGE_SIZE : image.pageSize;
  const headerSize = bootHeaderSizeFor(image.headerVersion);

  const data: Record<string, Uint8Array> = {
    kernel: resolveSection(image, "kernel", request.kernel),
    ramdisk: resolveSection(image, "ramdisk", request.ramdisk),
    second: resolveSection(image, "second", request.second),
    recovery_dtbo: resolveSection(image, "recovery_dtbo", undefined),
    dtb: resolveSection(image, "dtb", request.dtb),
    bootconfig: resolveSection(image, "bootconfig", request.bootconfig),
  };

  const signature = request.keepSignature ? resolveSection(image, "signature", undefined) : EMPTY;
  if (!request.keepSignature && (sectionOf(image, "signature")?.size ?? 0) > 0) {
    warnings.push(
      "The AVB signature was dropped because the image content changed; the output is no longer verified-boot signed.",
    );
  }

  const fields: BootImageHeaderFields = { ...image.header };
  fields.headerSize = headerSize;
  fields.kernelSize = data.kernel.length;
  fields.ramdiskSize = data.ramdisk.length;
  fields.secondSize = data.second.length;
  fields.dtbSize = data.dtb.length;
  fields.signatureSize = signature.length;
  if (request.cmdline !== undefined) {
    if (image.headerVersion >= 3) {
      fields.cmdline = request.cmdline;
      fields.extraCmdline = "";
    } else {
      const split = splitLegacyCmdline(request.cmdline);
      fields.cmdline = split.cmdline;
      fields.extraCmdline = split.extraCmdline;
    }
  }
  if (request.name !== undefined) fields.name = request.name;
  if (image.headerVersion < 2 && data.dtb.length > 0) {
    warnings.push("dtb payloads are only addressable in boot headers v2 and newer; the dtb was appended as-is.");
  }
  if (image.headerVersion < 3 && fields.idHex) {
    warnings.push(
      "The boot image id field was preserved instead of being regenerated; reproducible id generation requires the upstream hashing rule.",
    );
  }

  const plan = plannedSections(data);
  const layout: RepackLayoutEntry[] = [];
  let cursor = align(headerSize, page);
  for (const section of plan) {
    const offset = align(cursor, page);
    layout.push({ name: section.name, offset, size: section.data.length });
    cursor = offset + section.data.length;
  }

  const recoveryEntry = layout.find((entry) => entry.name === "recovery_dtbo");
  if (recoveryEntry) fields.recoveryDtboOffset = recoveryEntry.offset;

  const paddedEnd = align(cursor, page);
  const totalSize = signature.length > 0 ? paddedEnd + signature.length : paddedEnd;

  const header = encodeBootHeader(fields);
  const out = new Uint8Array(totalSize);
  out.set(header, 0);
  for (const section of plan) {
    const entry = layout.find((candidate) => candidate.name === section.name);
    if (!entry) continue;
    out.set(section.data, entry.offset);
  }
  if (signature.length > 0) out.set(signature, paddedEnd);

  return { bytes: out, warnings, layout };
}
