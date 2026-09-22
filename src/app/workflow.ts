import { useMemo } from "react";
import type { StepDefinition } from "@/components/ui/step-indicator";
import { useT } from "@/i18n/use-translation";
import type { MessageKey } from "@/i18n";

/**
 * The workflow order and the path mapping are structure; only the labels are language. Keeping
 * the keys here means the step names live in the catalogues like every other message.
 */
export const WORKFLOW_STEP_KEYS: Array<{ id: string; labelKey: MessageKey }> = [
  { id: "image", labelKey: "step.image" },
  { id: "analyze", labelKey: "step.analyze" },
  { id: "patch", labelKey: "step.patch" },
  { id: "verify", labelKey: "step.verify" },
  { id: "result", labelKey: "step.result" },
];

export function useWorkflowSteps(): StepDefinition[] {
  const t = useT();
  return useMemo(
    () => WORKFLOW_STEP_KEYS.map((step) => ({ id: step.id, label: t(step.labelKey) })),
    [t],
  );
}

export function stepIndexForPath(pathname: string): number {
  if (pathname.startsWith("/analyze")) return 1;
  if (pathname.startsWith("/patch")) return 2;
  if (pathname.startsWith("/processing")) return 3;
  if (pathname.startsWith("/result")) return 4;
  return 0;
}
