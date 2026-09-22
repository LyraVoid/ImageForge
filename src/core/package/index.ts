import { PackageError } from "../errors";
import type { ArtifactKind } from "../workspace/kinds";
import { PAYLOAD_MAGIC, extractPayloadPartition, parsePayload } from "./payload";
import type { ParsedPayload, PayloadPartition } from "./payload";
import { readPrefix } from "./source";
import type { ByteSource } from "./source";
import { ZIP_METHOD_STORE, listZip, readZipEntry, storedEntrySource } from "./zip";
import type { ZipEntry } from "./zip";

/**
 * A package is a zip archive or an OTA payload, and both are read the same way: list what is inside,
 * then take one entry out — all through a {@link ByteSource}, so an 8 GiB OTA zip is nothing special.
 *
 * A payload that sits inside an OTA zip is descended into rather than extracted: its partitions are
 * listed as entries of this package (`payload.bin::init_boot`), because handing out an 8 GiB file is
 * not something a browser can do.
 */
export type PackageKind = "zip" | "ota-payload";

/** Separates the container from the entry inside it: `payload.bin::init_boot`. */
const NESTED_SEPARATOR = "::";

export interface PackageEntry {
  /** Stable within a package; a zip entry name, a partition name, or `container::partition`. */
  id: string;
  name: string;
  sizeBytes: number;
  /** A hint from the format itself (a payload names its partitions), not a detection. */
  suggestedKind: ArtifactKind | null;
  /** A payload partition whose operations read the source image cannot be extracted on its own. */
  requiresSource: boolean;
  /** The container this entry lives in, or null when it is the opened file itself. */
  container: string | null;
}

export interface OpenedPackage {
  kind: PackageKind;
  entries: PackageEntry[];
}

/** The boot partitions a payload can name; used for the listing's hint only. */
const BOOT_PARTITION_NAMES = new Set(["boot", "init_boot", "vendor_boot", "recovery"]);

function isZipHead(head: Uint8Array): boolean {
  return (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    (head[2] === 0x03 || head[2] === 0x05) &&
    (head[3] === 0x04 || head[3] === 0x06)
  );
}

function isPayloadHead(head: Uint8Array): boolean {
  return head.length >= 4 && new TextDecoder().decode(head.subarray(0, 4)) === PAYLOAD_MAGIC;
}

export async function packageKindOf(source: ByteSource): Promise<PackageKind | null> {
  const head = await readPrefix(source, 4);
  if (isZipHead(head)) return "zip";
  if (isPayloadHead(head)) return "ota-payload";
  return null;
}

function partitionEntry(
  partition: PayloadPartition,
  container: string | null,
  idPrefix: string,
): PackageEntry {
  return {
    id: idPrefix + partition.name,
    name: partition.name + ".img",
    sizeBytes: partition.sizeBytes,
    suggestedKind: BOOT_PARTITION_NAMES.has(partition.name) ? "boot-container" : null,
    requiresSource: partition.requiresSource,
    container,
  };
}

/** A payload stored uncompressed inside a zip is opened in place; a deflated one is left alone. */
async function nestedPayload(source: ByteSource, entry: ZipEntry): Promise<ParsedPayload | null> {
  if (entry.method !== ZIP_METHOD_STORE || entry.uncompressedSize < 24) return null;
  const head = await source.read(entry.dataOffset, 4);
  if (!isPayloadHead(head)) return null;
  return parsePayload(storedEntrySource(source, entry));
}

export async function openPackage(source: ByteSource): Promise<OpenedPackage> {
  const kind = await packageKindOf(source);
  if (kind === null) {
    throw new PackageError(
      "The detection chain does not report a package; supported are zip archives and " + PAYLOAD_MAGIC + " payloads.",
      "This file is not a package this build can open.",
    );
  }
  if (kind === "ota-payload") {
    const payload = await parsePayload(source);
    return { kind, entries: payload.partitions.map((partition) => partitionEntry(partition, null, "")) };
  }

  const entries: PackageEntry[] = [];
  for (const entry of await listZip(source)) {
    const nested = await nestedPayload(source, entry);
    if (nested) {
      for (const partition of nested.partitions) {
        entries.push(partitionEntry(partition, entry.name, entry.name + NESTED_SEPARATOR));
      }
      continue;
    }
    entries.push({
      id: entry.name,
      // The id is the path inside the archive; the name is what a file on disk would be called.
      name: entry.name.split("/").pop() ?? entry.name,
      sizeBytes: entry.uncompressedSize,
      suggestedKind: null,
      requiresSource: false,
      container: null,
    });
  }
  return { kind, entries };
}

export async function extractPackageEntry(source: ByteSource, entryId: string): Promise<Uint8Array> {
  const separator = entryId.indexOf(NESTED_SEPARATOR);
  if (separator >= 0) {
    const container = entryId.slice(0, separator);
    const partitionName = entryId.slice(separator + NESTED_SEPARATOR.length);
    const entry = (await listZip(source)).find((candidate) => candidate.name === container);
    if (!entry) {
      throw new PackageError(
        "The archive has no entry named " + container + ".",
        "That entry is not in this archive.",
      );
    }
    const payloadSource = storedEntrySource(source, entry);
    return extractPayloadPartition(payloadSource, await parsePayload(payloadSource), partitionName);
  }

  const kind = await packageKindOf(source);
  if (kind === "zip") {
    const entry = (await listZip(source)).find((candidate) => candidate.name === entryId);
    if (!entry) {
      throw new PackageError(
        "The archive has no entry named " + entryId + ".",
        "That entry is not in this archive.",
      );
    }
    return readZipEntry(source, entry);
  }
  if (kind === "ota-payload") {
    return extractPayloadPartition(source, await parsePayload(source), entryId);
  }
  throw new PackageError(
    "The file is neither a zip archive nor a " + PAYLOAD_MAGIC + " payload.",
    "This file is not a package this build can open.",
  );
}

export { listZip, readZipEntry, storedEntrySource } from "./zip";
export type { ZipEntry } from "./zip";
export { OPERATION_TYPE, PAYLOAD_MAGIC, extractPayloadPartition, parsePayload } from "./payload";
export type { ParsedPayload, PayloadOperation, PayloadPartition } from "./payload";
export {
  describeOperationTypes,
  payloadPartitionSource,
  payloadSupportsOperation,
} from "./payload-source";
export type { PayloadPartitionSource } from "./payload-source";
export { bytesSource, blobSource, readAll, readPrefix, subSource } from "./source";
export type { ByteSource } from "./source";
