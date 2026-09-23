import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useForgeStore } from "@/stores/forge-store";
import { PatchWorkerSession } from "@/workers/session";
import { saveSource } from "@/workers/persistence";
import { toFile } from "../fixtures/bootimg";
import { sha256Hex } from "@/core/hash";
import { installFakeIndexedDb } from "../fixtures/indexeddb";
import { buildZip } from "../fixtures/zip";

let database: { clear: () => void } | null = null;

beforeEach(() => {
  database = installFakeIndexedDb();
});

afterEach(() => {
  database?.clear();
  database = null;
});

describe("the workspace between visits", () => {
  it("brings back the artifacts and a source small enough to keep", async () => {
    const first = new PatchWorkerSession();
    const content = new Uint8Array(8192).fill(0x41);
    const zip = await buildZip([{ name: "system.img", data: content }]);
    const source = await first.openSource(new Blob([zip as BlobPart]), "images.zip");
    const artifact = await first.extractPackageEntry(source.id, "system.img");
    const expected = await sha256Hex(content);
    expect(artifact.sizeBytes).toBe(content.length);

    // a reload: a brand new session, with the same database underneath
    const second = new PatchWorkerSession();
    const snapshot = await second.restoreWorkspace();

    expect(snapshot.sources.map((entry) => entry.name)).toEqual(["images.zip"]);
    expect(snapshot.artifacts.map((entry) => entry.name)).toEqual(["system.img"]);

    // the artifact's bytes came back too, so nothing has to be built again
    const restored = snapshot.artifacts[0];
    expect(await sha256Hex(new Uint8Array(await second.readArtifact(restored.id, 0, restored.sizeBytes)))).toBe(expected);

    // and so did the source, because it was small enough to keep
    expect(await sha256Hex(new Uint8Array(await second.readArtifact(snapshot.sources[0].id, 0, zip.length)))).toBe(
      await sha256Hex(zip),
    );

    // closing it forgets both, so a later reload cannot resurrect them
    await second.closeSource(snapshot.sources[0].id);
    const third = new PatchWorkerSession();
    const empty = await third.restoreWorkspace();
    expect(empty.sources).toEqual([]);
    expect(empty.artifacts).toEqual([]);
  });
});

describe("a restore that lands late", () => {
  it("does not steal the file the user opened, and says which restored sources need the file", async () => {
    // what an earlier visit left behind: a source too big to keep, so only its record
    await saveSource(
      {
        id: "source-9",
        name: "huge.zip",
        sizeBytes: 8 * 1024 * 1024 * 1024,
        kind: "package",
        detected: { container: "zip", content: "unknown", kind: "package", label: "zip", packed: true },
        attached: true,
      } as never,
      null,
    );

    const session = new PatchWorkerSession();
    // the user opens their own file while the restore is still on its way
    const zip = await buildZip([{ name: "a.img", data: new Uint8Array(4096).fill(7) }]);
    const mine = await session.openSource(new Blob([zip as BlobPart]), "mine.zip");

    const snapshot = await session.restoreWorkspace();
    expect(mine.attached).toBe(true);
    expect(snapshot.sources.find((entry) => entry.id === mine.id)?.attached).toBe(true);
    // the restored one knows it cannot be read yet, rather than pretending
    expect(snapshot.sources.find((entry) => entry.id === "source-9")?.attached).toBe(false);
    await expect(session.readArtifact("source-9", 0, 8)).rejects.toThrowError(/again/i);
  });
});

describe("the store keeps what the user did", () => {
  it("merges a late restore, and clearing really clears", async () => {
    const store = () => useForgeStore.getState();
    await store().reset();
    const zip = await buildZip([{ name: "a.img", data: new Uint8Array(4096).fill(7) }]);
    await store().analyzeFile(toFile(zip, "images.zip"));
    const opened = store().source;
    expect(opened).not.toBeNull();
    expect(await store().extractEntry("a.img")).not.toBeNull();
    const artifacts = store().artifacts.length;

    // the restore lands afterwards: it must add to the workspace, not replace it
    await store().restoreWorkspace();
    expect(store().source?.id).toBe(opened?.id);
    expect(store().artifacts.length).toBe(artifacts);

    // and there is a way out: clearing empties the store and what the browser kept
    await store().clearWorkspace();
    expect(store().artifacts).toHaveLength(0);
    expect(store().source).toBeNull();
    const fresh = new PatchWorkerSession();
    expect((await fresh.restoreWorkspace()).artifacts).toEqual([]);
  });
});
