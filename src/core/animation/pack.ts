import { PackageError } from "../errors";
import type { ByteSource } from "../package/source";
import { buildZip } from "../image/zip-write";
import { listZip, readZipEntry } from "../package/zip";
import { parseAnimationDesc } from "./desc";
import type { BootAnimation } from "./desc";

/**
 * A boot animation is a zip archive, and the document that describes the format is explicit about how
 * it should be made: "zip -0", so nothing is compressed (the frames are already compressed pictures),
 * with desc.txt first and the part directories after it. This project's zip writer stores entries and
 * nothing else, which is exactly that convention.
 */
export interface AnimationEntry {
  /** Path inside the archive, such as "desc.txt", "part0/" or "part0/OnePlus_000.png". */
  name: string;
  /** Absent for a directory entry, which vendor archives carry. */
  data?: Uint8Array;
}

export interface AnimationArchive {
  desc: string;
  animation: BootAnimation;
  entries: AnimationEntry[];
}

const IMAGE_ENTRY = /\.(png|jpg|jpeg|webp)$/i;

/** Reads an animation archive: its desc.txt, its parsed form, and every entry in archive order. */
export async function readAnimationZip(source: ByteSource): Promise<AnimationArchive> {
  const entries = await listZip(source);
  const descEntry = entries.find((entry) => entry.name === "desc.txt");
  if (!descEntry) {
    throw new PackageError(
      "The archive holds " + entries.length + " entries and none of them is desc.txt.",
      "This zip is not a boot animation: it has no desc.txt.",
    );
  }
  const desc = new TextDecoder().decode(await readZipEntry(source, descEntry));
  const animation = parseAnimationDesc(desc);
  const archiveEntries: AnimationEntry[] = [];
  for (const entry of entries) {
    const isDirectory = entry.name.endsWith("/");
    archiveEntries.push({
      name: entry.name,
      data: isDirectory ? undefined : await readZipEntry(source, entry),
    });
  }
  return { desc, animation, entries: archiveEntries };
}

/** The frames of one part, in the order the archive holds them. */
export function animationFrames(archive: AnimationArchive, path: string): AnimationEntry[] {
  const prefix = path.endsWith("/") ? path : path + "/";
  return archive.entries.filter(
    (entry) => entry.name.startsWith(prefix) && IMAGE_ENTRY.test(entry.name) && (entry.data?.length ?? 0) > 0,
  );
}

/**
 * Writes an animation archive. The entries are written in the order they are given, which is what makes
 * it possible to keep a vendor archive's order: desc.txt first, then each part directory and its frames.
 * An entry whose bytes are not replaced keeps them exactly, so editing one frame leaves every other
 * entry as it was.
 */
export async function packAnimation(entries: AnimationEntry[]): Promise<Uint8Array> {
  if (entries.length === 0) {
    throw new PackageError("An animation with no entries holds nothing.", "Add at least desc.txt.");
  }
  if (!entries.some((entry) => entry.name === "desc.txt")) {
    throw new PackageError(
      "None of the " + entries.length + " entries is desc.txt.",
      "A boot animation needs a desc.txt.",
    );
  }
  return buildZip(
    entries.map((entry) => ({
      name: entry.name,
      // a directory entry is an empty file whose name ends in a slash, which is what zip tools write
      data: entry.data ?? new Uint8Array(0),
    })),
  );
}
