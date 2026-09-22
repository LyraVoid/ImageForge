import type { ArtifactKind } from "@/core/workspace";
import type { MessageKey } from "@/i18n";

export type ToolStatus = "available" | "planned";

/** A sequential tool owns the workflow step indicator; a single tool is one page. */
export type ToolFlow = "single" | "sequential";

/**
 * Every tool this site offers, as data. A tool declares where it starts, what it is for and whether
 * it is a flow; the tools page, the header and the routing table render from this list, so adding
 * one is a data change plus its own route — the same way providers are described rather than
 * hardcoded in the UI.
 */
export interface ToolDefinition {
  id: string;
  path: string;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  status: ToolStatus;
  flow: ToolFlow;
  /** The artifact kinds this tool can start from, and the kinds it hands back. */
  accepts: ArtifactKind[];
  produces: ArtifactKind[];
}

export const PATCH_TOOL_PREFIX = "/tools/patch";

/** The patcher's own steps. Keeping them in one place is what makes the paths editable. */
export const PATCH_ROUTES = {
  image: PATCH_TOOL_PREFIX + "/image",
  analyze: PATCH_TOOL_PREFIX + "/analyze",
  plan: PATCH_TOOL_PREFIX + "/plan",
  run: PATCH_TOOL_PREFIX + "/run",
  result: PATCH_TOOL_PREFIX + "/result",
} as const;

export const PRIMARY_TOOL_ID = "patch";

export const TOOLS: ToolDefinition[] = [
  {
    id: "patch",
    path: PATCH_ROUTES.image,
    titleKey: "tool.patch.title",
    descriptionKey: "tool.patch.description",
    status: "available",
    flow: "sequential",
    accepts: ["boot-container"],
    produces: ["boot-container"],
  },
  {
    id: "extract",
    path: "/tools/extract",
    titleKey: "tool.extract.title",
    descriptionKey: "tool.extract.description",
    status: "available",
    flow: "single",
    accepts: ["package"],
    produces: ["partition-image"],
  },
  {
    id: "unpack",
    path: "/tools/unpack",
    titleKey: "tool.unpack.title",
    descriptionKey: "tool.unpack.description",
    status: "available",
    flow: "single",
    accepts: ["partition-image", "package"],
    produces: ["boot-container", "filesystem", "blob"],
  },
  {
    id: "logo",
    path: "/tools/logo",
    titleKey: "tool.logo.title",
    descriptionKey: "tool.logo.description",
    status: "planned",
    flow: "single",
    accepts: ["logo-container", "partition-image", "blob"],
    produces: ["logo-container"],
  },
  {
    id: "inspect",
    path: "/tools/inspect",
    titleKey: "tool.inspect.title",
    descriptionKey: "tool.inspect.description",
    status: "planned",
    flow: "single",
    accepts: ["boot-container", "package", "partition-image", "filesystem", "ramdisk", "logo-container", "blob"],
    produces: ["report"],
  },
];

/** The extract tool, referenced by the unpack page when a package is opened there. */
export const EXTRACT_TOOL = TOOLS.find((tool) => tool.id === "extract") as ToolDefinition;

export const PRIMARY_TOOL = TOOLS.find((tool) => tool.id === PRIMARY_TOOL_ID) as ToolDefinition;

export function otherTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.id !== PRIMARY_TOOL_ID);
}

export function toolById(id: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.id === id);
}

/** True on every route of the sequential patcher, which is the only flow with steps. */
export function isPatchFlow(pathname: string): boolean {
  return pathname.startsWith(PATCH_TOOL_PREFIX);
}