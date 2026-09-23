import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bytesSource } from "@/core/package";
import { animationFrames, packAnimation, parseAnimationDesc, readAnimationZip, serializeAnimationDesc, setAnimationGlobal, setAnimationPart } from "@/core/animation";
import { sha256Hex } from "@/core/hash";
import { fileSource } from "../fixtures/file-source";

const SAMPLE = process.env.IMAGEFORGE_BOOTANIMATION ?? ".research/bootanimation/bootanimation.zip";
const hasSample = existsSync(SAMPLE);

describe("the desc.txt parser", () => {
  it("reads the documented grammar and gives it back unchanged", () => {
    const text = [
      "1080 2400 60 1",
      "",
      "# a comment",
      "p 1 0 part0",
      "c 0 20 part1",
      "f 2 0 part2 8 #102030 c -24",
    ].join("\n");
    const animation = parseAnimationDesc(text);

    expect(animation.width).toBe(1080);
    expect(animation.height).toBe(2400);
    expect(animation.fps).toBe(60);
    expect(animation.parts.map((part) => [part.type, part.count, part.pause, part.path])).toEqual([
      ["p", 1, 0, "part0"],
      ["c", 0, 20, "part1"],
      ["f", 2, 0, "part2"],
    ]);
    expect(animation.parts[2].tail).toBe(" 8 #102030 c -24");

    // nothing edited: character for character the input, including the comment and the blank line
    expect(serializeAnimationDesc(animation)).toBe(text);
  });

  it("understands the vendor g line a real device ships, and keeps that dialect when edited", () => {
    const text = "# global width height offsetx offsety fps\n#\ng 1216 465 0 664 60 \n\np 1 0 part0\np 0 0 part1\n    \n    ";
    const animation = parseAnimationDesc(text);

    expect([animation.width, animation.height, animation.fps]).toEqual([1216, 465, 60]);
    expect(animation.parts.map((part) => part.path)).toEqual(["part0", "part1"]);
    expect(serializeAnimationDesc(animation)).toBe(text);

    // changing the frame rate rewrites that one line, in the same dialect, line ending and all
    setAnimationGlobal(animation, { fps: 30 });
    expect(serializeAnimationDesc(animation)).toBe(text.replace("60 ", "30 "));
    expect(animation.fps).toBe(30);

    setAnimationPart(animation, "part0", { pause: 5 });
    expect(serializeAnimationDesc(animation)).toContain("p 1 5 part0");
  });

  it("refuses a file that does not describe an animation", () => {
    expect(() => parseAnimationDesc("hello\nthere\n")).toThrowError(/does not describe an animation/);
  });
});

describe("an animation archive", () => {
  it("packs desc.txt first and reads itself back", async () => {
    const desc = "4 2 30\np 0 0 part0\n";
    const frame = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const archive = await packAnimation([
      { name: "desc.txt", data: new TextEncoder().encode(desc) },
      { name: "part0/", data: new Uint8Array(0) },
      { name: "part0/a.png", data: frame },
    ]);

    const read = await readAnimationZip(bytesSource(archive));
    expect(read.desc).toBe(desc);
    expect(read.animation.parts[0].path).toBe("part0");
    expect(animationFrames(read, "part0").map((entry) => entry.name)).toEqual(["part0/a.png"]);
    expect(await sha256Hex(animationFrames(read, "part0")[0].data as Uint8Array)).toBe(await sha256Hex(frame));

    // and the system unzip reads it back too
    const directory = mkdtempSync(join(tmpdir(), "imageforge-anim-"));
    const path = join(directory, "bootanimation.zip");
    writeFileSync(path, archive);
    expect(execFileSync("unzip", ["-t", path], { encoding: "utf8" })).toContain("No errors detected");
    const descOut = execFileSync("unzip", ["-p", path, "desc.txt"], { encoding: "utf8" });
    expect(descOut).toBe(desc);
  });

  it("refuses an archive without a desc.txt", async () => {
    const archive = await packAnimation([{ name: "part0/a.png", data: new Uint8Array(4) }]).catch(() => null);
    expect(archive).toBeNull();
  });
});

describe.skipIf(!hasSample)("the animation a real device ships", () => {
  it("reads it, and editing one frame leaves every other entry exactly as it was", async () => {
    const source = fileSource(SAMPLE);
    const read = await readAnimationZip(source);

    // the vendor file: 1216x465 at 60 fps, a one-shot intro then an endless tail
    expect([read.animation.width, read.animation.height, read.animation.fps]).toEqual([1216, 465, 60]);
    expect(read.animation.parts.map((part) => [part.type, part.count, part.path])).toEqual([
      ["p", 1, "part0"],
      ["p", 0, "part1"],
    ]);
    // 382 frames in the archive altogether, split over the one-shot intro and the looping tail
    expect(animationFrames(read, "part0").length + animationFrames(read, "part1").length).toBe(382);
    expect(animationFrames(read, "part0").length).toBeGreaterThan(100);
    expect(read.desc.startsWith("# global width height offsetx offsety fps")).toBe(true);

    // replace one frame, keep everything else: the same edit the interface does
    const frames = animationFrames(read, "part0");
    const target = frames[0];
    const replacement = new Uint8Array(64).fill(0x5a);
    const repacked = await packAnimation(
      read.entries.map((entry) =>
        entry.name === target.name ? { name: entry.name, data: replacement } : entry,
      ),
    );

    const again = await readAnimationZip(bytesSource(repacked));
    expect(again.desc).toBe(read.desc);
    let kept = 0;
    for (const entry of read.entries) {
      const after = again.entries.find((candidate) => candidate.name === entry.name);
      expect(after, entry.name).toBeDefined();
      if (entry.name === target.name) {
        expect(await sha256Hex((after as { data: Uint8Array }).data)).toBe(await sha256Hex(replacement));
        continue;
      }
      // a directory entry stays a directory; a file keeps its bytes exactly
      if (entry.data === undefined) {
        expect((after as { data?: Uint8Array }).data, entry.name).toBeUndefined();
      } else {
        expect(await sha256Hex((after as { data: Uint8Array }).data), entry.name).toBe(await sha256Hex(entry.data));
      }
      kept += 1;
    }
    expect(kept).toBe(read.entries.length - 1);

    // and AOSP's own convention of a stored archive is what it is: unzip accepts it
    const directory = mkdtempSync(join(tmpdir(), "imageforge-anim-real-"));
    const path = join(directory, "bootanimation.zip");
    writeFileSync(path, repacked);
    const listing = execFileSync("unzip", ["-t", path], { encoding: "utf8" });
    expect(listing).toContain("No errors detected");
    console.log("real animation:", read.entries.length, "entries ->", repacked.length, "bytes after one frame replaced");
  }, 300000);
});
