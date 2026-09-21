/** Output options the patch page can set, shared by every provider. */
export const PRESERVE_IMAGE_SIZE_SETTING = "preserveImageSize";
export const KEEP_SIGNATURE_SETTING = "keepSignature";

export interface OutputOptions {
  /** Zero pad the output back to the size of the source image. */
  preserveImageSize: boolean;
  /**
   * Keep the original signature bytes. They are stale either way, because the content changed;
   * the official patchers keep them, so this is the default.
   */
  keepSignature: boolean;
}

/**
 * Reads the output options. The plan is the base and the run's options are layered on top, so a
 * caller that does not repeat an option still gets what the plan pinned.
 */
export function outputOptions(
  planConfiguration: Record<string, string> | undefined,
  runConfiguration: Record<string, string> | undefined,
): OutputOptions {
  const configuration = { ...(planConfiguration ?? {}), ...(runConfiguration ?? {}) };
  return {
    preserveImageSize: configuration[PRESERVE_IMAGE_SIZE_SETTING] === "true",
    keepSignature: (configuration[KEEP_SIGNATURE_SETTING] ?? "true") === "true",
  };
}
