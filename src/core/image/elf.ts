/**
 * Minimal, bounds checked ELF64 section reader. It exists so the patch pipeline can inspect a
 * loadable kernel module (its .modinfo) before it is embedded, instead of trusting a file name.
 */
export interface ElfObject {
  type: number;
  machine: number;
  sections: Map<string, Uint8Array>;
}

export interface ModuleInfo {
  name?: string;
  vermagic?: string;
  license?: string;
  author?: string;
  description?: string;
  depends?: string;
  parameters: string[];
}

const ELF_HEADER_SIZE = 64;
const SECTION_HEADER_SIZE = 64;
const EM_AARCH64 = 183;
const EM_X86_64 = 62;
const ET_REL = 1;

export function machineName(machine: number): string {
  if (machine === EM_AARCH64) return "arm64";
  if (machine === EM_X86_64) return "x86_64";
  return "machine " + machine;
}

export function readElfObject(bytes: Uint8Array): ElfObject {
  if (bytes.length <= ELF_HEADER_SIZE) throw new Error("the file is too small to be an ELF object");
  if (!(bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46)) {
    throw new Error("the file is not an ELF object");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(58, true) !== SECTION_HEADER_SIZE) throw new Error("unexpected section header size");

  const sectionOffset = Number(view.getBigUint64(40, true));
  const sectionCount = view.getUint16(60, true);
  const stringIndex = view.getUint16(62, true);
  if (sectionOffset >= bytes.length) throw new Error("the section header table starts past the end of the file");
  if (sectionCount * SECTION_HEADER_SIZE > bytes.length - sectionOffset) {
    throw new Error("the section header table does not fit in the file");
  }
  if (stringIndex >= sectionCount) throw new Error("the section name table index is out of range");

  const stringBase = Number(view.getBigUint64(sectionOffset + stringIndex * SECTION_HEADER_SIZE + 24, true));
  if (stringBase >= bytes.length) throw new Error("the section name table is out of range");

  const sections = new Map<string, Uint8Array>();
  for (let index = 1; index < sectionCount; index += 1) {
    const base = sectionOffset + index * SECTION_HEADER_SIZE;
    const nameOffset = view.getUint32(base, true);
    const offset = Number(view.getBigUint64(base + 24, true));
    const size = Number(view.getBigUint64(base + 32, true));
    const type = view.getUint32(base + 4, true);
    if (type !== 8 /* SHT_NOBITS */ && offset + size > bytes.length) {
      throw new Error("a section extends past the end of the file");
    }
    const end = stringBase + nameOffset;
    if (end >= bytes.length) throw new Error("a section name is out of range");
    let nameEnd = end;
    while (nameEnd < bytes.length && bytes[nameEnd] !== 0) nameEnd += 1;
    const name = new TextDecoder().decode(bytes.subarray(end, nameEnd));
    if (name !== "") sections.set(name, bytes.subarray(offset, offset + size));
  }

  return {
    type: view.getUint16(16, true),
    machine: view.getUint16(18, true),
    sections,
  };
}

/** Reads the module metadata a loadable kernel module declares in .modinfo. */
export function readModuleInfo(bytes: Uint8Array): ModuleInfo {
  const object = readElfObject(bytes);
  if (object.type !== ET_REL) throw new Error("the ELF is not relocatable, so it is not a loadable module");
  const modinfo = object.sections.get(".modinfo");
  if (!modinfo) throw new Error("the module has no .modinfo section");

  const info: ModuleInfo = { parameters: [] };
  for (const entry of new TextDecoder().decode(modinfo).split("\0")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const tag = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (tag === "name") info.name = value;
    else if (tag === "vermagic") info.vermagic = value;
    else if (tag === "license") info.license = value;
    else if (tag === "author") info.author = value;
    else if (tag === "description") info.description = value;
    else if (tag === "depends") info.depends = value;
    else if (tag === "parm" || tag === "parmtype") info.parameters.push(value);
  }
  return info;
}
