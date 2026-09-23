import { describe, expect, it } from "vitest";
import { PatchWorkerSession } from "@/workers/session";
import { buildPayload } from "../fixtures/payload";
import { buildBootImage } from "../fixtures/bootimg";
import { buildSplash } from "../fixtures/splash";
import { buildZip } from "../fixtures/zip";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("task progress", () => {
  it("reports how far a long job has got, and finishes at the total", async () => {
    const session = new PatchWorkerSession();
    const boot = await buildBootImage({});
    const payload = await buildPayload([{ name: "init_boot", data: boot, compress: "xz" }]);
    const zip = await buildZip([{ name: "payload.bin", data: payload }]);
    const source = await session.openSource(toArrayBuffer(zip), "ota.zip");

    const seen: Array<{ task: string; done: number; total: number }> = [];
    await session.onTaskProgress((progress) => seen.push({ ...progress }));

    const artifact = await session.extractPackageEntry(source.id, "payload.bin::init_boot", { stream: true });
    expect(artifact.params?.streamed).toBe("true");

    // the stream reports as it goes, never past the total, and ends exactly at it
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((entry) => entry.task === "extract")).toBe(true);
    expect(seen.every((entry) => entry.done <= entry.total)).toBe(true);
    expect(seen.at(-1)?.done).toBe(seen.at(-1)?.total);
    expect(seen.at(-1)?.total).toBe(boot.length);
    const done = seen.map((entry) => entry.done);
    expect([...done].sort((left, right) => left - right)).toEqual(done);

    // and a job that is given no sink runs just the same
    await session.onTaskProgress(undefined);
    await expect(
      session.extractPackageEntry(source.id, "payload.bin::init_boot", { stream: true }),
    ).resolves.toBeDefined();

    await session.closeSource(source.id);
  });

  it("reports every splash frame, including the one that finishes the job", async () => {
    const session = new PatchWorkerSession();
    const splash = await buildSplash(
      Array.from({ length: 20 }, (_, index) => ({
        name: "frame-" + index,
        width: 2,
        height: 2,
        color: [index, 0, 0] as [number, number, number],
      })),
    );
    const source = await session.openSource(toArrayBuffer(splash), "splash.img");

    const seen: Array<{ task: string; done: number; total: number }> = [];
    await session.onTaskProgress((progress) => seen.push({ ...progress }));
    await session.inspectSplash(source.id);

    expect(seen.map((entry) => entry.done)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(seen.every((entry) => entry.task === "logo")).toBe(true);
    expect(seen.every((entry) => entry.total === 20)).toBe(true);
    expect(seen.at(-1)?.done).toBe(seen.at(-1)?.total);

    await session.closeSource(source.id);
  });
});
