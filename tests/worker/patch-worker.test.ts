import { describe, expect, it } from "vitest";
import { WorkerError } from "@/core/errors";
import { sha256Hex } from "@/core/hash";
import { createPatchWorkerClient } from "@/workers/client";
import { packAnimation, readAnimationZip } from "@/core/animation";
import { bytesSource } from "@/core/package";
import { logicalPartitionSource, parseSparse, parseSuper, unpackSparse } from "@/core/partition";
import { PatchWorkerSession } from "@/workers/session";
import { buildBootImage } from "../fixtures/bootimg";
import { buildPayload } from "../fixtures/payload";
import { buildZip } from "../fixtures/zip";

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

  it("lists an OTA payload and extracts one partition into the workspace", async () => {
    const session = new PatchWorkerSession();
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([{ name: "init_boot", data: image }]);
    const source = await session.openSource(toArrayBuffer(payload), "ota-payload.bin");

    expect(source.kind).toBe("package");
    const listing = await session.listPackage(source.id);
    expect(listing.kind).toBe("ota-payload");
    expect(listing.entries).toEqual([
      {
        id: "init_boot",
        name: "init_boot.img",
        sizeBytes: image.length,
        suggestedKind: "boot-container",
        requiresSource: false,
        container: null,
      },
    ]);

    const artifact = await session.extractPackageEntry(source.id, "init_boot");
    expect(artifact).toMatchObject({
      id: "source-1:extract:init_boot.img",
      kind: "boot-container",
      tool: "extract",
      params: { entry: "init_boot" },
    });
    expect(await session.digestArtifact(artifact.id)).toBe(await sha256Hex(image));

    // the artifact goes straight into the patcher, without the bytes crossing the boundary
    const analysis = await session.analyzeArtifact(artifact.id);
    expect(analysis.summary.format).toBe("init_boot");
    const planned = await session.plan({ providerId: "mock" });
    expect(planned.plan.target).toBe("init_boot");
  });

  it("lists a zip archive and extracts a stored entry", async () => {
    const session = new PatchWorkerSession();
    const image = await buildBootImage({});
    const zip = await buildZip([{ name: "images/boot.img", data: image, deflate: true }]);
    const source = await session.openSource(toArrayBuffer(zip), "vendor.zip");

    const listing = await session.listPackage(source.id);
    expect(listing.kind).toBe("zip");
    expect(listing.entries[0]).toMatchObject({ id: "images/boot.img", name: "boot.img" });

    const artifact = await session.extractPackageEntry(source.id, "images/boot.img");
    expect(artifact.name).toBe("boot.img");
    expect(artifact.sizeBytes).toBe(image.length);
    expect(await session.digestArtifact(artifact.id)).toBe(await sha256Hex(image));
  });

  it("streams a partition into a blob backed artifact when it is too big to hold", async () => {
    const session = new PatchWorkerSession();
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([{ name: "init_boot", data: image, compress: "xz" }]);
    const zip = await buildZip([{ name: "payload.bin", data: payload }]);
    const source = await session.openSource(toArrayBuffer(zip), "ota.zip");

    const artifact = await session.extractPackageEntry(source.id, "payload.bin::init_boot", { stream: true });

    expect(artifact.params?.streamed).toBe("true");
    expect(artifact.sizeBytes).toBe(image.length);
    expect(artifact.kind).toBe("boot-container");

    // the blob holds the same bytes, ranged reads work on it, and hashing it here is refused
    const blob = await session.artifactBlob(artifact.id);
    expect(await sha256Hex(new Uint8Array(await blob.arrayBuffer()))).toBe(await sha256Hex(image));
    const head = new Uint8Array(await session.readArtifact(artifact.id, 0, 8));
    expect(new TextDecoder().decode(head)).toBe("ANDROID!");
    await expect(session.digestArtifact(artifact.id)).rejects.toThrowError(WorkerError);

    // and closing the source takes the streamed artifact with it
    await session.closeSource(source.id);
    expect((await session.workspace()).artifacts).toHaveLength(0);
  });

  it("rewrites an artifact as a sparse image its own reader unpacks back", async () => {
    const session = new PatchWorkerSession();
    const image = await buildBootImage({ kernel: null });
    const zip = await buildZip([{ name: "boot.img", data: image }]);
    const source = await session.openSource(toArrayBuffer(zip), "images.zip");
    const artifact = await session.extractPackageEntry(source.id, "boot.img");

    const sparse = await session.packSparseArtifact(artifact.id);
    expect(sparse.params?.sparse).toBe("true");
    expect(sparse.params?.blockSize).toBe("4096");
    expect(sparse.name).toBe("boot.sparse.img");

    const bytes = await session.readArtifact(sparse.id, 0, sparse.sizeBytes);
    const parsed = await parseSparse(bytesSource(new Uint8Array(bytes)));
    expect(parsed.header.totalBlocks).toBe(Math.ceil(image.length / 4096));
    const unpacked = await unpackSparse(bytesSource(new Uint8Array(bytes)), parsed);
    expect(await sha256Hex(unpacked)).toBe(await sha256Hex(image));

    await session.closeSource(source.id);
  });

  it("lays extracted partitions out as a super image, then as a sparse one", async () => {
    const session = new PatchWorkerSession();
    const system = new Uint8Array(4096 * 4).map((_, index) => (index * 3) % 251);
    const vendor = new Uint8Array(4096 * 6).map((_, index) => (index * 7 + 5) % 251);
    const zip = await buildZip([
      { name: "system.img", data: system },
      { name: "vendor.img", data: vendor },
    ]);
    const source = await session.openSource(toArrayBuffer(zip), "images.zip");
    const systemArtifact = await session.extractPackageEntry(source.id, "system.img");
    const vendorArtifact = await session.extractPackageEntry(source.id, "vendor.img");

    const superArtifact = await session.packSuperImage({
      partitions: [{ artifactId: systemArtifact.id }, { artifactId: vendorArtifact.id }],
      alignment: 4096,
      groups: [{ name: "main", maximumSize: 1024 * 1024 }],
    });
    expect(superArtifact.params?.super).toBe("true");
    expect(superArtifact.params?.partitions).toBe("2");
    expect(superArtifact.name).toBe("super.img");

    // our own reader sees both partitions where they were placed
    const bytes = new Uint8Array(await session.readArtifact(superArtifact.id, 0, superArtifact.sizeBytes));
    const parsed = await parseSuper(bytesSource(bytes));
    expect(parsed.partitions.map((entry) => entry.name)).toEqual(["system", "vendor"]);
    for (const [name, content] of [["system", system], ["vendor", vendor]] as const) {
      const logical = logicalPartitionSource(bytesSource(bytes), parsed, name);
      const read = new Uint8Array(await logical.read(0, content.length));
      expect(await sha256Hex(read), name).toBe(await sha256Hex(content));
    }

    // and the sparse writer takes the super image the rest of the way, which is what lpmake -S does
    const sparseArtifact = await session.packSparseArtifact(superArtifact.id);
    const sparseBytes = new Uint8Array(await session.readArtifact(sparseArtifact.id, 0, sparseArtifact.sizeBytes));
    const sparseParsed = await parseSparse(bytesSource(sparseBytes));
    expect(sparseParsed.header.totalBlocks).toBe(Math.ceil(bytes.length / 4096));
    expect(await sha256Hex(await unpackSparse(bytesSource(sparseBytes), sparseParsed))).toBe(await sha256Hex(bytes));

    await session.closeSource(source.id);
  });

  it("reads a boot animation, replaces a frame and keeps the rest", async () => {
    const session = new PatchWorkerSession();
    const frameA = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 1, 1, 1]);
    const frameB = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 2, 2, 2, 2]);
    const desc = "8 4 24\np 1 0 part0\n";
    const zip = await packAnimation([
      { name: "desc.txt", data: new TextEncoder().encode(desc) },
      { name: "part0/", data: new Uint8Array(0) },
      { name: "part0/a.png", data: frameA },
      { name: "part0/b.png", data: frameB },
    ]);
    const source = await session.openSource(toArrayBuffer(zip), "bootanimation.zip");

    const summary = await session.inspectAnimation(source.id);
    expect(summary.dialect).toBe("standard");
    expect([summary.width, summary.height, summary.fps]).toEqual([8, 4, 24]);
    expect(summary.parts.map((part) => [part.path, part.frames.length])).toEqual([["part0", 2]]);
    expect(summary.otherEntries).toEqual(["part0/"]);

    const bytes = new Uint8Array(await session.readAnimationFrame(source.id, undefined, "part0/a.png"));
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(frameA));

    // replace the second frame and change the frame rate, then check what the packer claims
    const replacement = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);
    const artifact = await session.packAnimationArchive(source.id, undefined, {
      desc: "8 4 30\np 1 0 part0\n",
      replacements: [{ name: "part0/b.png", data: toArrayBuffer(replacement) }],
    });
    expect(artifact.name).toBe("bootanimation.zip");
    expect(artifact.params?.verified).toBe("entries-intact");
    expect(artifact.params?.replaced).toBe("1");
    expect(artifact.params?.descRewritten).toBe("true");

    // the artifact is read back through the same reader the tool uses
    const packedBytes = new Uint8Array(await session.readArtifact(artifact.id, 0, artifact.sizeBytes));
    const again = await readAnimationZip(bytesSource(packedBytes));
    expect(again.animation.fps).toBe(30);
    const frameOf = (name: string): Uint8Array =>
      again.entries.find((entry) => entry.name === name)?.data as Uint8Array;
    expect(await sha256Hex(frameOf("part0/a.png"))).toBe(await sha256Hex(frameA));
    expect(await sha256Hex(frameOf("part0/b.png"))).toBe(await sha256Hex(replacement));

    await session.closeSource(source.id);
  });

  it("refuses to extract something the package does not have", async () => {
    const session = new PatchWorkerSession();
    const source = await session.openSource(
      toArrayBuffer(await buildZip([{ name: "boot.img", data: new Uint8Array(16) }])),
      "vendor.zip",
    );

    await expect(session.extractPackageEntry(source.id, "system.img")).rejects.toThrowError(WorkerError);
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
