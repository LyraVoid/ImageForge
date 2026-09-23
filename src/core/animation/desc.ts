import { PackageError } from "../errors";

/**
 * The desc.txt of a boot animation, the file the system reads to know how to play one.
 *
 * The grammar is AOSP's own (frameworks/base/cmds/bootanimation/FORMAT.md, kept in
 * .research/upstream/aosp/): a first line of WIDTH HEIGHT FPS [PROGRESS], an optional second line for
 * dynamic colouring, then rows of TYPE COUNT PAUSE PATH [FADE [#RRGGBB [CLOCK1 [CLOCK2]]]], where
 * COUNT is how often to play a part (0 loops until boot finishes) and PAUSE is a number of FRAMES.
 *
 * Two things make this parser more forgiving than the document, because a real file demanded it. The
 * device this project reads ships a vendor line, "g WIDTH HEIGHT OFFSETX OFFSETY FPS", which the
 * document does not describe at all. And a real desc.txt has comments and trailing spaces. So every
 * line is kept exactly as it was read and is only rewritten when one of its fields is actually
 * changed, which makes an untouched animation round-trip byte for byte.
 */
export interface AnimationGlobalLine {
  kind: "global";
  /** "standard" is the documented first line; "vendor-g" is the OFFSETX/OFFSETY form seen in the wild. */
  dialect: "standard" | "vendor-g";
  raw: string;
  dirty: boolean;
  width: number;
  height: number;
  fps: number;
  offsetX: number;
  offsetY: number;
  /** Anything after the numbers, kept verbatim: the optional PROGRESS field, or trailing spaces. */
  tail: string;
}

export interface AnimationPartLine {
  kind: "part";
  raw: string;
  dirty: boolean;
  /** p plays until boot ends, c plays to completion, f is p with a fade out. */
  type: string;
  count: number;
  pause: number;
  path: string;
  /** FADE, #RRGGBB and the clock coordinates, kept verbatim. */
  tail: string;
}

export interface AnimationOtherLine {
  kind: "other";
  raw: string;
}

export type AnimationLine = AnimationGlobalLine | AnimationPartLine | AnimationOtherLine;

export interface BootAnimation {
  lines: AnimationLine[];
  width: number;
  height: number;
  fps: number;
  parts: AnimationPartLine[];
}

export function parseAnimationDesc(text: string): BootAnimation {
  const lines: AnimationLine[] = [];
  let width = 0;
  let height = 0;
  let fps = 0;
  const parts: AnimationPartLine[] = [];

  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      lines.push({ kind: "other", raw });
      continue;
    }

    // The regexes run on the raw line and their last group is the exact remainder of it, so a
    // trailing space or an odd spacing pattern survives a round trip through the parser.
    // the vendor form: g WIDTH HEIGHT OFFSETX OFFSETY FPS [rest]
    const vendorMatch = /^\s*g\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)(.*)$/.exec(raw);
    if (vendorMatch) {
      const line: AnimationGlobalLine = {
        kind: "global",
        dialect: "vendor-g",
        raw,
        dirty: false,
        width: Number(vendorMatch[1]),
        height: Number(vendorMatch[2]),
        offsetX: Number(vendorMatch[3]),
        offsetY: Number(vendorMatch[4]),
        fps: Number(vendorMatch[5]),
        tail: vendorMatch[6],
      };
      lines.push(line);
      width = line.width;
      height = line.height;
      fps = line.fps;
      continue;
    }

    // a part row: TYPE COUNT PAUSE PATH [rest]
    const partMatch = /^\s*([a-zA-Z])\s+(\d+)\s+(\d+)\s+(\S+)(.*)$/.exec(raw);
    if (partMatch && !/^\s*\d/.test(raw)) {
      const line: AnimationPartLine = {
        kind: "part",
        raw,
        dirty: false,
        type: partMatch[1],
        count: Number(partMatch[2]),
        pause: Number(partMatch[3]),
        path: partMatch[4],
        tail: partMatch[5],
      };
      lines.push(line);
      parts.push(line);
      continue;
    }

    // the documented first line: WIDTH HEIGHT FPS [PROGRESS]
    const globalMatch = /^\s*(\d+)\s+(\d+)\s+(\d+)(.*)$/.exec(raw);
    if (globalMatch && width === 0 && height === 0) {
      const line: AnimationGlobalLine = {
        kind: "global",
        dialect: "standard",
        raw,
        dirty: false,
        width: Number(globalMatch[1]),
        height: Number(globalMatch[2]),
        fps: Number(globalMatch[3]),
        offsetX: 0,
        offsetY: 0,
        tail: globalMatch[4],
      };
      lines.push(line);
      width = line.width;
      height = line.height;
      fps = line.fps;
      continue;
    }

    lines.push({ kind: "other", raw });
  }

  if (width === 0 || height === 0 || fps === 0) {
    throw new PackageError(
      "A desc.txt of " + text.length + " characters declares " + width + "x" + height + " at " + fps + " fps.",
      "This desc.txt does not describe an animation.",
    );
  }
  return { lines, width, height, fps, parts };
}

function formatGlobal(line: AnimationGlobalLine): string {
  return line.dialect === "vendor-g"
    ? "g " + line.width + " " + line.height + " " + line.offsetX + " " + line.offsetY + " " + line.fps + line.tail
    : line.width + " " + line.height + " " + line.fps + line.tail;
}

export function serializeAnimationDesc(animation: BootAnimation): string {
  return animation.lines
    .map((line) => {
      if (line.kind === "other" || !line.dirty) return line.raw;
      if (line.kind === "global") return formatGlobal(line);
      return line.type + " " + line.count + " " + line.pause + " " + line.path + line.tail;
    })
    .join("\n");
}

/** Changes a global field and marks that line for rewriting. */
export function setAnimationGlobal(
  animation: BootAnimation,
  fields: Partial<Pick<AnimationGlobalLine, "width" | "height" | "fps" | "offsetX" | "offsetY">>,
): BootAnimation {
  const line = animation.lines.find((candidate): candidate is AnimationGlobalLine => candidate.kind === "global");
  if (!line) {
    throw new PackageError("This desc.txt has no global line.", "This desc.txt does not describe an animation.");
  }
  Object.assign(line, fields);
  line.dirty = true;
  animation.width = line.width;
  animation.height = line.height;
  animation.fps = line.fps;
  return animation;
}

/** Changes a part's play count or pause (both in the units desc.txt uses: plays and frames). */
export function setAnimationPart(
  animation: BootAnimation,
  path: string,
  fields: Partial<Pick<AnimationPartLine, "count" | "pause" | "type">>,
): BootAnimation {
  const line = animation.parts.find((candidate) => candidate.path === path);
  if (!line) {
    throw new PackageError(
      "This desc.txt has no part called " + path + ".",
      "That part is not in this animation.",
    );
  }
  Object.assign(line, fields);
  line.dirty = true;
  return animation;
}
