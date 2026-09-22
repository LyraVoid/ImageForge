import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blobSource,
  bytesSource,
  extractPackageEntry,
  extractPayloadPartition,
  listZip,
  openPackage,
  packageKindOf,
  parsePayload,
  readZipEntry,
  subSource,
} from "@/core";
import { PackageError } from "@/core/errors";
import { sha256Hex } from "@/core/hash";
import { detectArtifact } from "@/core/workspace";
import { buildZip } from "../fixtures/zip";
import { buildPayload } from "../fixtures/payload";
import { repoPath } from "../fixtures/artifacts";
import { buildBootImage } from "../fixtures/bootimg";
import { fileSource } from "../fixtures/file-source";

const encoder = new TextEncoder();

/** The zip a vendor ships, and the extraction the official tooling did from it. */
const GKI_ZIP = repoPath(".research", "images", "gki-a13-5.10.zip");
const GKI_IMAGE = repoPath(".research", "images", "gki-a13-5.10", "boot-5.10.img");
const hasGkiZip = existsSync(GKI_ZIP) && existsSync(GKI_IMAGE);

/** A real OTA package (an 8 GiB zip64 file, read in place). Set IMAGEFORGE_OTA_PACKAGE to use it. */
const OTA_PACKAGE = process.env.IMAGEFORGE_OTA_PACKAGE ?? "";
const hasOtaPackage = OTA_PACKAGE !== "" && existsSync(OTA_PACKAGE);
const OTA_INIT_BOOT_SHA256 = process.env.IMAGEFORGE_OTA_INIT_BOOT_SHA256 ?? "";

describe("zip archives", () => {
  it("lists entries and reads stored and deflated ones", async () => {
    const stored = encoder.encode("stored payload");
    const deflated = encoder.encode("deflated payload ".repeat(40));
    const zip = await buildZip([
      { name: "boot.img", data: stored },
      { name: "sub/init_boot.img", data: deflated, deflate: true },
    ]);
    const source = bytesSource(zip);

    const entries = await listZip(source);
    expect(entries.map((entry) => entry.name)).toEqual(["boot.img", "sub/init_boot.img"]);
    expect(entries[1].method).toBe(8);
    expect(entries[0].dataOffset).toBeGreaterThan(entries[0].name.length);

    expect(await readZipEntry(source, entries[0])).toEqual(stored);
    expect(await readZipEntry(source, entries[1])).toEqual(deflated);
  });

  it("refuses an entry whose CRC32 does not match", async () => {
    const zip = await buildZip([{ name: "boot.img", data: encoder.encode("payload") }]);
    const source = bytesSource(zip);
    const entries = await listZip(source);
    // the data starts after the local header and the name it repeats
    zip[entries[0].dataOffset] ^= 0xff;

    await expect(readZipEntry(source, entries[0])).rejects.toThrowError(/CRC32/);
  });

  it("names a file that is not a zip at all", async () => {
    await expect(listZip(bytesSource(new Uint8Array(64).fill(0x11)))).rejects.toThrowError(PackageError);
  });

  it("refuses an entry too large to read into memory, and says why", async () => {
    const zip = await buildZip([{ name: "payload.bin", data: new Uint8Array(64) }]);
    const source = bytesSource(zip);
    const entries = await listZip(source);

    await expect(readZipEntry(source, entries[0], 16)).rejects.toThrowError(/too large|limit/);
  });
});

const payloadFixture = async (compress: "none" | "xz") =>
  buildPayload([{ name: "init_boot", data: await buildBootImage({ kernel: null }), compress }]);

describe("OTA payloads", () => {
  it("reads the header and the manifest", async () => {
    const payload = await payloadFixture("none");
    const parsed = await parsePayload(bytesSource(payload));

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
    const source = bytesSource(payload);

    const extracted = await extractPayloadPartition(source, await parsePayload(source), "init_boot");

    expect(await sha256Hex(extracted)).toBe(await sha256Hex(image));
    expect(detectArtifact(extracted).content).toBe("init_boot");
  });

  it("rebuilds a partition whose blob is an xz stream, which is how real payloads store them", async () => {
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([{ name: "init_boot", data: image, compress: "xz" }]);

    const extracted = await extractPackageEntry(bytesSource(payload), "init_boot");

    expect(await sha256Hex(extracted)).toBe(await sha256Hex(image));
  });

  it("reads a payload that declares a minor version, because vendor full packages do", async () => {
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([{ name: "init_boot", data: image }], { minorVersion: 9 });
    const source = bytesSource(payload);
    const parsed = await parsePayload(source);

    expect(parsed.minorVersion).toBe(9);
    expect(parsed.partitions[0].requiresSource).toBe(false);
    expect(await sha256Hex(await extractPayloadPartition(source, parsed, "init_boot"))).toBe(
      await sha256Hex(image),
    );
  });

  it("marks a partition whose operations read the source image, and refuses to guess it", async () => {
    // SOURCE_COPY (4) copies from the partition being replaced, so the payload alone is not enough
    const payload = await buildPayload([{ name: "system", data: new Uint8Array(8192) }], { operationType: 4 });
    const opened = await openPackage(bytesSource(payload));

    expect(opened.entries[0].requiresSource).toBe(true);
    await expect(extractPackageEntry(bytesSource(payload), "system")).rejects.toThrowError(/needs the image/);
  });

  it("names an operation it has no decoder for", async () => {
    // REPLACE_BZ (1) needs a bzip2 decoder this build does not have yet
    const payload = await buildPayload([{ name: "boot", data: new Uint8Array(4096) }], { operationType: 1 });
    const source = bytesSource(payload);

    await expect(
      extractPayloadPartition(source, await parsePayload(source), "boot"),
    ).rejects.toThrowError(/cannot read yet/);
  });

  it("checks every blob against the digest the manifest declares", async () => {
    const payload = await buildPayload([{ name: "boot", data: await buildBootImage({}) }]);
    const tampered = new Uint8Array(payload);
    tampered[tampered.length - 1] ^= 0xff;
    const source = bytesSource(tampered);

    await expect(extractPayloadPartition(source, await parsePayload(source), "boot")).rejects.toThrowError(
      /digest/,
    );
  });

  it("refuses a file whose magic is not CrAU", async () => {
    const payload = await payloadFixture("none");
    payload.set(encoder.encode("XXXX"), 0);

    await expect(parsePayload(bytesSource(payload))).rejects.toThrowError(/not an Android OTA payload/);
  });
});

describe("opening a package", () => {
  it("tells a zip from a payload", async () => {
    const zip = await buildZip([{ name: "boot.img", data: new Uint8Array(16) }]);
    const payload = await payloadFixture("none");

    expect(await packageKindOf(bytesSource(zip))).toBe("zip");
    expect(await packageKindOf(bytesSource(payload))).toBe("ota-payload");
    expect(await packageKindOf(bytesSource(await buildBootImage({})))).toBeNull();
  });

  it("lists what a package holds", async () => {
    const zip = await buildZip([{ name: "images/boot.img", data: new Uint8Array(4096) }]);
    const zipped = await openPackage(bytesSource(zip));
    expect(zipped.kind).toBe("zip");
    expect(zipped.entries[0]).toMatchObject({ id: "images/boot.img", name: "boot.img", container: null });

    const payload = await buildPayload([{ name: "init_boot", data: new Uint8Array(4096) }]);
    const fromPayload = await openPackage(bytesSource(payload));
    expect(fromPayload.kind).toBe("ota-payload");
    expect(fromPayload.entries[0]).toMatchObject({
      id: "init_boot",
      name: "init_boot.img",
      sizeBytes: 4096,
      suggestedKind: "boot-container",
    });
  });

  it("descends into a payload that sits inside an OTA zip instead of handing out 8 GiB", async () => {
    const image = await buildBootImage({ kernel: null });
    const payload = await buildPayload([{ name: "init_boot", data: image }]);
    const zip = await buildZip([
      { name: "META-INF/com/android/metadata", data: encoder.encode("ota-type=AB") },
      { name: "payload.bin", data: payload },
    ]);
    const source = bytesSource(zip);

    const opened = await openPackage(source);
    const ids = opened.entries.map((entry) => entry.id);
    expect(ids).toContain("META-INF/com/android/metadata");
    expect(ids).not.toContain("payload.bin");
    expect(opened.entries.find((entry) => entry.id.endsWith("::init_boot"))).toMatchObject({
      id: "payload.bin::init_boot",
      name: "init_boot.img",
      container: "payload.bin",
      requiresSource: false,
    });

    // and the nested entry is what extraction takes
    const extracted = await extractPackageEntry(source, "payload.bin::init_boot");
    expect(await sha256Hex(extracted)).toBe(await sha256Hex(image));
  });

  it("refuses a file that is not a package", async () => {
    const image = await buildBootImage({});

    await expect(openPackage(bytesSource(image))).rejects.toThrowError(/not a package/);
  });
});

describe("reading in ranges", () => {
  it("reads a Blob through slices, which is how a browser File is opened", async () => {
    const zip = await buildZip([{ name: "boot.img", data: await buildBootImage({}) }]);
    const source = blobSource(new Blob([zip as BlobPart]));

    const opened = await openPackage(source);
    expect(opened.entries.map((entry) => entry.name)).toEqual(["boot.img"]);
    expect((await extractPackageEntry(source, "boot.img")).length).toBe(opened.entries[0].sizeBytes);
  });

  it("reads a window of another source, which is how a payload inside a zip is reached", async () => {
    const bytes = new Uint8Array(64);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
    const source = bytesSource(bytes);
    const window = subSource(source, 16, 8);

    expect(window.size).toBe(8);
    expect([...(await window.read(0, 4))]).toEqual([16, 17, 18, 19]);
    // a read past the window's end stops there instead of running into the parent
    expect([...(await window.read(4, 100))]).toEqual([20, 21, 22, 23]);
  });
});

describe.skipIf(!hasGkiZip)("a real vendor archive", () => {
  it("extracts the image the official tooling extracted, byte for byte", async () => {
    const zip = new Uint8Array(readFileSync(GKI_ZIP));
    const expected = new Uint8Array(readFileSync(GKI_IMAGE));
    const source = bytesSource(zip);
    const opened = await openPackage(source);

    expect(opened.entries.map((entry) => entry.name)).toEqual(["boot-5.10.img"]);
    const extracted = await extractPackageEntry(source, "boot-5.10.img");

    expect(extracted.length).toBe(expected.length);
    expect(await sha256Hex(extracted)).toBe(await sha256Hex(expected));
    expect(detectArtifact(extracted).kind).toBe("boot-container");
  }, 300000);

  it("agrees with unzip about the entry data", async () => {
    const source = bytesSource(new Uint8Array(readFileSync(GKI_ZIP)));
    const entry = (await openPackage(source)).entries[0];
    const ours = await extractPackageEntry(source, entry.id);
    const reference = new Uint8Array(
      execFileSync("unzip", ["-p", GKI_ZIP, entry.id], { maxBuffer: 128 * 1024 * 1024 }),
    );

    expect(ours.length).toBe(reference.length);
    expect(await sha256Hex(ours)).toBe(await sha256Hex(reference));
  }, 300000);
});

describe.skipIf(!hasOtaPackage)("a real OTA package", () => {
  it("lists a zip64 package's partitions without reading the whole file", async () => {
    // Read in ranges from disk: this package is 8.2 GiB, far past what a buffer could hold.
    const source = fileSource(OTA_PACKAGE);
    const opened = await openPackage(source);

    expect(opened.kind).toBe("zip");
    const nested = opened.entries.filter((entry) => entry.container === "payload.bin");
    expect(nested.length).toBeGreaterThan(40);
    const initBoot = nested.find((entry) => entry.id.endsWith("::init_boot"));
    expect(initBoot).toBeDefined();
    expect(initBoot?.sizeBytes).toBe(8388608);
    expect(initBoot?.suggestedKind).toBe("boot-container");

    if (OTA_INIT_BOOT_SHA256 !== "") {
      const extracted = await extractPackageEntry(source, initBoot?.id as string);
      expect(await sha256Hex(extracted)).toBe(OTA_INIT_BOOT_SHA256);
    }
  }, 600000);
});
