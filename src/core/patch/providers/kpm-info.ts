/**
 * Reads the metadata a KernelPatch module declares in its .kpm.info section.
 *
 * This mirrors the checks kptools performs before embedding a module
 * (KernelPatch tools/kpm.c:get_kpm_info): a relocatable aarch64 ELF that carries an
 * allocated .kpm.info section holding NUL separated "tag=value" strings.
 */
export interface KpmInfo {
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
const SHF_ALLOC = 0x2;

class KpmFormatError extends Error {}

function fail(reason: string): never {
  throw new KpmFormatError(reason);
}

function readSectionName(bytes: Uint8Array, offset: number): string {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  if (end >= bytes.length) fail("a section name is not terminated");
  return new TextDecoder().decode(bytes.subarray(offset, end));
}

export function readKpmInfo(bytes: Uint8Array): KpmInfo {
  if (bytes.length <= ELF_HEADER_SIZE) fail("the file is too small to be an ELF object");
  if (!(bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46)) {
    fail("the file is not an ELF object");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(16, true) !== ET_REL) fail("the ELF is not relocatable (ET_REL)");
  if (view.getUint16(18, true) !== EM_AARCH64) fail("the ELF is not aarch64");
  if (view.getUint16(58, true) !== SECTION_HEADER_SIZE) fail("unexpected section header size");

  const sectionOffset = Number(view.getBigUint64(40, true));
  const sectionCount = view.getUint16(60, true);
  const stringSectionIndex = view.getUint16(62, true);
  if (sectionOffset >= bytes.length) fail("the section header table starts past the end of the file");
  if (sectionCount * SECTION_HEADER_SIZE > bytes.length - sectionOffset) {
    fail("the section header table does not fit in the file");
  }
  if (stringSectionIndex >= sectionCount) fail("the section name table index is out of range");

  const stringSection = sectionOffset + stringSectionIndex * SECTION_HEADER_SIZE;
  const stringBase = Number(view.getBigUint64(stringSection + 24, true));
  if (stringBase >= bytes.length) fail("the section name table is out of range");

  let infoOffset = -1;
  let infoSize = 0;
  for (let index = 1; index < sectionCount; index += 1) {
    const base = sectionOffset + index * SECTION_HEADER_SIZE;
    const nameOffset = view.getUint32(base, true);
    const offset = Number(view.getBigUint64(base + 24, true));
    const size = Number(view.getBigUint64(base + 32, true));
    const type = view.getUint32(base + 4, true);
    if (type !== 8 /* SHT_NOBITS */ && offset + size > bytes.length) {
      fail("a section extends past the end of the file");
    }
    const name = readSectionName(bytes, stringBase + nameOffset);
    if (name === ".kpm.info" && (Number(view.getBigUint64(base + 8, true)) & SHF_ALLOC) !== 0) {
      infoOffset = offset;
      infoSize = size;
    }
  }

  if (infoOffset < 0) fail("the module has no allocated .kpm.info section");

  const info: KpmInfo = {};
  for (const entry of new TextDecoder().decode(bytes.subarray(infoOffset, infoOffset + infoSize)).split("\0")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const tag = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (tag === "name") info.name = value;
    else if (tag === "version") info.version = value;
    else if (tag === "license") info.license = value;
    else if (tag === "author") info.author = value;
    else if (tag === "description") info.description = value;
  }
  return info;
}

export function describeKpm(info: KpmInfo): string {
  const parts = [info.name ?? "unnamed"];
  if (info.version) parts.push(info.version);
  if (info.license) parts.push("[" + info.license + "]");
  if (info.author) parts.push("by " + info.author);
  return parts.join(" ");
}
