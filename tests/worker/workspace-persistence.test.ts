import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PatchWorkerSession } from "@/workers/session";
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
