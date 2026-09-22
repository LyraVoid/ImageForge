import { describe, expect, it } from "vitest";
import {
  addArtifact,
  addSource,
  artifactById,
  childrenOf,
  derivedArtifactId,
  detectArtifact,
  emptyWorkspace,
  lineageOf,
  matchTools,
  removeSource,
  sourceById,
} from "@/core";
import type { ToolCapability } from "@/core";
import { buildBootImage, buildVendorBootImage, gzipBytes } from "../fixtures/bootimg";

function withMagic(size: number, magic: number[], offset = 0): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(magic, offset);
  return bytes;
}

const TOOLS: ToolCapability[] = [
  { id: "patch", accepts: ["boot-container"], produces: ["boot-container"], status: "available" },
  { id: "extract", accepts: ["package"], produces: ["partition-image"], status: "planned" },
  { id: "inspect", accepts: ["boot-container", "package"], produces: ["report"], status: "planned" },
];

describe("artifact detection", () => {
  it("classifies the boot image family with the parser's own rules", async () => {
    const boot = detectArtifact(await buildBootImage({}));
    expect(boot).toMatchObject({ container: "raw", content: "boot", kind: "boot-container", packed: false });
    expect(boot.headerVersion).toBe(4);

    // a v4 image without a kernel is what Android 13+ ships as init_boot
    const initBoot = detectArtifact(await buildBootImage({ kernel: null }));
    expect(initBoot.content).toBe("init_boot");

    const vendor = detectArtifact(await buildVendorBootImage({}));
    expect(vendor).toMatchObject({ container: "raw", content: "vendor_boot", kind: "boot-container" });
  });

  it("recognises the containers Android packages images in", () => {
    expect(detectArtifact(withMagic(64, [0x50, 0x4b, 0x03, 0x04]))).toMatchObject({ container: "zip", kind: "package" });
    expect(detectArtifact(withMagic(64, [0x43, 0x72, 0x41, 0x55]))).toMatchObject({
      container: "ota-payload",
      kind: "package",
    });
    expect(detectArtifact(withMagic(64, [0x3a, 0xff, 0x26, 0xed]))).toMatchObject({
      container: "sparse",
      kind: "partition-image",
      packed: true,
    });
  });

  it("recognises the filesystems a partition usually holds", () => {
    expect(detectArtifact(withMagic(4096, [0x53, 0xef], 0x438)).content).toBe("ext4");
    expect(detectArtifact(withMagic(4096, [0xe2, 0xe1, 0xf5, 0xe0], 1024)).content).toBe("erofs");
    expect(detectArtifact(withMagic(4096, [0x10, 0x20, 0xf5, 0xf2], 1024)).content).toBe("f2fs");
    // anything else stays a blob instead of being mistaken for a partition we could open
    expect(detectArtifact(withMagic(4096, [], 0)).kind).toBe("blob");
  });

  it("reports a compressed stream as a packed blob", async () => {
    const gzipped = detectArtifact(await gzipBytes(new Uint8Array(1024)));
    expect(gzipped).toMatchObject({ container: "gzip", kind: "blob", packed: true });
  });

  it("names what it cannot classify instead of guessing", () => {
    const unknown = detectArtifact(new Uint8Array(64).fill(0x11));
    expect(unknown).toMatchObject({ container: "raw", content: "unknown", kind: "blob" });
    // vendor boot logo containers are not in the table on purpose: their magics are not verified here
    expect(detectArtifact(withMagic(64, [0x4c, 0x4f, 0x47, 0x4f])).kind).toBe("blob");
  });
});

describe("the artifact graph", () => {
  const source = {
    id: "s1",
    name: "payload.bin",
    sizeBytes: 4_000_000,
    kind: "package" as const,
    detected: detectArtifact(withMagic(64, [0x43, 0x72, 0x41, 0x55])),
  };
  const artifact = {
    id: derivedArtifactId(source.id, "extract", "init_boot.img"),
    sourceId: source.id,
    parentId: source.id,
    tool: "extract",
    params: { partition: "init_boot" },
    name: "init_boot.img",
    sizeBytes: 8 * 1024 * 1024,
    kind: "boot-container" as const,
    detected: detectArtifact(new Uint8Array(64)),
  };

  it("keeps sources, artifacts and their lineage", () => {
    const workspace = addArtifact(addSource(emptyWorkspace(), source), artifact);

    expect(sourceById(workspace, "s1")).toEqual(source);
    expect(artifactById(workspace, artifact.id)).toEqual(artifact);
    expect(lineageOf(workspace, artifact.id)?.name).toBe("payload.bin");
    expect(childrenOf(workspace, "s1")).toHaveLength(1);
  });

  it("drops the whole lineage with its source", () => {
    const workspace = removeSource(addArtifact(addSource(emptyWorkspace(), source), artifact), "s1");

    expect(workspace.sources).toHaveLength(0);
    expect(workspace.artifacts).toHaveLength(0);
  });

  it("names a derived artifact after what it is, so the same work lands on the same id", () => {
    expect(derivedArtifactId("s1", "extract", "init_boot.img")).toBe("s1:extract:init_boot.img");
  });
});

describe("tool matching", () => {
  it("offers the tools that accept what the user is holding", () => {
    const matches = matchTools("boot-container", TOOLS);
    const patch = matches.find((match) => match.tool.id === "patch");
    const extract = matches.find((match) => match.tool.id === "extract");

    expect(patch).toMatchObject({ compatible: true, implemented: true });
    expect(patch?.reasons).toEqual([]);
    expect(extract?.compatible).toBe(false);
    expect(extract?.reasons.map((reason) => reason.code)).toContain("wrong-kind");
    // a planned tool says so even when it would accept the artifact
    const inspect = matches.find((match) => match.tool.id === "inspect");
    expect(inspect?.compatible).toBe(true);
    expect(inspect?.reasons.map((reason) => reason.code)).toEqual(["planned"]);
  });

  it("lists every tool, with what it accepts, before anything is loaded", () => {
    const matches = matchTools(null, TOOLS);

    expect(matches).toHaveLength(TOOLS.length);
    expect(matches.every((match) => match.compatible)).toBe(true);
    expect(matches.find((match) => match.tool.id === "patch")?.reasons).toEqual([]);
  });

  it("names the kinds a mismatched tool would take", () => {
    const extract = matchTools("ramdisk", TOOLS).find((match) => match.tool.id === "extract");

    expect(extract?.reasons[0]).toEqual({ code: "wrong-kind", params: { accepts: "Package" } });
  });
});
