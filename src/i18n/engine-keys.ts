import type { CompatibilityWarning, PatchCandidate } from "@/core";
import type { MessageKey } from "./messages/en";
import type { MessageParams, Translator } from "./translate";

/**
 * The engine reports verdicts as stable codes plus parameters, and the interface owns the wording.
 * A code that is not in these tables falls back to the English sentence the engine sent, so a new
 * engine code degrades to English instead of showing nothing.
 */
export const REASON_KEYS: Record<string, MessageKey> = {
  "not-implemented": "reason.not-implemented",
  format: "reason.format",
  header: "reason.header",
  architecture: "reason.architecture",
  "no-kernel": "reason.no-kernel",
  "no-ramdisk": "reason.no-ramdisk",
  "no-release": "reason.no-release",
};

export const WARNING_KEYS: Record<string, MessageKey> = {
  "unknown-architecture": "warning.unknown-architecture",
  "unsupported-kernel-compression": "warning.unsupported-kernel-compression",
  "unsupported-compression": "warning.unsupported-compression",
};

export const CHECK_KEYS: Record<string, MessageKey> = {
  "size-limit": "check.size-limit",
  structure: "check.structure",
  format: "check.format",
  "header-version": "check.header-version",
  "ramdisk-payload": "check.ramdisk-payload",
  "ramdisk-hash": "check.ramdisk-hash",
  "kernel-hash": "check.kernel-hash",
  cmdline: "check.cmdline",
  bootconfig: "check.bootconfig",
};

/** One entry per reason, in the order the engine reported them. */
export function reasonMessages(
  t: Translator,
  candidate: Pick<PatchCandidate, "reasons"> & Partial<Pick<PatchCandidate, "reasonDetails">>,
): string[] {
  const details = candidate.reasonDetails;
  if (!details || details.length !== candidate.reasons.length) return candidate.reasons;
  return details.map((detail, index) => reasonMessage(t, detail, candidate.reasons[index]));
}

export function reasonMessage(
  t: Translator,
  detail: { code: string; params?: MessageParams },
  fallback: string,
): string {
  const key = REASON_KEYS[detail.code];
  if (!key) return fallback;
  return t(key, detail.params);
}

export function warningMessage(t: Translator, warning: CompatibilityWarning): string {
  const key = WARNING_KEYS[warning.code];
  if (!key) return warning.message;
  return t(key, warning.params);
}

export function checkLabel(t: Translator, check: { id: string; label: string }): string {
  const key = CHECK_KEYS[check.id];
  return key ? t(key) : check.label;
}
