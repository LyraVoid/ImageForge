export * from "./errors";
export * from "./canonical";
export * from "./binary";
export * from "./hash";
export * from "./artifacts/types";
export {
  APATCH_KPIMG_ASTER_ID,
  APATCH_KPIMG_ASTER_SHA256,
  APATCH_KPIMG_ID,
  APATCH_KPIMG_SHA256,
  APATCH_KPTOOLS_ID,
  APATCH_KPTOOLS_SHA256,
  ARTIFACT_CATALOG,
  MOCK_ARTIFACT_ID,
  MOCK_ARTIFACT_PAYLOAD,
  MOCK_ARTIFACT_SHA256,
  MOCK_ARTIFACT_SIZE_BYTES,
} from "./artifacts/catalog";
export { ArtifactRegistry, createArtifactRegistry } from "./artifacts/registry";
export type { ArtifactIntegrity, PayloadLoader, ResolveArtifactRequest, ResolvedArtifact } from "./artifacts/registry";
export * from "./image";
export { buildImageReport } from "./image/report";
export type { ImageReport, ReportField, ReportGroup } from "./image/report";
export * from "./workspace";
export * from "./package";
export * from "./partition";
export * from "./compat/types";
export { evaluateCompatibility } from "./compat/engine";
export type { CompatibilityInput } from "./compat/engine";
export * from "./patch/manager-apps";
export * from "./patch/types";
export { ProviderRegistry, createProviderRegistry } from "./patch/providers/registry";
export type { PatchProviderFactory } from "./patch/providers/registry";
export {
  APATCH_PROVIDER_DESCRIPTOR,
  KERNELSU_PROVIDER_DESCRIPTOR,
  MAGISK_PROVIDER_DESCRIPTOR,
  MOCK_PROVIDER_DESCRIPTOR,
  PLANNED_PROVIDER_DESCRIPTORS,
  PROVIDER_DESCRIPTORS,
} from "./patch/providers/descriptors";

/**
 * The provider *implementations* are not exported from here on purpose: they are imported on demand
 * by the registry, so importing this barrel does not pull four patch pipelines into a bundle that
 * only wants to describe them. Everything a caller can legitimately need without running a provider
 * lives in the config modules below.
 */
export {
  APATCH_CUSTOM_FLAVOR,
  APATCH_CUSTOM_KPIMG_ID,
  APATCH_DEFAULT_FLAVOR,
  APATCH_FLAVORS,
  APATCH_FLAVOR_SETTING,
  APATCH_KPM_SETTING,
  APATCH_SUPERKEY_SETTING,
} from "./patch/providers/apatch-config";
export type { ApatchFlavor } from "./patch/providers/apatch-config";
export { KEEP_SIGNATURE_SETTING, PRESERVE_IMAGE_SIZE_SETTING, outputOptions } from "./patch/providers/output-options";
export type { OutputOptions } from "./patch/providers/output-options";
export { describeKpm, readKpmInfo } from "./patch/providers/kpm-info";
export type { KpmInfo } from "./patch/providers/kpm-info";
export {
  KERNELSU_CONFIG_ENTRY,
  KERNELSU_CONFIG_SETTING,
  KERNELSU_INIT_BACKUP_ENTRY,
  KERNELSU_INIT_ENTRY,
  KERNELSU_KMI_SETTING,
  KERNELSU_MODULE_ENTRY,
  KERNELSU_MODULE_NAME,
  KERNELSU_REQUIRED_MANAGER,
  plannedKmi,
} from "./patch/providers/kernelsu-config";
export {
  KERNELSU_KSUINIT_ID,
  KERNELSU_KSUINIT_SHA256,
  KERNELSU_RELEASE,
  MAGISK_INIT_LD_PAYLOAD_ID,
  MAGISK_MAGISKINIT_ID,
  MAGISK_MAGISK_PAYLOAD_ID,
  MAGISK_RELEASE,
  MAGISK_STUB_PAYLOAD_ID,
} from "./artifacts/catalog";
export {
  MAGISK_BACKUP_DIR,
  MAGISK_BACKUP_INIT_ENTRY,
  MAGISK_BACKUP_RMLIST_ENTRY,
  MAGISK_CONFIG_ENTRY,
  MAGISK_INIT_ENTRY,
  MAGISK_INIT_LD_ENTRY,
  MAGISK_KEEP_FORCE_ENCRYPT_SETTING,
  MAGISK_KEEP_VERITY_SETTING,
  MAGISK_MAGISK_ENTRY,
  MAGISK_OVERLAY_DIR,
  MAGISK_OVERLAY_SBIN_DIR,
  MAGISK_PREINIT_DEVICE_SETTING,
  MAGISK_REQUIRED_MANAGER,
  MAGISK_STUB_ENTRY,
  MAGISK_VERITY_KEY_ENTRY,
  buildMagiskConfig,
} from "./patch/providers/magisk-config";
export type { MagiskConfigInput } from "./patch/providers/magisk-config";
export { MOCK_BOOTCONFIG_MARKER, MOCK_CMDLINE_MARKER } from "./patch/providers/mock-config";
export { PatchEngine, createPatchEngine } from "./patch/engine";
export type { AnalyzedImage, PatchEngineOptions, PatchRunOutcome } from "./patch/engine";
