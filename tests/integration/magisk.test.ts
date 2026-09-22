import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CATALOG,
  MAGISK_BACKUP_INIT_ENTRY,
  MAGISK_BACKUP_RMLIST_ENTRY,
  MAGISK_CONFIG_ENTRY,
  MAGISK_INIT_ENTRY,
  MAGISK_INIT_LD_ENTRY,
  MAGISK_KEEP_FORCE_ENCRYPT_SETTING,
  MAGISK_KEEP_VERITY_SETTING,
  MAGISK_MAGISK_ENTRY,
  MAGISK_OVERLAY_SBIN_DIR,
  MAGISK_REQUIRED_MANAGER,
  MAGISK_STUB_ENTRY,
  createArtifactRegistry,
  createPatchEngine,
} from "@/core";
import { PatchError } from "@/core/errors";
import { sha1Hex, sha256Hex } from "@/core/hash";
import { assertBootImage, decodeRamdisk, decodeXz, findEntry, parseImage, sectionOf } from "@/core/image";
import { buildRamdisk } from "../fixtures/cpio";
import { buildBootImage } from "../fixtures/bootimg";
import {
  fsPayloadLoader,
  hasInitBootImage,
  hasMagiskReference,
  readInitBootImage,
  readMagiskReference,
} from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;
const STOCK_INIT = "stock init payload\n";

const FSTAB_LINE =
  "/dev/block/by-name/userdata /data f2fs rw,discard,forceencrypt=footer,quota,check,avb=vbmeta,verifyatboot,verify\n";

function stockRamdisk(fstab = FSTAB_LINE, extra: Array<{ name: string; data?: string; mode?: number }> = []): Uint8Array {
  return buildRamdisk([
    { name: "init", data: STOCK_INIT, mode: 0o100750 },
    { name: "fstab.qcom", data: fstab },
    { name: "verity_key", data: "a key" },
    ...extra,
  ]);
}

async function ramdiskOf(imageBytes: Uint8Array) {
  const image = assertBootImage(parseImage(imageBytes));
  const section = sectionOf(image, "ramdisk");
  if (!section) throw new Error("the produced image has no ramdisk");
  return (await decodeRamdisk(section.data)).archive;
}

describe.skipIf(!hasMagiskReference || !hasInitBootImage)("Magisk against the official patcher", () => {
  it(
    "agrees with the official patcher on everything that matters for booting (real material)",
    async () => {
      const source = readInitBootImage();
      const reference = readMagiskReference();
      const analyzed = await engine.analyze(source);
      const ours = await engine.run(analyzed.image, analyzed.sha256, "magisk", {
        configuration: { preserveImageSize: "true" },
      });

      const ourArchive = await ramdiskOf(ours.result.bytes);
      const refArchive = await ramdiskOf(reference);

      const ourInit = findEntry(ourArchive, MAGISK_INIT_ENTRY);
      const refInit = findEntry(refArchive, MAGISK_INIT_ENTRY);
      if (!ourInit || !refInit) throw new Error("init is missing in one of the images");
      expect(await sha256Hex(ourInit.data)).toBe(await sha256Hex(refInit.data));

      const decode = (bytes: Uint8Array | undefined): string => new TextDecoder().decode(bytes ?? new Uint8Array());
      const value = (text: string, key: string): string | undefined => new RegExp(key + "=(\\S+)").exec(text)?.[1];
      const ourConfig = decode(findEntry(ourArchive, MAGISK_CONFIG_ENTRY)?.data);
      const refConfig = decode(findEntry(refArchive, MAGISK_CONFIG_ENTRY)?.data);
      for (const key of ["KEEPVERITY", "KEEPFORCEENCRYPT", "RECOVERYMODE", "VENDORBOOT", "SHA1"]) {
        expect(value(ourConfig, key)).toBe(value(refConfig, key));
      }
      expect(ours.result.metadata.fstabPatched).toBe("nothing to patch");

      // the uninstall backup agrees with the official patcher's, entry for entry
      const oursRmlist = findEntry(ourArchive, MAGISK_BACKUP_RMLIST_ENTRY);
      const refRmlist = findEntry(refArchive, MAGISK_BACKUP_RMLIST_ENTRY);
      if (!oursRmlist || !refRmlist) throw new Error("the rmlist is missing in one of the images");
      expect(Array.from(oursRmlist.data)).toEqual(Array.from(refRmlist.data));
      expect(oursRmlist.mode & 0o777).toBe(refRmlist.mode & 0o777);

      const oursBackup = findEntry(ourArchive, MAGISK_BACKUP_INIT_ENTRY);
      const refBackup = findEntry(refArchive, MAGISK_BACKUP_INIT_ENTRY);
      if (!oursBackup || !refBackup) throw new Error("the init backup is missing in one of the images");
      expect(oursBackup.mode & 0o777).toBe(refBackup.mode & 0o777);
      // the streams come from different encoders, so compare what they expand to
      expect(Array.from(await decodeXz(oursBackup.data))).toEqual(Array.from(await decodeXz(refBackup.data)));
    },
    TIMEOUT,
  );
});

describe("Magisk provider", () => {
  it(
    "rewrites the ramdisk exactly as Magisk's own patcher does",
    async () => {
      const image = await buildBootImage({ kernel: null, ramdisk: stockRamdisk() });
      const analyzed = await engine.analyze(image);
      const outcome = await engine.run(
        analyzed.image,
        analyzed.sha256,
        "magisk",
        { configuration: { [MAGISK_KEEP_VERITY_SETTING]: "false", [MAGISK_KEEP_FORCE_ENCRYPT_SETTING]: "false" } },
      );

      expect(outcome.verification.verification.valid).toBe(true);
      expect(outcome.result.metadata.requiredManager).toBe(MAGISK_REQUIRED_MANAGER);

      const archive = await ramdiskOf(outcome.result.bytes);
      const init = findEntry(archive, MAGISK_INIT_ENTRY);
      const overlay = findEntry(archive, "overlay.d");
      const sbin = findEntry(archive, MAGISK_OVERLAY_SBIN_DIR);
      const magiskXz = findEntry(archive, MAGISK_MAGISK_ENTRY);
      const stubXz = findEntry(archive, MAGISK_STUB_ENTRY);
      const initLdXz = findEntry(archive, MAGISK_INIT_LD_ENTRY);
      const config = findEntry(archive, MAGISK_CONFIG_ENTRY);
      if (!init || !overlay || !sbin || !magiskXz || !stubXz || !initLdXz || !config) {
        throw new Error("the produced ramdisk is missing Magisk entries");
      }

      // init is replaced by the bundled magiskinit (0750), not renamed
      expect(init.mode & 0o777).toBe(0o750);
      expect(init.data.length).toBe(199960);
      expect(await sha256Hex(init.data)).toBe("383670a7ba3a6a4b79e5f3467e1da4b66a5df66a9b356ab9f70916854dd6b468");
      expect(findEntry(archive, "init.real")).toBeUndefined();

      expect((overlay.mode & 0o170000) >>> 12).toBe(4);
      expect(overlay.mode & 0o777).toBe(0o750);
      expect(sbin.mode & 0o777).toBe(0o750);

      // the payloads match the bundled artifacts byte for byte
      expect(await sha256Hex(magiskXz.data)).toBe("36603be2f8c505eb9d8f58e464fda66b25b8a7887364ef83e15c877391c38341");
      expect(await sha256Hex(stubXz.data)).toBe("12dcb358399263968c64bc3fce2c6de7b271f48677b1e41002ec43e7994081ba");
      expect(await sha256Hex(initLdXz.data)).toBe("646b99306dd479c2b5e4f123fd962fe49dec4b1d8a368dc3e7210354efdcd10d");
      expect(magiskXz.mode & 0o777).toBe(0o644);

      // the configuration is what Magisk reads at boot, SHA1 being the digest of the source image
      const expectedConfig =
        "KEEPVERITY=false\nKEEPFORCEENCRYPT=false\nRECOVERYMODE=false\nVENDORBOOT=false\nSHA1=" +
        (await sha1Hex(image)) +
        "\n";
      expect(new TextDecoder().decode(config.data)).toBe(expectedConfig);
      expect(config.mode & 0o777).toBe(0);
      expect(outcome.result.metadata.config).toContain("KEEPVERITY=false");

      // the uninstall backup Magisk's patcher keeps inside the ramdisk
      const backupInit = findEntry(archive, MAGISK_BACKUP_INIT_ENTRY);
      const rmlist = findEntry(archive, MAGISK_BACKUP_RMLIST_ENTRY);
      if (!backupInit || !rmlist) throw new Error("the uninstall backup is missing");
      expect(backupInit.mode & 0o777).toBe(0o750);
      expect(new TextDecoder().decode(await decodeXz(backupInit.data))).toBe(STOCK_INIT);
      expect(rmlist.mode & 0o777).toBe(0);
      expect(Array.from(rmlist.data)).toEqual(
        Array.from(
          new TextEncoder().encode(
            ["overlay.d", "overlay.d/sbin", "overlay.d/sbin/init-ld.xz", "overlay.d/sbin/magisk.xz", "overlay.d/sbin/stub.xz"]
              .map((name) => name + "\u0000")
              .join(""),
          ),
        ),
      );
      expect(outcome.result.metadata.stockInitSaved).toBe("yes (.backup/init.xz)");
    },
    TIMEOUT,
  );

  it(
    "removes exactly the fstab flags magiskboot removes",
    async () => {
      const image = await buildBootImage({ kernel: null, ramdisk: stockRamdisk() });
      const analyzed = await engine.analyze(image);
      const outcome = await engine.run(analyzed.image, analyzed.sha256, "magisk", {
        configuration: { [MAGISK_KEEP_VERITY_SETTING]: "false", [MAGISK_KEEP_FORCE_ENCRYPT_SETTING]: "false" },
      });

      const archive = await ramdiskOf(outcome.result.bytes);
      const fstab = findEntry(archive, "fstab.qcom");
      if (!fstab) throw new Error("the fstab entry disappeared");

      // magiskboot removes the flag bytes but leaves the separators, so the leftover commas are
      // exactly what its own patched fstabs look like: forceencrypt=footer -> =footer,
      // avb=vbmeta -> =vbmeta, and verifyatboot plus verify disappear.
      expect(new TextDecoder().decode(fstab.data)).toBe(
        "/dev/block/by-name/userdata /data f2fs rw,discard,=footer,quota,check,=vbmeta,,\n",
      );
      expect(findEntry(archive, "verity_key")).toBeUndefined();
      expect(outcome.result.metadata.fstabPatched).toContain("fstab.qcom");
      expect(outcome.result.metadata.verityKeyRemoved).toBe("yes");
    },
    TIMEOUT,
  );

  it(
    "leaves fstab alone when verity and encryption are kept (the default)",
    async () => {
      const image = await buildBootImage({ kernel: null, ramdisk: stockRamdisk() });
      const analyzed = await engine.analyze(image);
      const outcome = await engine.run(analyzed.image, analyzed.sha256, "magisk", {});

      const archive = await ramdiskOf(outcome.result.bytes);
      expect(new TextDecoder().decode(findEntry(archive, "fstab.qcom")?.data ?? new Uint8Array())).toBe(FSTAB_LINE);
      expect(findEntry(archive, "verity_key")).toBeDefined();
      expect(outcome.result.metadata.fstabPatched).toBe("nothing to patch");
      expect(outcome.result.metadata.keepVerity).toBe("true");
    },
    TIMEOUT,
  );

  it(
    "refuses a ramdisk that Magisk or KernelSU already patched",
    async () => {
      const analyzed = await engine.analyze(
        await buildBootImage({
          kernel: null,
          ramdisk: stockRamdisk(FSTAB_LINE, [{ name: "overlay.d/sbin/magisk.xz", data: "already" }]),
        }),
      );
      await expect(engine.run(analyzed.image, analyzed.sha256, "magisk", {})).rejects.toThrowError(PatchError);

      const withKernelsu = await engine.analyze(
        await buildBootImage({
          kernel: null,
          ramdisk: stockRamdisk(FSTAB_LINE, [{ name: "kernelsu.ko", mode: 0o100755 }]),
        }),
      );
      await expect(engine.run(withKernelsu.image, withKernelsu.sha256, "magisk", {})).rejects.toThrowError(PatchError);
    },
    TIMEOUT,
  );

  it("is offered as a candidate for an image with a ramdisk", async () => {
    const analyzed = await engine.analyze(await buildBootImage({ kernel: null, ramdisk: stockRamdisk() }));
    expect(analyzed.compatibility.candidates.find((entry) => entry.providerId === "magisk")?.compatible).toBe(true);
  });
});
