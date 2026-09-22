import { describe, expect, it } from "vitest";
import { WorkerError } from "@/core/errors";
import { sha256Hex } from "@/core/hash";
import { createPatchWorkerClient } from "@/workers/client";
import { PatchWorkerSession } from "@/workers/session";
import { buildBootImage } from "../fixtures/bootimg";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function zipBytes(): Uint8Array {
  const bytes = new Uint8Array(128);
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  return bytes;
}

describe("PatchWorkerSession", () => {
  it("reports its protocol version", async () => {
    const session = new PatchWorkerSession();
    await expect(session.version()).resolves.toBe("1.0.0");
  });

  it("analyzes an image and describes the environment", async () => {
    const session = new PatchWorkerSession();
    const response = await session.analyze(toArrayBuffer(await buildBootImage({})), "boot.img");

    expect(response.summary.format).toBe("boot");
    expect(response.summary.headerVersion).toBe(4);
    expect(response.sha256).toHaveLength(64);
    expect(response.crc32).toHaveLength(8);
    expect(response.report.groups.map((group) => group.id)).toEqual([
      "image",
      "boot",
      "kernel",
      "ramdisk",
      "metadata",
    ]);
    expect(response.providers.map((provider) => provider.id)).toContain("mock");
    expect(response.wasm.path).toBe("/wasm/imageforge.wasm");
  });

  it("requires an analyzed image before planning", async () => {
    const session = new PatchWorkerSession();
    await expect(session.plan({ providerId: "mock" })).rejects.toThrowError(WorkerError);
    await expect(session.patch({ providerId: "mock" })).rejects.toThrowError(WorkerError);
  });

  it("plans and patches through the session API", async () => {
    const session = new PatchWorkerSession();
    await session.analyze(toArrayBuffer(await buildBootImage({})), "boot.img");

    const planned = await session.plan({ providerId: "mock" });
    expect(planned.plan.providerId).toBe("mock");
    expect(planned.providerNotes.length).toBeGreaterThan(0);

    const progress: number[] = [];
    const response = await session.patch({ providerId: "mock" }, (event) => progress.push(event.progress));

    expect(response.bytes.byteLength).toBe(response.sizeBytes);
    expect(response.verification.verification.valid).toBe(true);
    expect(response.metadata.mock).toBe("true");
    expect(progress.at(-1)).toBe(100);
  });

  it("opens a file into the workspace and says what it is", async () => {
    const session = new PatchWorkerSession();
    const source = await session.openSource(toArrayBuffer(zipBytes()), "ota.zip");

    expect(source).toMatchObject({ id: "source-1", name: "ota.zip", kind: "package", sizeBytes: 128 });
    expect(source.detected.container).toBe("zip");
    expect((await session.workspace()).sources).toEqual([source]);
  });

  it("analyzes a source that is already open", async () => {
    const session = new PatchWorkerSession();
    const source = await session.openSource(toArrayBuffer(await buildBootImage({})), "boot.img");

    expect(source.kind).toBe("boot-container");
    const response = await session.analyzeSource(source.id);
    expect(response.summary.format).toBe("boot");
  });

  it("keeps what a tool produced, with its lineage and a ranged read", async () => {
    const session = new PatchWorkerSession();
    const source = await session.openSource(toArrayBuffer(zipBytes()), "ota.zip");
    const image = await buildBootImage({});
    const artifact = await session.registerArtifact({
      sourceId: source.id,
      parentId: source.id,
      tool: "extract",
      name: "init_boot.img",
      params: { partition: "init_boot" },
      bytes: toArrayBuffer(image),
    });

    expect(artifact).toMatchObject({
      id: "source-1:extract:init_boot.img",
      sourceId: "source-1",
      parentId: "source-1",
      tool: "extract",
      kind: "boot-container",
      sizeBytes: image.length,
    });
    const head = new Uint8Array(await session.readArtifact(artifact.id, 0, 8));
    expect(new TextDecoder().decode(head)).toBe("ANDROID!");
    // reading past the end is clamped instead of throwing
    expect((await session.readArtifact(artifact.id, image.length - 4, 64)).byteLength).toBe(4);
    expect(await session.digestArtifact(artifact.id)).toBe(await sha256Hex(image));
    expect((await session.workspace()).artifacts).toHaveLength(1);
  });

  it("closes a source together with everything derived from it", async () => {
    const session = new PatchWorkerSession();
    const source = await session.openSource(toArrayBuffer(zipBytes()), "ota.zip");
    const artifact = await session.registerArtifact({
      sourceId: source.id,
      parentId: source.id,
      tool: "extract",
      name: "boot.img",
      bytes: toArrayBuffer(await buildBootImage({})),
    });

    await session.closeSource(source.id);

    expect((await session.workspace()).sources).toHaveLength(0);
    expect((await session.workspace()).artifacts).toHaveLength(0);
    await expect(session.readArtifact(artifact.id)).rejects.toThrowError(WorkerError);
  });

  it("refuses a file it cannot hold and an unknown id", async () => {
    const session = new PatchWorkerSession();
    await expect(session.openSource(new ArrayBuffer(0), "empty")).rejects.toThrowError(WorkerError);
    await expect(session.readArtifact("source-404")).rejects.toThrowError(WorkerError);
    await expect(session.closeSource("source-404")).rejects.toThrowError(WorkerError);
  });

  it("goes through the same workspace when the client falls back to the inline session", async () => {
    const client = createPatchWorkerClient();
    const source = await client.openSource(toArrayBuffer(await buildBootImage({})), "init_boot.img");

    expect(client.mode).toBe("inline");
    expect(source.kind).toBe("boot-container");
    const response = await client.analyzeSource(source.id);
    expect(response.summary.headerVersion).toBe(4);
    await client.reset();
    expect((await client.workspace()).sources).toHaveLength(0);
    client.terminate();
  });
});
