import { describe, expect, it } from "vitest";
import { packAnimation } from "@/core/animation";
import { sha256Hex } from "@/core/hash";
import { PatchWorkerSession } from "@/workers/session";
import { buildErofsFixture } from "../fixtures/erofs";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("taking a file out of an image", () => {
  it("keeps it as an artifact and opens it as a source of its own", async () => {
    const session = new PatchWorkerSession();
    const fixture = buildErofsFixture();
    const source = await session.openSource(toArrayBuffer(fixture.bytes), "product.img");
    expect(source.detected.content).toBe("erofs");

    const artifact = await session.extractFilesystemFileAs(source.id, fixture.paths.flat);
    expect(artifact.name).toBe(fixture.paths.flat.split("/").pop());
    const kept = new Uint8Array(await session.readArtifact(artifact.id, 0, artifact.sizeBytes));
    expect(await sha256Hex(kept)).toBe(await sha256Hex(fixture.flatFile));

    // the artifact becomes a source without being treated as an image, which is what a zip needs
    const opened = await session.openArtifactSource(artifact.id);
    expect(opened.id).not.toBe(source.id);
    expect(opened.detected.container).toBe("raw");
    expect((await session.workspace()).sources.length).toBe(2);

    await session.closeSource(source.id);
  });

  it("opens an animation that came out of an image as an artifact", async () => {
    const session = new PatchWorkerSession();
    const archive = await packAnimation([
      { name: "desc.txt", data: new TextEncoder().encode("16 8 12\np 0 0 part0\n") },
      { name: "part0/", data: new Uint8Array(0) },
      { name: "part0/a.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7, 7, 7, 7]) },
    ]);
    // the archive is what the browse card extracts out of an image, so it becomes an artifact first
    const fromImage = await session.openSource(toArrayBuffer(archive), "bootanimation.zip");
    const artifact = await session.packAnimationArchive(fromImage.id, undefined, { replacements: [] });

    const opened = await session.openArtifactSource(artifact.id);
    expect(opened.detected.container).toBe("zip");

    const summary = await session.inspectAnimation(opened.id);
    expect([summary.width, summary.height, summary.fps]).toEqual([16, 8, 12]);
    expect(summary.parts.map((part) => part.path)).toEqual(["part0"]);

    // closing a source takes the artifacts derived from it, so this goes last
    await session.closeSource(opened.id);
    await session.closeSource(fromImage.id);
  });
});
