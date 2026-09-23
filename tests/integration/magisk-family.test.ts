import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CATALOG,
  MAGISK_FLAVORS,
  MAGISK_INIT_ENTRY,
  MAGISK_INIT_LD_ENTRY,
  MAGISK_MAGISK_ENTRY,
  MAGISK_STUB_ENTRY,
  createArtifactRegistry,
  createPatchEngine,
  magiskFlavor,
} from "@/core";
import { sha256Hex } from "@/core/hash";
import { assertBootImage, decodeRamdisk, decodeXz, findEntry, parseImage, sectionOf } from "@/core/image";
import { fsPayloadLoader, hasInitBootImage, readInitBootImage } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;

/**
 * WeaveMask and MagisKube are flavours, not providers: their patchers are Magisk v30.7's, so what has
 * to be checked is that a flavour really drives the run — the payloads written are that manager's, and
 * the app the result needs is its own rather than Magisk's.
 */
describe.skipIf(!hasInitBootImage)("Magisk family flavours", () => {
  for (const id of ["weavemask", "magiskube"]) {
  it("writes " + id + "'s payloads and requires its manager", async () => {
    const source = readInitBootImage();
    const analyzed = await engine.analyze(source);
    const outcome = await engine.run(analyzed.image, analyzed.sha256, "magisk", {
      configuration: { magiskFlavor: id },
    });

    const flavor = magiskFlavor(id);
    expect(outcome.plan.artifact.id).toBe(flavor.artifacts.magiskinit);
    expect(outcome.result.metadata.requiredManager).toBe(flavor.managerPackage);

    // The plan pins exactly the four payloads the run carries.
    expect(outcome.plan.configuration.magiskArtifacts.split(",")).toEqual([
      flavor.artifacts.magiskinit,
      flavor.artifacts.magisk,
      flavor.artifacts.stub,
      flavor.artifacts.initLd,
    ]);

    const patched = assertBootImage(parseImage(outcome.result.bytes));
    const archive = (await decodeRamdisk(sectionOf(patched, "ramdisk")?.data ?? new Uint8Array())).archive;

    // init is WeaveMask's magiskinit, not Magisk's.
    const init = findEntry(archive, MAGISK_INIT_ENTRY);
    expect(init).toBeDefined();
    const magiskinit = await artifacts.loadVerifiedPayload(
      artifacts.resolve({ providerId: "magisk", artifactId: flavor.artifacts.magiskinit }).artifact,
    );
    expect(init?.data.length).toBe(magiskinit.length);
    expect(await sha256Hex(init?.data ?? new Uint8Array())).toBe(await sha256Hex(magiskinit));

    // The three overlay payloads are WeaveMask's files, compressed with the settings Magisk's patcher
    // uses; decoding them has to give the bundled bytes back exactly.
    for (const [entryName, artifactId] of [
      [MAGISK_MAGISK_ENTRY, flavor.artifacts.magisk],
      [MAGISK_STUB_ENTRY, flavor.artifacts.stub],
      [MAGISK_INIT_LD_ENTRY, flavor.artifacts.initLd],
    ] as const) {
      const entry = findEntry(archive, entryName);
      expect(entry, entryName).toBeDefined();
      const raw = await artifacts.loadVerifiedPayload(
        artifacts.resolve({ providerId: "magisk", artifactId }).artifact,
      );
      expect(await sha256Hex(await decodeXz(entry?.data ?? new Uint8Array()))).toBe(await sha256Hex(raw));
    }

    // The configuration names the manager the image needs, like Magisk's own does.
    const config = findEntry(archive, ".backup/.magisk");
    expect(new TextDecoder().decode(config?.data ?? new Uint8Array())).toContain("KEEPVERITY=");
  }, TIMEOUT);
  }

  it("keeps the flavours apart", () => {
    const ids = MAGISK_FLAVORS.map((flavor) => flavor.id);
    expect(ids).toEqual(["magisk", "magiskube", "weavemask"]);

    const payloads = MAGISK_FLAVORS.flatMap((flavor) => Object.values(flavor.artifacts));
    expect(new Set(payloads).size).toBe(payloads.length);

    const managers = MAGISK_FLAVORS.map((flavor) => flavor.managerPackage);
    expect(new Set(managers).size).toBe(managers.length);
    expect(magiskFlavor(undefined).id).toBe("magisk");
    expect(magiskFlavor("nope").id).toBe("magisk");
  });
});
