import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  APATCH_KPIMG_FOLK_ID,
  APATCH_KPIMG_FOLK_SHA256,
  ARTIFACT_CATALOG,
  createArtifactRegistry,
  createPatchEngine,
} from "@/core";
import { assertBootImage, parseImage, sectionOf } from "@/core/image";
import { sha256Hex } from "@/core/hash";
import { buildBootImage } from "../fixtures/bootimg";
import { FOLKPATCH_KPTOOLS_PATH, fsPayloadLoader, hasFolkpatchMaterial, readStockImage } from "../fixtures/artifacts";

const artifacts = createArtifactRegistry(ARTIFACT_CATALOG, fsPayloadLoader);
const engine = createPatchEngine({ artifacts });

const TIMEOUT = 300000;

/**
 * The FolkPatch core image comes from a KernelPatch branch, while the kptools ImageForge runs is
 * built from upstream. That combination is checked rather than assumed: the same stock kernel is
 * patched once by the branch's own native kptools and once by our WebAssembly build, and the two
 * results have to be the same bytes.
 */
describe.skipIf(!hasFolkpatchMaterial)("FolkPatch flavour against the branch's own kptools", () => {
  it("produces the same kernel as the released native tool", async () => {
    const stock = assertBootImage(parseImage(readStockImage()));
    const stockKernel = sectionOf(stock, "kernel")?.data ?? new Uint8Array();
    expect(stockKernel.length).toBeGreaterThan(0);

    // The bundled core image, digest verified, is what the native tool is given as well.
    const kpimg = await artifacts.loadVerifiedPayload(
      artifacts.resolve({ providerId: "apatch", artifactId: APATCH_KPIMG_FOLK_ID }).artifact,
    );
    expect(await sha256Hex(kpimg)).toBe(APATCH_KPIMG_FOLK_SHA256);

    const work = mkdtempSync(join(tmpdir(), "imageforge-folkpatch-"));
    const kernelPath = join(work, "kernel");
    const kpimgPath = join(work, "kpimg");
    const nativePath = join(work, "kernel-native");
    writeFileSync(kernelPath, stockKernel);
    writeFileSync(kpimgPath, kpimg);

    const native = spawnSync(FOLKPATCH_KPTOOLS_PATH, ["-p", "-i", kernelPath, "-k", kpimgPath, "-o", nativePath], {
      encoding: "utf8",
    });
    expect(native.error, String(native.error)).toBeUndefined();
    expect(native.status, native.stdout + native.stderr).toBe(0);
    const nativeKernel = new Uint8Array(readFileSync(nativePath));

    const analyzed = await engine.analyze(await buildBootImage({ kernel: stockKernel }));
    const outcome = await engine.run(analyzed.image, analyzed.sha256, "apatch", {
      configuration: { kernelPatchFlavor: "folkpatch" },
    });

    expect(outcome.plan.artifact.id).toBe(APATCH_KPIMG_FOLK_ID);
    expect(outcome.result.metadata.requiredManager).toBe("me.yuki.folk");

    const patched = assertBootImage(parseImage(outcome.result.bytes));
    const patchedKernel = sectionOf(patched, "kernel")?.data ?? new Uint8Array();

    expect(patchedKernel.length).toBe(nativeKernel.length);
    expect(await sha256Hex(patchedKernel)).toBe(await sha256Hex(nativeKernel));
  }, TIMEOUT);
});
