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
export * from "./compat/types";
export { evaluateCompatibility } from "./compat/engine";
export type { CompatibilityInput } from "./compat/engine";
export * from "./patch/types";
export { MockPatchProvider, MOCK_BOOTCONFIG_MARKER, MOCK_CMDLINE_MARKER } from "./patch/providers/mock-provider";
export { ProviderRegistry, createProviderRegistry } from "./patch/providers/registry";
export {
  APATCH_PROVIDER_DESCRIPTOR,
  KERNELSU_PROVIDER_DESCRIPTOR,
  MOCK_PROVIDER_DESCRIPTOR,
  PLANNED_PROVIDER_DESCRIPTORS,
  PROVIDER_DESCRIPTORS,
} from "./patch/providers/descriptors";
export {
  APATCH_DEFAULT_FLAVOR,
  APATCH_FLAVORS,
  APATCH_FLAVOR_SETTING,
  APATCH_KPM_SETTING,
  APATCH_SUPERKEY_SETTING,
  ApatchPatchProvider,
} from "./patch/providers/apatch-provider";
export type { PatchAttachment } from "./patch/types";
export { describeKpm, readKpmInfo } from "./patch/providers/kpm-info";
export type { KpmInfo } from "./patch/providers/kpm-info";
export type { ApatchFlavor } from "./patch/providers/apatch-provider";
export {
  KERNELSU_CONFIG_ENTRY,
  KERNELSU_CONFIG_SETTING,
  KERNELSU_INIT_BACKUP_ENTRY,
  KERNELSU_INIT_ENTRY,
  KERNELSU_KMI_SETTING,
  KERNELSU_MODULE_ENTRY,
  KERNELSU_MODULE_NAME,
  KERNELSU_REQUIRED_MANAGER,
  KernelsuPatchProvider,
} from "./patch/providers/kernelsu-provider";
export { KERNELSU_KSUINIT_ID, KERNELSU_KSUINIT_SHA256, KERNELSU_RELEASE } from "./artifacts/catalog";
export { PatchEngine, createPatchEngine } from "./patch/engine";
export type { AnalyzedImage, PatchEngineOptions, PatchRunOutcome } from "./patch/engine";
