import type { StepDefinition } from "@/components/ui/step-indicator";

export const WORKFLOW_STEPS: StepDefinition[] = [
  { id: "image", label: "Image" },
  { id: "analyze", label: "Analyze" },
  { id: "patch", label: "Patch" },
  { id: "verify", label: "Verify" },
  { id: "result", label: "Result" },
];

export function stepIndexForPath(pathname: string): number {
  if (pathname.startsWith("/analyze")) return 1;
  if (pathname.startsWith("/patch")) return 2;
  if (pathname.startsWith("/processing")) return 3;
  if (pathname.startsWith("/result")) return 4;
  return 0;
}
