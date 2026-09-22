import type { DetectedArtifact } from "./detect";
import type { ArtifactKind } from "./kinds";

/** A file the user opened. Its bytes live in the worker session, never in this list. */
export interface WorkspaceSource {
  id: string;
  name: string;
  sizeBytes: number;
  kind: ArtifactKind;
  detected: DetectedArtifact;
}

/** Something a tool produced out of a source, with the provenance of how it was made. */
export interface WorkspaceArtifact {
  id: string;
  /** The source this lineage started from. */
  sourceId: string;
  /** The artifact or source it was derived from. */
  parentId: string;
  /** The tool that produced it. */
  tool: string;
  /** The parameters that tool ran with. */
  params: Record<string, string>;
  name: string;
  sizeBytes: number;
  kind: ArtifactKind;
  detected: DetectedArtifact;
}

export interface Workspace {
  sources: WorkspaceSource[];
  artifacts: WorkspaceArtifact[];
}

export function emptyWorkspace(): Workspace {
  return { sources: [], artifacts: [] };
}

export function addSource(workspace: Workspace, source: WorkspaceSource): Workspace {
  return { sources: [...workspace.sources, source], artifacts: workspace.artifacts };
}

export function addArtifact(workspace: Workspace, artifact: WorkspaceArtifact): Workspace {
  return { sources: workspace.sources, artifacts: [...workspace.artifacts, artifact] };
}

export function removeSource(workspace: Workspace, sourceId: string): Workspace {
  // A source takes its lineage with it: an artifact whose bytes came from it cannot outlive it.
  return {
    sources: workspace.sources.filter((source) => source.id !== sourceId),
    artifacts: workspace.artifacts.filter((artifact) => artifact.sourceId !== sourceId),
  };
}

export function sourceById(workspace: Workspace, id: string): WorkspaceSource | undefined {
  return workspace.sources.find((source) => source.id === id);
}

export function artifactById(workspace: Workspace, id: string): WorkspaceArtifact | undefined {
  return workspace.artifacts.find((artifact) => artifact.id === id);
}

/** The source an artifact (or source) belongs to, following the chain of derivations. */
export function lineageOf(workspace: Workspace, id: string): WorkspaceSource | undefined {
  const source = sourceById(workspace, id);
  if (source) return source;
  let current = artifactById(workspace, id);
  const seen = new Set<string>();
  while (current) {
    const owner = sourceById(workspace, current.sourceId);
    if (owner) return owner;
    if (seen.has(current.id)) return undefined;
    seen.add(current.id);
    current = artifactById(workspace, current.parentId);
  }
  return undefined;
}

export function childrenOf(workspace: Workspace, id: string): WorkspaceArtifact[] {
  return workspace.artifacts.filter((artifact) => artifact.parentId === id);
}

/**
 * A derived artifact is named after what it is, not after where it came from: the same partition
 * extracted from the same package twice has to land on the same id, so a caller can detect that the
 * work is already done.
 */
export function derivedArtifactId(sourceId: string, tool: string, name: string): string {
  return sourceId + ":" + tool + ":" + name;
}
