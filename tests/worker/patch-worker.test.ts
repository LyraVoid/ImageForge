import { describe, expect, it } from "vitest";
import { WorkerError } from "@/core/errors";
import { createPatchWorkerClient } from "@/workers/client";
import { PatchWorkerSession } from "@/workers/session";
import { buildBootImage } from "../fixtures/bootimg";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
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

  it("clears its state on reset", async () => {
    const session = new PatchWorkerSession();
    await session.analyze(toArrayBuffer(await buildBootImage({})), "boot.img");
    await session.reset();
    await expect(session.plan({ providerId: "mock" })).rejects.toThrowError(WorkerError);
  });

  it("cancels a running patch", async () => {
    const session = new PatchWorkerSession();
    await session.analyze(toArrayBuffer(await buildBootImage({})), "boot.img");
    const pending = session.patch({ providerId: "mock" });
    await session.cancel();
    await expect(pending).rejects.toThrowError();
  });
});

describe("createPatchWorkerClient", () => {
  it("falls back to an inline session without a Worker implementation", async () => {
    const client = createPatchWorkerClient();
    expect(client.mode).toBe("inline");
    const response = await client.analyze(toArrayBuffer(await buildBootImage({})), "boot.img");
    expect(response.summary.format).toBe("boot");
    client.terminate();
  });
});
