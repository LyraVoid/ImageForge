/**
 * The KernelSU provider's plan configuration keys, entry names and the KMI sentinel handling. Kept
 * apart from the implementation for the same reason as the APatch one: planning a KernelSU patch
 * must not need the ramdisk patching code.
 */

/** Plan configuration key holding the device KMI, for example android15-6.6. */
export const KERNELSU_KMI_SETTING = "kmi";

/** Plan configuration key holding extra ksud flags, for example "norc=1 allow_shell=1". */
export const KERNELSU_CONFIG_SETTING = "ksuConfig";

/** Entry names, exactly as ksud writes them. */
export const KERNELSU_INIT_ENTRY = "init";
export const KERNELSU_INIT_BACKUP_ENTRY = "init.real";
export const KERNELSU_MODULE_ENTRY = "kernelsu.ko";
export const KERNELSU_CONFIG_ENTRY = "ksu_config";

export const KERNELSU_MODULE_NAME = "kernelsu";

export const KERNELSU_REQUIRED_MANAGER = "me.weishu.kernelsu";

/**
 * The KMI a plan pins, or an empty string when it has not been chosen yet. The plan stores the
 * sentinel "unset" so it can be displayed, but nothing outside the plan should ever have to know
 * that: this turns it back into "not chosen".
 */
export function plannedKmi(configuration: Record<string, string> | undefined): string {
  const value = (configuration?.[KERNELSU_KMI_SETTING] ?? "").trim();
  return value === "unset" || value === "none" ? "" : value;
}
