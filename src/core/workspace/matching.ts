import { kindLabel } from "./kinds";
import type { ArtifactKind } from "./kinds";

/** What a tool can work on, and what it turns that into. */
export interface ToolCapability {
  id: string;
  accepts: ArtifactKind[];
  produces: ArtifactKind[];
  status: "available" | "planned";
}

/**
 * A verdict the interface words itself, like the compatibility engine does for images: a stable
 * code plus the parameters its message asks for.
 */
export interface ToolReason {
  code: string;
  params?: Record<string, string>;
}

export interface ToolMatch {
  tool: ToolCapability;
  /** The tool can start from what the user is holding. */
  compatible: boolean;
  /** The tool is implemented in this build. */
  implemented: boolean;
  reasons: ToolReason[];
}

/**
 * Which tools apply to a selection. Without a selection every tool is listed, with what it accepts,
 * because a tool site has to be able to say what it can do before it has anything to do it with.
 */
export function matchTools(kind: ArtifactKind | null, tools: ToolCapability[]): ToolMatch[] {
  return tools.map((tool) => {
    const compatible = kind === null || tool.accepts.includes(kind);
    const implemented = tool.status === "available";
    const reasons: ToolReason[] = [];
    if (!compatible && kind !== null) {
      reasons.push({ code: "wrong-kind", params: { accepts: tool.accepts.map(kindLabel).join(", ") } });
    }
    if (!implemented) reasons.push({ code: "planned" });
    return { tool, compatible, implemented, reasons };
  });
}
