import type { DetectedArtifact } from "@/core/workspace";
import type { WorkspaceSourceRecord } from "./protocol";
import type { WorkspaceArtifact } from "@/core/workspace";

/**
 * The workspace, kept between visits.
 *
 * A page reload used to throw everything away: the sources, every artifact a tool had produced, the
 * comparison that was on screen. This keeps the records in IndexedDB, so what the user built is still
 * there when they come back, and keeps small files of bytes too — an artifact up to 16 MiB, a source
 * up to 64 MiB. A big source is not copied (an 8 GiB OTA would be), so a restored source asks for the
 * file again; everything derived from it is still there, which is the part that took work.
 *
 * Every function is a no-op when IndexedDB is missing, and every failure is swallowed after a log:
 * persistence must never be the reason a tool stops working.
 */
const DB_NAME = "imageforge-workspace";
const DB_VERSION = 1;
const ARTIFACTS = "artifacts";
const SOURCES = "sources";

/** A source file up to this size is kept, so a reload does not ask for it again. */
export const KEEP_SOURCE_BYTES = 64 * 1024 * 1024;
/** Artifact bytes are kept up to this size; a larger one stays a record and can be rebuilt. */
export const KEEP_ARTIFACT_BYTES = 16 * 1024 * 1024;

export interface StoredArtifact {
  id: string;
  sourceId: string;
  parentId: string;
  tool: string;
  name: string;
  params: Record<string, string>;
  sizeBytes: number;
  kind: WorkspaceArtifact["kind"];
  detected: DetectedArtifact;
  /** The artifact's bytes, when they were small enough to keep. */
  bytes?: Blob;
}

export interface StoredSource {
  id: string;
  name: string;
  sizeBytes: number;
  kind: WorkspaceSourceRecord["kind"];
  detected: DetectedArtifact;
  /** The file itself, when it was small enough to keep. */
  bytes?: Blob;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ARTIFACTS)) database.createObjectStore(ARTIFACTS, { keyPath: "id" });
      if (!database.objectStoreNames.contains(SOURCES)) database.createObjectStore(SOURCES, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(store: string, value: unknown): Promise<void> {
  if (!available()) return;
  try {
    const database = await open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, "readwrite");
      transaction.objectStore(store).put(value as never);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch (error) {
    console.warn("imageforge: could not persist to the workspace", error);
  }
}

async function remove(store: string, id: string): Promise<void> {
  if (!available()) return;
  try {
    const database = await open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, "readwrite");
      transaction.objectStore(store).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch (error) {
    console.warn("imageforge: could not remove from the workspace", error);
  }
}

async function readAll<T>(store: string): Promise<T[]> {
  if (!available()) return [];
  try {
    const database = await open();
    const values = await new Promise<T[]>((resolve, reject) => {
      const transaction = database.transaction(store, "readonly");
      const request = transaction.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return values;
  } catch (error) {
    console.warn("imageforge: could not read the workspace", error);
    return [];
  }
}

export function saveSource(record: WorkspaceSourceRecord, bytes: Blob | null): Promise<void> {
  const value: StoredSource = {
    id: record.id,
    name: record.name,
    sizeBytes: record.sizeBytes,
    kind: record.kind,
    detected: record.detected,
    ...(bytes && bytes.size <= KEEP_SOURCE_BYTES ? { bytes } : {}),
  };
  return write(SOURCES, value);
}

export function saveArtifact(record: WorkspaceArtifact, bytes: Blob | null): Promise<void> {
  const value: StoredArtifact = {
    id: record.id,
    sourceId: record.sourceId,
    parentId: record.parentId,
    tool: record.tool,
    name: record.name,
    params: record.params,
    sizeBytes: record.sizeBytes,
    kind: record.kind,
    detected: record.detected,
    ...(bytes && bytes.size <= KEEP_ARTIFACT_BYTES ? { bytes } : {}),
  };
  return write(ARTIFACTS, value);
}

export function forgetArtifact(id: string): Promise<void> {
  return remove(ARTIFACTS, id);
}

export function forgetSource(id: string): Promise<void> {
  return remove(SOURCES, id);
}

export function loadWorkspace(): Promise<{ artifacts: StoredArtifact[]; sources: StoredSource[] }> {
  return Promise.all([readAll<StoredArtifact>(ARTIFACTS), readAll<StoredSource>(SOURCES)]).then(
    ([artifacts, sources]) => ({ artifacts, sources }),
  );
}

export async function clearWorkspace(): Promise<void> {
  await Promise.all([readAll(ARTIFACTS), readAll(SOURCES)]).then(async ([artifacts, sources]) => {
    await Promise.all((artifacts as StoredArtifact[]).map((entry) => forgetArtifact(entry.id)));
    await Promise.all((sources as StoredSource[]).map((entry) => forgetSource(entry.id)));
  });
}
