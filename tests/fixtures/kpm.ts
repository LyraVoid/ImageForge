import { buildElfObject } from "./elf";

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

export function buildKpm(options: KpmFixtureOptions = {}): Uint8Array {
  const info = [
    "name=" + (options.name ?? "imageforge-test"),
    "version=" + (options.version ?? "1.0.0"),
    "license=" + (options.license ?? "GPL"),
    "author=" + (options.author ?? "ImageForge"),
    "description=" + (options.description ?? "synthetic KernelPatch module"),
  ].join("\0") + "\0";
  return buildElfObject({ sectionName: ".kpm.info", payload: new TextEncoder().encode(info) });
}
