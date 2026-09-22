import { IncompatibleProviderError } from "../../errors";
import { COMPRESSION_LABEL, describeCompression, isPayloadUsable, repackBootImage, sectionOf } from "../../image";
import { repackVendorBootImage } from "../../image/bootimage/vendor-repacker";
import type { CompressionDescriptor, CpioArchive, ParsedImage } from "../../image";

/** Which vendor ramdisk fragment a section came from, so it can be written back where it belongs. */
export interface VendorRamdiskFragment {
  index: number;
  name: string;
  type: number;
  typeName: string;
}

export interface RamdiskSection {
  bytes: Uint8Array;
  descriptor: CompressionDescriptor;
  /** Set for vendor boot images: the fragment that was picked. */
  vendor?: VendorRamdiskFragment;
}

/** The platform fragment is the one that carries init, so that is what a ramdisk patch targets. */
const VENDOR_RAMDISK_TYPE_PLATFORM = 1;

/**
 * The ramdisk a ramdisk based provider patches, together with the container it has to be written
 * back into. Providers never expand or compress anything themselves.
 */
export function loadRamdiskSection(image: ParsedImage): RamdiskSection {
  if (image.format === "vendor_boot") {
    const region = sectionOf(image, "vendor_ramdisk");
    const table = image.header.ramdiskTable;
    if (!region || region.size === 0) {
      throw new IncompatibleProviderError(
        "This vendor boot image carries no vendor ramdisk.",
        "There is no ramdisk to patch in this image.",
      );
    }
    if (table.length === 0) {
      throw new IncompatibleProviderError(
        "This vendor boot image has no ramdisk table, so its fragment cannot be addressed.",
        "Vendor boot header v3 images cannot be patched by this build.",
      );
    }

    const platform = table.find((entry) => entry.ramdiskType === VENDOR_RAMDISK_TYPE_PLATFORM);
    const chosen = platform ?? (table.length === 1 ? table[0] : undefined);
    if (!chosen) {
      throw new IncompatibleProviderError(
        "This vendor boot image has no platform ramdisk fragment (it has " +
          table.map((entry) => entry.ramdiskTypeName || String(entry.ramdiskType)).join(", ") +
          ").",
        "This build only patches the platform fragment, which is the one that carries init.",
      );
    }

    const bytes = region.data.subarray(chosen.ramdiskOffset, chosen.ramdiskOffset + chosen.ramdiskSize);
    const descriptor = describeCompression(bytes);
    if (!isPayloadUsable(descriptor.format)) {
      throw new IncompatibleProviderError(
        "Ramdisk compression is " + COMPRESSION_LABEL[descriptor.format] + ".",
        "This build cannot expand that ramdisk compression, so the ramdisk cannot be rewritten safely.",
      );
    }
    return {
      bytes,
      descriptor,
      vendor: {
        index: chosen.index,
        name: chosen.ramdiskName,
        type: chosen.ramdiskType,
        typeName: chosen.ramdiskTypeName,
      },
    };
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
 * The ramdisk bytes of a produced image, for the read-back check a verifier does: the ramdisk
 * section of a boot image, or the platform fragment of a vendor boot image.
 */
export function ramdiskBytesForVerification(image: ParsedImage): Uint8Array | undefined {
  if (image.format === "vendor_boot") {
    const region = sectionOf(image, "vendor_ramdisk");
    const entry =
      image.header.ramdiskTable.find((candidate) => candidate.ramdiskType === VENDOR_RAMDISK_TYPE_PLATFORM) ??
      image.header.ramdiskTable[0];
    if (!region || !entry) return undefined;
    return region.data.subarray(entry.ramdiskOffset, entry.ramdiskOffset + entry.ramdiskSize);
  }
  return sectionOf(image, "ramdisk")?.data;
}

export interface RamdiskRepackOptions {
  preserveImageSize: boolean;
  keepSignature: boolean;
}

/**
 * Writes a rewritten ramdisk back into the image it came from. A vendor boot image gets its
 * fragment replaced in place (its AVB lives in a separate vbmeta, so there is no signature bytes
 * question there), a boot image gets its ramdisk section replaced.
 */
export function repackWithRamdisk(
  image: ParsedImage,
  section: RamdiskSection,
  data: Uint8Array,
  options: RamdiskRepackOptions,
): { bytes: Uint8Array; warnings: string[] } {
  if (image.format === "vendor_boot") {
    const outcome = repackVendorBootImage({
      image,
      fragments: [{ index: section.vendor?.index ?? 0, data }],
      ...(options.preserveImageSize ? { padTo: image.totalSize } : {}),
    });
    return { bytes: outcome.bytes, warnings: outcome.warnings };
  }

  const outcome = repackBootImage({
    image,
    ramdisk: data,
    keepSignature: options.keepSignature,
    ...(options.preserveImageSize ? { padTo: image.totalSize } : {}),
  });
  return { bytes: outcome.bytes, warnings: outcome.warnings };
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
