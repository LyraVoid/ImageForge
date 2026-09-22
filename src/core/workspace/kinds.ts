/**
 * What a tool works on, as a small closed vocabulary. A tool declares the kinds it accepts and the
 * kinds it produces, and the interface offers the tools that match whatever the user is holding —
 * the same shape as the compatibility engine, one level up from images.
 */
export type ArtifactKind =
  /** A container of other things: an OTA payload, a vendor archive. */
  | "package"
  /** A partition dump, raw or sparse. */
  | "partition-image"
  /** An Android boot image (boot, init_boot, vendor_boot). */
  | "boot-container"
  /** A filesystem image (ext4, erofs, f2fs). */
  | "filesystem"
  /** A CPIO ramdisk, on its own or taken out of a boot image. */
  | "ramdisk"
  /** A vendor boot logo container. */
  | "logo-container"
  /** What a read-only tool reports about what it looked at. */
  | "report"
  /** Something we can name but have no tool for yet: a device tree, an ELF object, unknown bytes. */
  | "blob";

export interface ArtifactKindDefinition {
  id: ArtifactKind;
  /** Engine prose: the interface translates it through the record table. */
  label: string;
}

export const ARTIFACT_KINDS: ArtifactKindDefinition[] = [
  { id: "package", label: "Package" },
  { id: "partition-image", label: "Partition image" },
  { id: "boot-container", label: "Android boot image" },
  { id: "filesystem", label: "Filesystem image" },
  { id: "ramdisk", label: "Ramdisk archive" },
  { id: "logo-container", label: "Boot logo container" },
  { id: "report", label: "Report" },
  { id: "blob", label: "Binary blob" },
];

export function kindLabel(kind: ArtifactKind): string {
  return ARTIFACT_KINDS.find((entry) => entry.id === kind)?.label ?? kind;
}

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === "string" && ARTIFACT_KINDS.some((entry) => entry.id === value);
}
