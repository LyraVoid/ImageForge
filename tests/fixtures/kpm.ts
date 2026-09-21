/**
 * Builds a minimal KernelPatch module. kptools accepts a module when it is a relocatable
 * aarch64 ELF that carries a .kpm.info section (tools/kpm.c:get_kpm_info), which is what
 * this builds, so the embedding path can be tested without a compiled kernel module.
 */
export interface KpmFixtureOptions {
  name?: string;
  version?: string;
  license?: string;
  author?: string;
  description?: string;
}

const ELF_HEADER_SIZE = 64;
const SECTION_HEADER_SIZE = 64;
const EM_AARCH64 = 183;
const ET_REL = 1;
const SHT_PROGBITS = 1;
const SHT_STRTAB = 3;
const SHF_ALLOC = 0x2n;

export function buildKpm(options: KpmFixtureOptions = {}): Uint8Array {
  const info = new TextEncoder().encode(
    [
      "name=" + (options.name ?? "imageforge-test"),
      "version=" + (options.version ?? "1.0.0"),
      "license=" + (options.license ?? "GPL"),
      "author=" + (options.author ?? "ImageForge"),
      "description=" + (options.description ?? "synthetic KernelPatch module"),
    ].join("\0") + "\0",
  );

  const shstrtab = new TextEncoder().encode("\0.shstrtab\0.kpm.info\0");
  const infoOffset = ELF_HEADER_SIZE;
  const shstrtabOffset = infoOffset + info.length;
  const sectionHeaderOffset = shstrtabOffset + shstrtab.length;
  const sectionCount = 3;
  const total = sectionHeaderOffset + sectionCount * SECTION_HEADER_SIZE;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  out.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0);
  view.setUint16(16, ET_REL, true);
  view.setUint16(18, EM_AARCH64, true);
  view.setUint32(20, 1, true);
  view.setBigUint64(40, BigInt(sectionHeaderOffset), true);
  view.setUint16(58, SECTION_HEADER_SIZE, true);
  view.setUint16(60, sectionCount, true);
  view.setUint16(62, 1, true);

  out.set(info, infoOffset);
  out.set(shstrtab, shstrtabOffset);

  const writeSection = (
    index: number,
    nameOffset: number,
    type: number,
    flags: bigint,
    offset: number,
    size: number,
  ): void => {
    const base = sectionHeaderOffset + index * SECTION_HEADER_SIZE;
    view.setUint32(base, nameOffset, true);
    view.setUint32(base + 4, type, true);
    view.setBigUint64(base + 8, flags, true);
    view.setBigUint64(base + 24, BigInt(offset), true);
    view.setBigUint64(base + 32, BigInt(size), true);
  };

  writeSection(0, 0, 0, 0n, 0, 0);
  writeSection(1, 1, SHT_STRTAB, 0n, shstrtabOffset, shstrtab.length);
  writeSection(2, 11, SHT_PROGBITS, SHF_ALLOC, infoOffset, info.length);

  return out;
}
