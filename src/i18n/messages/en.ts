/**
 * The English catalogue is the source of truth for every interface message: its keys are the
 * MessageKey union, so a catalogue that misses a key does not compile. Engine-produced prose is
 * not here; it is keyed by its English source string in ./record.
 */
export const en = {
  "app.title": "ImageForge — Android Image Patcher",
  "app.loading": "Loading workspace",

  "shell.appearance": "Appearance",
  "shell.language": "Language",
  "shell.settings": "Settings",
  "shell.source": "Source",
  "shell.theme.light": "Light",
  "shell.theme.dark": "Dark",
  "shell.theme.system": "System",
  "shell.aria.settings": "Open settings",
  "shell.aria.theme": "Change theme",
  "shell.aria.language": "Change language",
  "shell.aria.workflow": "Workflow progress",
  "shell.aria.close": "Close",
  "shell.footer.privacy": "Local-first · Private · Open Source — images never leave your browser.",
  "shell.footer.description":
    "ImageForge analyzes, patches, repacks and verifies Android images. It never flashes a device.",

  "step.image": "Image",
  "step.analyze": "Analyze",
  "step.patch": "Patch",
  "step.verify": "Verify",
  "step.result": "Result",

  "home.title": "Android Image Patcher",
  "home.subtitle": "Analyze, patch, repack and verify Android images locally in your browser.",
  "home.highlight.local": "Local-first",
  "home.highlight.local.detail": "Patching runs in your browser",
  "home.highlight.private": "Private",
  "home.highlight.private.detail": "Images are never uploaded",
  "home.highlight.open": "Open Source",
  "home.highlight.open.detail": "AGPL-3.0-or-later",
  "home.limit":
    "Images are processed with the Web Worker + WASM pipeline and are limited to {size}. ImageForge never flashes a device.",

  "dropzone.title": "Drop an Android image here",
  "dropzone.hint": "or click to browse files",
  "dropzone.busy": "Analyzing image",
  "dropzone.empty": "The selected file is empty.",
  "dropzone.tooLarge": "The file is larger than the supported limit.",

  "analyze.title": "Image Analysis",
  "analyze.newImage": "New image",
  "analyze.wasm": "WASM",
  "analyze.fallback": "TypeScript fallback",
  "analyze.parserNotes": "Parser notes",
  "analyze.technical": "Technical details",
  "analyze.technical.description":
    "Raw header fields, section offsets, per-section SHA-256 digests and parser warnings.",
  "analyze.methods": "Compatible Patch Methods",
  "analyze.methods.description": "Candidates are produced by the compatibility engine, not by the UI.",
  "analyze.method.notAvailable": "Not available",
  "analyze.method.compatible": "Compatible",
  "analyze.method.incompatible": "Incompatible",
  "analyze.method.select": "Select",
  "analyze.method.unavailable": "Unavailable",

  "patch.building": "Building the patch plan",
  "patch.plan": "Patch plan",
  "patch.plan.description":
    "Provider, release and artifact are pinned so the same plan can be reproduced later.",
  "patch.configuration": "Configuration",
  "patch.configuration.description": "Plan configuration passed to the provider.",
  "patch.pipeline": "Pipeline",
  "patch.pipeline.description": "The stages executed inside the Web Worker.",
  "patch.pipeline.complete": "Complete",
  "patch.notes": "Provider notes",
  "patch.planValue": "plan: {value}",
  "patch.field.provider": "Provider",
  "patch.field.release": "Release",
  "patch.field.artifact": "Artifact",
  "patch.field.artifactType": "Artifact type",
  "patch.field.artifactSha256": "Artifact SHA-256",
  "patch.field.architecture": "Architecture",
  "patch.field.target": "Target image",
  "patch.field.header": "Boot header",
  "patch.field.pageSize": "Page size",
  "patch.field.sourceSha256": "Source SHA-256",
  "patch.field.planId": "Plan id",
  "patch.field.reproducible": "Reproducible",
  "patch.value.notRecorded": "not recorded",
  "patch.value.yes": "yes",
  "patch.value.no": "no",
  "patch.value.none": "none",
  "patch.banner.upstream": "This runs the upstream {provider} implementation.",
  "patch.banner.mock.title": "This is the Mock Provider.",
  "patch.banner.mock.body":
    "It rewrites the kernel cmdline and writes a bootconfig manifest so the pipeline can be verified end to end. It does not root a device.",
  "patch.banner.apatch.body":
    "KernelPatch is injected into the kernel image inside boot.img by the upstream kptools build running in WebAssembly. The ramdisk is untouched, the original AVB signature is dropped, and flashing the result is your responsibility.",
  "patch.banner.kernelsu.body":
    "The ksuinit wrapper and the KernelSU module are written into the ramdisk by this browser build. The kernel is untouched, the original AVB signature is dropped, and flashing the result is your responsibility.",
  "patch.banner.magisk.body":
    "magiskinit and Magisk's payloads are written into the ramdisk by this browser build. The kernel is untouched, the original AVB signature is dropped, and flashing the result is your responsibility.",
  "patch.kpimg.title": "KernelPatch flavour",
  "patch.kpimg.description":
    "Which core image is injected. Each build only trusts its own manager app, so the manager below must be installed for the patch to be usable.",
  "patch.kpimg.custom": "Custom core image (attach your own)",
  "patch.kpimg.attach": "Attach a core image",
  "patch.kpimg.none": "no core image attached",
  "patch.kpimg.attached": "attached",
  "patch.kpimg.requiredManager": "required manager",
  "patch.kpimg.unknownManager": "unknown",
  "patch.kpimg.hint":
    "It has to be a KernelPatch core image (it starts with KP1158). The bytes travel with this run only, the plan records the file name, and the result reports the digest and the version kptools reads from it. Whatever manager it was built to trust is the one the device needs.",
  "patch.kpm.title": "KernelPatch modules (KPM)",
  "patch.kpm.description":
    "Optional. Each module is embedded into the patched kernel image. The bytes stay in your browser and are only handed to the patch worker for this run; the plan records the names.",
  "patch.kpm.attach": "Attach .kpm files",
  "patch.kpm.none": "plan: no modules",
  "patch.kpm.hint":
    "Modules are embedded exactly as provided. Whether a module loads at boot depends on the module and the kernel, and its licence is yours to check.",
  "patch.kernelsu.title": "Device KMI and module",
  "patch.kernelsu.description":
    "The KernelSU module has to match the kernel module interface of the device. It can only be read from an image that carries a kernel, so an init_boot image needs it selected here.",
  "patch.kernelsu.selectKmi": "select the device KMI",
  "patch.kernelsu.override": "Override the bundled module",
  "patch.kernelsu.overrideWith": "Override with {name}",
  "patch.kernelsu.noModule": "plan: no module attached",
  "patch.kernelsu.hint.before":
    "This build already ships the module for the selected KMI and uses it by default; attaching one (named",
  "patch.kernelsu.hint.after": ") overrides it. Find the KMI with",
  "patch.kernelsu.hint.tail": "on the device: 6.6.118-android15-... means android15-6.6.",
  "patch.magisk.title": "Magisk options",
  "patch.magisk.description": "These are what Magisk reads at boot from .backup/.magisk.",
  "patch.magisk.keepVerity": "Keep verity (KEEPVERITY)",
  "patch.magisk.keepVerity.body":
    "On keeps verity enabled and leaves fstab alone. Off removes magiskboot's verity flags from any fstab entry inside the ramdisk and drops verity_key.",
  "patch.magisk.keepForceEncrypt": "Keep forced encryption (KEEPFORCEENCRYPT)",
  "patch.magisk.keepForceEncrypt.body":
    "On keeps forced encryption and leaves fstab alone. Off removes the encryption flags magiskboot removes (forceencrypt, forcefdeorfbe, fileencryption).",
  "patch.magisk.preinit": "Pre-init storage (PREINITDEVICE)",
  "patch.magisk.preinit.placeholder": "auto (Magisk detects it)",
  "patch.magisk.preinit.hint.before": "Read it on the device with",
  "patch.magisk.preinit.hint.after":
    ", for example sda10. Leaving it empty lets Magisk detect it at boot.",
  "patch.superkey.title": "Root credentials",
  "patch.superkey.description":
    "Optional. Without a key the injected KernelPatch authenticates the manager by its signature. With one, the key is hashed into the kernel so an authorised client can use it and rotate it at runtime.",
  "patch.superkey.placeholder.set": "a superkey is set",
  "patch.superkey.placeholder.none": "no superkey (default)",
  "patch.superkey.hint":
    "The key is sent to the patch worker for this run only. Only its SHA-256 is written into the kernel; the plan, the metadata and the produced image never contain the key itself. Leave the field empty and apply to go back to the signature default.",
  "patch.output.title": "Output",
  "patch.output.description":
    "Device images are usually whole-partition dumps, so only the boot image itself is kept by default.",
  "patch.output.preserve": "Preserve the original image size",
  "patch.output.preserve.body":
    "Zero pads the output to {size} so tools that expect a partition sized image keep their file size. The AVB signature stays invalid either way.",
  "patch.output.keepSignature": "Keep the original AVB bytes",
  "patch.output.keepSignature.body":
    "The official patchers keep the signature area of the source image. Those bytes are stale after a patch either way, so verified boot fails with or without them; turn this off to leave the area empty instead.",
  "patch.back": "Back to analysis",
  "patch.start": "Start patch",
  "common.apply": "Apply",
  "common.clear": "Clear",

  "process.title": "Patching image",
  "process.subtitle": "{message} · all processing stays on this device.",
  "process.working": "Working",
  "process.aria.progress": "Patch progress",
  "process.cancel": "Cancel",
  "process.message.preparing": "Preparing",
  "process.message.complete": "Patch complete",
  "process.stage.analyze.label": "Analyze",
  "process.stage.analyze.description": "Reading the boot header",
  "process.stage.extract.label": "Extract",
  "process.stage.extract.description": "Splitting kernel and ramdisk",
  "process.stage.prepare.label": "Prepare",
  "process.stage.prepare.description": "Building the patch payload",
  "process.stage.patch.label": "Patch",
  "process.stage.patch.description": "Applying the provider pipeline",
  "process.stage.repack.label": "Repack",
  "process.stage.repack.description": "Rebuilding the boot image",
  "process.stage.verify.label": "Verify",
  "process.stage.verify.description": "Re-parsing and hashing the output",
  "process.stage.complete.label": "Complete",
  "process.stage.complete.description": "Output ready to download",
  "process.failed.title": "The patch did not finish",
  "process.failed.body":
    "Nothing is running now. The reason is below, and technical details are available.",
  "process.failed.back": "Back to the patch plan",
  "process.failed.restart": "Start over",
  "process.idle.title": "Nothing is being processed",
  "process.idle.body": "Start from an image, choose a patch method and press Start patch.",
  "process.idle.select": "Select an image",

  "result.title": "Patch complete",
  "result.subtitle": "The output image was repacked and re-verified in the browser.",
  "result.meta": "{size} · target {target} · provider {provider}",
  "result.verified": "Verified",
  "result.needsAttention": "Needs attention",
  "result.verification": "Verification",
  "result.compactNote":
    "Input {input} → output {output}. The input was a whole-partition image: partition padding and the AVB blob are not part of a boot image, so the output is the compact boot image that mkbootimg and Magisk also produce. The kernel itself is unchanged apart from the patch.",
  "result.paddedNote":
    "The output was zero padded to {size} so it keeps the original image size. The padding is not part of the boot image, and the AVB signature is still invalid.",
  "result.download": "Download image",
  "result.another": "Patch another image",
  "result.note.mock":
    "Produced by the Mock Provider. This output demonstrates the pipeline, not a root solution: it rewrites the kernel cmdline and the bootconfig manifest. Flashing it will not grant root.",
  "result.note.apatch":
    "Produced by {provider}{kernelPatch}. Only the kernel section was modified. The AVB signature was dropped, so verified boot will fail unless the image is re-signed or verification is disabled. ImageForge never flashes a device.",
  "result.note.withKernelPatch": " with KernelPatch {version}",
  "result.note.ramdisk":
    "Produced by {provider}. The ramdisk was modified and the kernel is untouched. The AVB signature was dropped, so verified boot will fail unless the image is re-signed or verification is disabled. ImageForge never flashes a device.",
  "result.warnings": "Warnings",
  "result.technical": "Technical details",
  "result.technical.description": "Patch metadata recorded by the engine and the provider.",
  "result.settingsLink": "Inspect the artifact registry and runtime settings",

  "settings.title": "Settings",
  "settings.subtitle": "Runtime, registry and appearance. Everything is stored locally.",
  "settings.appearance.title": "Appearance",
  "settings.appearance.description": "Design tokens switch between the light and dark themes.",
  "settings.language.title": "Language",
  "settings.language.description":
    "The interface language. Patch records, artifact digests and upstream names keep their own spelling.",
  "settings.runtime.title": "Runtime",
  "settings.runtime.description": "Heavy work executes off the main thread.",
  "settings.runtime.executor": "Executor",
  "settings.runtime.executor.worker": "Web Worker (Comlink RPC)",
  "settings.runtime.executor.inline": "Inline session (no Worker available)",
  "settings.runtime.wasm": "WASM module",
  "settings.runtime.wasm.loaded": "loaded {version}",
  "settings.runtime.wasm.fallback": "TypeScript fallback",
  "settings.runtime.wasm.checking": "checking",
  "settings.runtime.wasmPath": "WASM path",
  "settings.runtime.limit": "Image size limit",
  "settings.runtime.reason": "Reason: {reason} Run {command} to produce the WebAssembly module.",
  "settings.artifacts.title": "Artifact registry",
  "settings.artifacts.description":
    "Versions, architectures and digests are declared here, never hardcoded in the UI.",
  "settings.artifacts.count": "{count} artifact(s)",
  "settings.artifacts.notRecorded": "not recorded",
  "settings.artifacts.source": "source {source}",
  "settings.artifacts.unknownSource": "unknown",
  "settings.artifacts.remote":
    "Remote artifact downloads are not part of this build. Upstream releases, their build systems and their licenses must be reviewed before a provider is implemented.",
  "settings.providers.title": "Patch providers",
  "settings.providers.description":
    "Providers only see the normalized image produced by the Image Engine.",
  "settings.providers.available": "Available",
  "settings.providers.planned": "Planned",
  "settings.providers.upstream": "upstream",
  "settings.license.title": "License",
  "settings.license.description": "ImageForge is AGPL-3.0-or-later.",
  "settings.license.body":
    "Third-party components keep their own licenses and are never re-licensed. See LICENSE, NOTICE and THIRD_PARTY_LICENSES/ in the repository root. No upstream root solution code is bundled in this build.",

  "notfound.title": "This page does not exist",
  "notfound.body": "The workflow starts with selecting an Android image.",
  "notfound.back": "Back to the start",

  "error.showTechnical": "Show technical details",
  "error.hideTechnical": "Hide technical details",
  "error.technicalLabel": "technical detail",

  "code.value": "value",
  "code.copy": "Copy",
  "code.copied": "Copied",
  "code.aria.copy": "Copy value",

  "check.status.pass": "Passed",
  "check.status.warn": "Warning",
  "check.status.fail": "Failed",
  "check.size-limit": "Output size within limits",
  "check.structure": "Image structure valid",
  "check.format": "Image format matches the patch plan",
  "check.header-version": "Boot header version matches the patch plan",
  "check.ramdisk-payload": "Ramdisk payload readable",
  "check.ramdisk-hash": "Ramdisk SHA-256 matches the patch plan",
  "check.kernel-hash": "Kernel SHA-256 matches the patch plan",
  "check.cmdline": "Kernel cmdline carries the planned options",
  "check.bootconfig": "Bootconfig carries the patch manifest",

  "reason.not-implemented": "Not implemented in this build.",
  "reason.format": "Does not support {format} images.",
  "reason.header": "Boot header v{version} is outside the supported range.",
  "reason.architecture": "Architecture {architecture} is not supported.",
  "reason.no-kernel": "The image has no kernel section to patch.",
  "reason.no-ramdisk": "The image has no ramdisk section.",
  "reason.no-release": "No artifact release is registered for this provider.",

  "warning.unknown-architecture":
    "The kernel architecture could not be determined; architecture checks were skipped.",
  "warning.unsupported-kernel-compression":
    "The kernel payload is {compression}, which this build cannot expand; the kernel could not be patched safely.",
  "warning.unsupported-compression":
    "{compression} ramdisk payloads cannot be expanded in this build; the compressed payload would be copied unchanged.",
} as const;

export type MessageKey = keyof typeof en;

export type Messages = Record<MessageKey, string>;

export const MESSAGE_KEYS = Object.keys(en) as MessageKey[];
