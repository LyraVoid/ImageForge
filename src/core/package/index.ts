import { detectArtifact } from "../workspace/detect";
import type { ArtifactKind } from "../workspace/kinds";
import { extractPayloadPartition, PAYLOAD_MAGIC, parsePayload } from "./payload";
import { listZip, readZipEntry } from "./zip";
import type { ZipEntry } from "./zip";
import { PackageError } from "../errors";

/**
 * A package is either a zip archive or an OTA payload, and both are read the same way: list what is
 * inside, then take one entry out. What the entry *is* is decided by the detection chain after it
 * has been extracted, never by its name.
 */
export type PackageKind = "zip" | "ota-payload";

export interface PackageEntry {
  /** Stable within a package: the zip entry name, or the partition name of a payload. */
  id: string;
  name: string;
  sizeBytes: number;
  /** A hint from the format itself (a payload names its partitions), not a detection. */
  suggestedKind: ArtifactKind | null;
}

export interface OpenedPackage {
  kind: PackageKind;
  entries: PackageEntry[];
}

export function packageKindOf(bytes: Uint8Array): PackageKind | null {
  const detected = detectArtifact(bytes);
  if (detected.kind !== "package") return null;
  return detected.container === "zip" ? "zip" : detected.container === "ota-payload" ? "ota-payload" : null;
}

/** The boot partitions a payload can name; used for the listing's hint only. */
const BOOT_PARTITION_NAMES = new Set(["boot", "init_boot", "vendor_boot", "recovery"]);

export function openPackage(bytes: Uint8Array): OpenedPackage {
  const kind = packageKindOf(bytes);
  if (kind === null) {
    throw new PackageError(
      "The detection chain does not report a package; supported are zip archives and " + PAYLOAD_MAGIC + " payloads.",
      "This file is not a package this build can open.",
    );
  }
  if (kind === "zip") {
    return {
      kind,
      entries: listZip(bytes).map((entry: ZipEntry) => ({
        // The id is the path inside the archive; the name is what a file on disk would be called.
        id: entry.name,
        name: entry.name.split("/").pop() ?? entry.name,
        sizeBytes: entry.uncompressedSize,
        suggestedKind: null,
      })),
    };
  }
  const payload = parsePayload(bytes);
  return {
    kind,
    entries: payload.partitions.map((partition) => ({
      id: partition.name,
      name: partition.name + ".img",
      sizeBytes: partition.sizeBytes,
      suggestedKind: BOOT_PARTITION_NAMES.has(partition.name) ? "boot-container" : null,
    })),
  };
}

export { listZip, readZipEntry } from "./zip";
export type { ZipEntry } from "./zip";
export { OPERATION_TYPE, PAYLOAD_MAGIC, extractPayloadPartition, parsePayload } from "./payload";
export type { ParsedPayload, PayloadOperation, PayloadPartition } from "./payload";

export async function extractPackageEntry(bytes: Uint8Array, entryId: string): Promise<Uint8Array> {
  const kind = packageKindOf(bytes);
  if (kind === "zip") {
    const entry = listZip(bytes).find((candidate) => candidate.name === entryId);
    if (!entry) {
      throw new PackageError(
        "The archive has no entry named " + entryId + ".",
        "That entry is not in this archive.",
      );
    }
    return readZipEntry(bytes, entry);
  }
  if (kind === "ota-payload") {
    return extractPayloadPartition(bytes, parsePayload(bytes), entryId);
  }
  throw new PackageError(
    "The file is neither a zip archive nor a " + PAYLOAD_MAGIC + " payload.",
    "This file is not a package this build can open.",
  );
}

