/**
 * Kernel release strings and the Kernel Module Interface they belong to.
 *
 * GKI keeps the module ABI stable within a KMI (for example android15-6.6), which is why
 * KernelPatch and KernelSU ship loadable modules per KMI instead of per exact kernel version.
 * The banner is the only place a kernel exposes this, and it is readable from a boot image.
 */
const BANNER = "Linux version ";

/** Reads the kernel release from a raw kernel payload, for example "6.6.118-android15-8-g...". */
export function readKernelRelease(kernel: Uint8Array): string | undefined {
  const text = new TextDecoder("latin1").decode(kernel);
  const start = text.indexOf(BANNER);
  if (start < 0) return undefined;
  const rest = text.slice(start + BANNER.length);
  const end = rest.search(/[\s\0(]/);
  const release = (end < 0 ? rest : rest.slice(0, end)).trim();
  return release === "" ? undefined : release;
}

/**
 * Maps a release to a KMI: the Android API level from the "-androidNN" suffix and the kernel
 * major.minor. Returns undefined when the banner does not name an Android release, because
 * guessing an API level from a kernel version alone is not possible.
 */
export function kmiFromRelease(release: string): string | undefined {
  const android = /-android(\d+)/.exec(release);
  const version = /^(\d+)\.(\d+)/.exec(release);
  if (!android || !version) return undefined;
  return "android" + android[1] + "-" + version[1] + "." + version[2];
}

/** The KMIs this build knows about, newest first. */
export const KNOWN_KMIS = [
  "android17-6.18",
  "android16-6.12",
  "android15-6.6",
  "android14-6.1",
  "android14-5.15",
  "android13-5.15",
  "android13-5.10",
  "android12-5.10",
] as const;
