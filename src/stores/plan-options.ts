/**
 * Options for a re-plan.
 *
 * Several controls on the patch page can trigger a re-plan (flavour, output size, modules,
 * superkey). Each of them only knows about its own value, so the current plan configuration is
 * used as the base: without that, changing one control silently drops what another one set,
 * and the plan stops matching the run (which the provider then rejects).
 */
export function mergePlanOptions(
  planConfiguration: Record<string, string> | undefined,
  draft: Record<string, string>,
  patch: Record<string, string>,
): Record<string, string> {
  return { ...(planConfiguration ?? {}), ...draft, ...patch };
}
