import { describe, expect, it } from "vitest";
import { PatchWorkerSession } from "@/workers/session";
import { buildBootImage } from "../fixtures/bootimg";
import { buildZip } from "../fixtures/zip";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("comparing through the session", () => {
  it("sees the same bytes as identical and names the section a change falls in", async () => {
    const session = new PatchWorkerSession();
    const image = await buildBootImage({});
    const zip = await buildZip([{ name: "a.img", data: image }]);
    const source = await session.openSource(toArrayBuffer(zip), "images.zip");

    const same = await session.registerArtifact({
      sourceId: source.id,
      parentId: source.id,
      tool: "unpack",
      name: "a.img",
      params: {},
      bytes: toArrayBuffer(image),
    });
    const identical = await session.compareWithArtifact(source.id, undefined, same.id);
    expect(identical.identical).toBe(false); // a zip against a boot image: different things
    expect(identical.sections).toBeNull();

    // open the extracted boot image as a source of its own, then compare it with a changed copy
    const opened = await session.openArtifactSource(same.id);
    const sections = await session.compareWithArtifact(opened.id, undefined, same.id);
    expect(sections.identical).toBe(true);
    expect(sections.differingBytes).toBe(0);
    expect(sections.sections).not.toBeNull();

    const changed = new Uint8Array(image);
    const ramdisk = (sections.sections ?? []).find((section) => section.name === "ramdisk");
    expect(ramdisk).toBeDefined();
    changed[((ramdisk as { start: number }).start ?? 0) + 8] ^= 0xff;
    const modified = await session.registerArtifact({
      sourceId: source.id,
      parentId: source.id,
      tool: "unpack",
      name: "b.img",
      params: {},
      bytes: toArrayBuffer(changed),
    });

    const diff = await session.compareWithArtifact(opened.id, undefined, modified.id);
    expect(diff.identical).toBe(false);
    expect(diff.differingBytes).toBe(1);
    const byName = new Map((diff.sections ?? []).map((section) => [section.name, section.differingBytes]));
    expect(byName.get("ramdisk")).toBe(1);
    expect(byName.get("header")).toBe(0);
    expect(byName.get("kernel") ?? 0).toBe(0);

    await session.closeSource(opened.id);
    await session.closeSource(source.id);
  });
});
