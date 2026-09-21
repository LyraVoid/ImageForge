/**
 * Builds minimal relocatable aarch64 ELF objects. Loadable kernel modules (`.modinfo`) and
 * KernelPatch modules (`.kpm.info`) are both ELF objects that carry one metadata section, so a
 * single builder covers the fixtures for both.
 */
export interface ElfObjectOptions {
  sectionName: string;
  payload: Uint8Array;
  machine?: number;
  type?: number;
}

const ELF_HEADER_SIZE = 64;
const SECTION_HEADER_SIZE = 64;
const EM_AARCH64 = 183;
const ET_REL = 1;
const SHT_PROGBITS = 1;
const SHT_STRTAB = 3;
const SHF_ALLOC = 0x2n;

export function buildElfObject(options: ElfObjectOptions): Uint8Array {
  const machine = options.machine ?? EM_AARCH64;
  const type = options.type ?? ET_REL;

  const shstrtab = new TextEncoder().encode("\0.shstrtab\0" + options.sectionName + "\0");
  const payloadOffset = ELF_HEADER_SIZE;
  const shstrtabOffset = payloadOffset + options.payload.length;
  const sectionHeaderOffset = shstrtabOffset + shstrtab.length;
  const sectionCount = 3;
  const total = sectionHeaderOffset + sectionCount * SECTION_HEADER_SIZE;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0);
  view.setUint16(16, type, true);
  view.setUint16(18, machine, true);
  view.setUint32(20, 1, true);
  view.setBigUint64(40, BigInt(sectionHeaderOffset), true);
  view.setUint16(58, SECTION_HEADER_SIZE, true);
  view.setUint16(60, sectionCount, true);
  view.setUint16(62, 1, true);
  out.set(options.payload, payloadOffset);
  out.set(shstrtab, shstrtabOffset);

  const writeSection = (
    index: number,
    nameOffset: number,
    sectionType: number,
    flags: bigint,
    offset: number,
    size: number,
  ): void => {
    const base = sectionHeaderOffset + index * SECTION_HEADER_SIZE;
    view.setUint32(base, nameOffset, true);
    view.setUint32(base + 4, sectionType, true);
    view.setBigUint64(base + 8, flags, true);
    view.setBigUint64(base + 24, BigInt(offset), true);
    view.setBigUint64(base + 32, BigInt(size), true);
  };

  writeSection(0, 0, 0, 0n, 0, 0);
  writeSection(1, 1, SHT_STRTAB, 0n, shstrtabOffset, shstrtab.length);
  writeSection(2, 11, SHT_PROGBITS, SHF_ALLOC, payloadOffset, options.payload.length);
  return out;
}

export interface ModuleInfoFixture {
  name?: string;
  vermagic?: string;
  license?: string;
  author?: string;
  description?: string;
  parameters?: string[];
}

/** A KernelSU style module: a relocatable aarch64 ELF with a .modinfo section. */
export function buildModuleObject(info: ModuleInfoFixture = {}): Uint8Array {
  const lines = [
    "parmtype=allow_shell:bool",
    "parmtype=norc:bool",
    "license=" + (info.license ?? "GPL"),
    "author=" + (info.author ?? "weishu"),
    "description=" + (info.description ?? "Android KernelSU"),
    "vermagic=" + (info.vermagic ?? "6.6.127-4k-g46a034eca005-dirty SMP preempt mod_unload modversions aarch64"),
    "name=" + (info.name ?? "kernelsu"),
    "depends=",
  ].join("\0") + "\0";
  return buildElfObject({ sectionName: ".modinfo", payload: new TextEncoder().encode(lines) });
}
