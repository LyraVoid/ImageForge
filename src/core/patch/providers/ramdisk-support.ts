import { IncompatibleProviderError } from "../../errors";
import { COMPRESSION_LABEL, describeCompression, isPayloadUsable, sectionOf } from "../../image";
import type { CompressionDescriptor, CpioArchive, ParsedImage } from "../../image";

export interface RamdiskSection {
  bytes: Uint8Array;
  descriptor: CompressionDescriptor;
}

/**
 * The ramdisk a ramdisk based provider patches, together with the container it has to be written
 * back into. Providers never expand or compress anything themselves.
 */
export function loadRamdiskSection(image: ParsedImage): RamdiskSection {
  if (image.format === "vendor_boot") {
    throw new IncompatibleProviderError(
      "This provider cannot write vendor boot ramdisks yet.",
      "Vendor boot images with a ramdisk table are not supported yet.",
    );
  }
  const ramdisk = sectionOf(image, "ramdisk");
  if (!ramdisk || ramdisk.size === 0) {
    throw new IncompatibleProviderError(
      "The image has no ramdisk section, so there is nothing to replace.",
      "This image carries no ramdisk, so this method cannot be installed into it.",
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
 * Magisk's ramdisk layout, from its own scripts/boot_patch.sh: its payload lives under overlay.d/
 * and its configuration in .backup/.magisk.
 */
export function findMagiskMarker(archive: CpioArchive): string | undefined {
  for (const entry of archive.entries) {
    if (entry.name === ".backup/.magisk" || entry.name === "overlay.d" || entry.name.startsWith("overlay.d/")) {
      return entry.name;
    }
  }
  return undefined;
}

/** KernelSU's ramdisk layout: ksud renames init to init.real and adds kernelsu.ko. */
export function findKernelsuMarker(archive: CpioArchive): string | undefined {
  for (const entry of archive.entries) {
    if (entry.name === "kernelsu.ko") return entry.name;
  }
  return undefined;
}
