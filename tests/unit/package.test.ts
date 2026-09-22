import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractPackageEntry,
  extractPayloadPartition,
  listZip,
  openPackage,
  packageKindOf,
  parsePayload,
  readZipEntry,
} from "@/core";
import { PackageError } from "@/core/errors";
import { sha256Hex } from "@/core/hash";
import { detectArtifact } from "@/core/workspace";
import { buildZip } from "../fixtures/zip";
import { buildPayload } from "../fixtures/payload";
import { repoPath } from "../fixtures/artifacts";
import { buildBootImage } from "../fixtures/bootimg";

const encoder = new TextEncoder();

/** The zip a vendor ships, and the extraction the official tooling did from it. */
const GKI_ZIP = repoPath(".research", "images", "gki-a13-5.10.zip");
const GKI_IMAGE = repoPath(".research", "images", "gki-a13-5.10", "boot-5.10.img");
const hasGkiZip = existsSync(GKI_ZIP) && existsSync(GKI_IMAGE);

/** A real OTA payload, when one is around: partition streams and manifest are the real thing. */
const OTA_PAYLOAD = process.env.IMAGEFORGE_OTA_PAYLOAD ?? "";
const hasOtaPayload = OTA_PAYLOAD !== "" && existsSync(OTA_PAYLOAD);

describe("zip archives", () => {
  it("lists entries and reads stored and deflated ones", async () => {
    const stored = encoder.encode("stored payload");
    const deflated = encoder.encode("deflated payload ".repeat(40));
    const zip = await buildZip([
      { name: "boot.img", data: stored },
      { name: "sub/init_boot.img", data: deflated, deflate: true },
    ]);

    const entries = listZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["boot.img", "sub/init_boot.img"]);
    expect(entries[1].method).toBe(8);

    expect(await readZipEntry(zip, entries[0])).toEqual(stored);
    expect(await readZipEntry(zip, entries[1])).toEqual(deflated);
  });

  it("refuses an entry whose CRC32 does not match", async () => {
    const zip = await buildZip([{ name: "boot.img", data: encoder.encode("payload") }]);
    const entries = listZip(zip);
    // the data starts after the local header and the name it repeats
    zip[entries[0].localHeaderOffset + 30 + entries[0].name.length] ^= 0xff;

    await expect(readZipEntry(zip, entries[0])).rejects.toThrowError(/CRC32/);
  });

  it("names a file that is not a zip at all", () => {
    expect(() => listZip(new Uint8Array(64).fill(0x11))).toThrowError(PackageError);
  });
});

const payloadFixture = async (compress: "none" | "xz") =>
  buildPayload([{ name: "init_boot", data: await buildBootImage({ kernel: null }), compress }]);

describe("OTA payloads", () => {
  it("reads the header and the manifest", async () => {
    const payload = await payloadFixture("none");
    const parsed = parsePayload(payload);

    expect(parsed.version).toBe(2);
    expect(parsed.minorVersion).toBe(0);
    expect(parsed.blockSize).toBe(4096);
    expect(parsed.partitions.map((partition) => partition.name)).toEqual(["init_boot"]);
    expect(parsed.partitions[0].operations[0].typeName).toBe("REPLACE");
    expect(parsed.dataOffset).toBeGreaterThan(24);
  });

  it("rebuilds a partition that was stored raw", async () => {
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([{ name: "init_boot", data: image }]);

    const extracted = await extractPayloadPartition(payload, parsePayload(payload), "init_boot");

    expect(await sha256Hex(extracted)).toBe(await sha256Hex(image));
    expect(detectArtifact(extracted).content).toBe("init_boot");
  });

  it("rebuilds a partition whose blob is an xz stream, which is how real payloads store them", async () => {
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([{ name: "init_boot", data: image, compress: "xz" }]);

    const extracted = await extractPackageEntry(payload, "init_boot");

    expect(await sha256Hex(extracted)).toBe(await sha256Hex(image));
  });

  it("reads a payload that declares a minor version, because vendor full packages do", async () => {
    // A CPH2723 full OTA declares minor_version = 9 while every operation still carries its data,
    // so the decision has to be made per operation rather than from this field.
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([{ name: "init_boot", data: image }], { minorVersion: 9 });
    const parsed = parsePayload(payload);

    expect(parsed.minorVersion).toBe(9);
    expect(parsed.partitions[0].requiresSource).toBe(false);
    expect(await sha256Hex(await extractPayloadPartition(payload, parsed, "init_boot"))).toBe(
      await sha256Hex(image),
    );
  });

  it("marks a partition whose operations read the source image, and refuses to guess it", async () => {
    // SOURCE_COPY (4) copies from the partition being replaced, so the payload alone is not enough
    const payload = await buildPayload([{ name: "system", data: new Uint8Array(8192) }], { operationType: 4 });
    const opened = openPackage(payload);

    expect(opened.entries[0].requiresSource).toBe(true);
    await expect(extractPackageEntry(payload, "system")).rejects.toThrowError(/needs the image/);
  });

  it("refuses an operation it has no decoder for, and names it", async () => {
    // REPLACE_BZ (1) needs a bzip2 decoder this build does not have
    const payload = await buildPayload([{ name: "boot", data: new Uint8Array(4096) }], { operationType: 1 });
    const parsed = parsePayload(payload);
    expect(parsed.partitions[0].operations[0].typeName).toBe("REPLACE_BZ");

    await expect(extractPayloadPartition(payload, parsed, "boot")).rejects.toThrowError(/cannot read yet/);
  });

  it("checks every blob against the digest the manifest declares", async () => {
    const payload = await buildPayload([{ name: "boot", data: await buildBootImage({}) }]);
    const tampered = new Uint8Array(payload);
    tampered[tampered.length - 1] ^= 0xff;

    await expect(extractPayloadPartition(tampered, parsePayload(tampered), "boot")).rejects.toThrowError(
      /digest/,
    );
  });

  it("refuses a file whose magic is not CrAU", async () => {
    const payload = await payloadFixture("none");
    payload.set(encoder.encode("XXXX"), 0);

    expect(() => parsePayload(payload)).toThrowError(/not an Android OTA payload/);
  });
});

describe("opening a package", () => {
  it("tells a zip from a payload", async () => {
    const zip = await buildZip([{ name: "boot.img", data: new Uint8Array(16) }]);
    const payload = await payloadFixture("none");

    expect(packageKindOf(zip)).toBe("zip");
    expect(packageKindOf(payload)).toBe("ota-payload");
    expect(packageKindOf(await buildBootImage({}))).toBeNull();
  });

  it("lists what a package holds", async () => {
    const zip = await buildZip([{ name: "boot.img", data: new Uint8Array(4096) }]);
    const zipped = openPackage(zip);
    expect(zipped.kind).toBe("zip");
    expect(zipped.entries.map((entry) => entry.id)).toEqual(["boot.img"]);

    const payload = await buildPayload([{ name: "init_boot", data: new Uint8Array(4096) }]);
    const fromPayload = openPackage(payload);
    expect(fromPayload.kind).toBe("ota-payload");
    expect(fromPayload.entries[0]).toMatchObject({
      id: "init_boot",
      name: "init_boot.img",
      sizeBytes: 4096,
      suggestedKind: "boot-container",
    });
  });

  it("refuses a file that is not a package", async () => {
    const image = await buildBootImage({});

    expect(() => openPackage(image)).toThrowError(/not a package/);
  });
});

describe.skipIf(!hasGkiZip)("a real vendor archive", () => {
  it("extracts the image the official tooling extracted, byte for byte", async () => {
    const zip = new Uint8Array(readFileSync(GKI_ZIP));
    const expected = new Uint8Array(readFileSync(GKI_IMAGE));
    const opened = openPackage(zip);

    expect(opened.entries.map((entry) => entry.name)).toEqual(["boot-5.10.img"]);
    const extracted = await extractPackageEntry(zip, "boot-5.10.img");

    expect(extracted.length).toBe(expected.length);
    expect(await sha256Hex(extracted)).toBe(await sha256Hex(expected));
    expect(detectArtifact(extracted).kind).toBe("boot-container");
  }, 300000);

  it("agrees with unzip about the entry data", async () => {
    const zip = new Uint8Array(readFileSync(GKI_ZIP));
    const entry = openPackage(zip).entries[0];
    const ours = await extractPackageEntry(zip, entry.id);
    const reference = new Uint8Array(
      execFileSync("unzip", ["-p", GKI_ZIP, entry.id], { maxBuffer: 128 * 1024 * 1024 }),
    );

    expect(ours.length).toBe(reference.length);
    expect(await sha256Hex(ours)).toBe(await sha256Hex(reference));
  }, 300000);
});

describe.skipIf(!hasOtaPayload)("a real OTA payload", () => {
  it("lists partitions and rebuilds a boot image from it", async () => {
    const payload = new Uint8Array(readFileSync(OTA_PAYLOAD));
    const opened = openPackage(payload);
    const names = opened.entries.map((entry) => entry.id);

    expect(names.length).toBeGreaterThan(0);
    const bootName = names.find((name) => name === "init_boot") ?? names.find((name) => name === "boot");
    expect(bootName).toBeDefined();
    const extracted = await extractPackageEntry(payload, bootName as string);

    expect(detectArtifact(extracted).kind).toBe("boot-container");
  }, 600000);
});
