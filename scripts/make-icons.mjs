#!/usr/bin/env node
/**
 * Draws the app icons and writes them as PNGs.
 *
 * There is no image library here and there should not be one for three squares: the pixels are
 * computed, deflated with zlib and wrapped in PNG chunks directly. That keeps the icons reproducible
 * from the repository instead of being a binary nobody can regenerate.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BACKGROUND = [15, 23, 42, 255];
const EDGE = [51, 65, 85, 255];
const ACCENT = [251, 191, 36, 255];
const CLEAR = [0, 0, 0, 0];

function draw(size) {
  const pixels = new Uint8Array(size * size * 4);
  const radius = Math.round(size * 0.1875);
  const margin = Math.round(size * 0.22);
  const gap = Math.round(size * 0.045);
  const cell = Math.floor((size - margin * 2 - gap * 2) / 3);
  const cellRadius = Math.round(cell * 0.22);

  const put = (x, y, colour) => {
    const at = (y * size + x) * 4;
    pixels[at] = colour[0];
    pixels[at + 1] = colour[1];
    pixels[at + 2] = colour[2];
    pixels[at + 3] = colour[3];
  };

  // the rounded background
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      if (dx < radius && dy < radius) {
        const cx = radius - dx;
        const cy = radius - dy;
        if (cx * cx + cy * cy > radius * radius) put(x, y, CLEAR);
        else put(x, y, BACKGROUND);
      } else {
        put(x, y, BACKGROUND);
      }
    }
  }

  const corner = (px, py, w, h, r) => {
    for (let y = py; y < py + h; y += 1) {
      for (let x = px; x < px + w; x += 1) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dx = Math.min(x - px, px + w - 1 - x);
        const dy = Math.min(y - py, py + h - 1 - y);
        if (dx < r && dy < r) {
          const cx = r - dx;
          const cy = r - dy;
          if (cx * cx + cy * cy > r * r) continue;
        }
        if (pixels[(y * size + x) * 4 + 3] !== 0) put(x, y, y < py + h ? undefined : BACKGROUND);
      }
    }
  };

  // a three by three grid: the corners muted, the middle and one diagonal in the accent
  const accentCells = new Set(["1,1", "0,2", "2,0"]);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const px = margin + column * (cell + gap);
      const py = margin + row * (cell + gap);
      const colour = accentCells.has(column + "," + row) ? ACCENT : EDGE;
      for (let y = py; y < py + cell; y += 1) {
        for (let x = px; x < px + cell; x += 1) {
          const dx = Math.min(x - px, px + cell - 1 - x);
          const dy = Math.min(y - py, py + cell - 1 - y);
          if (dx < cellRadius && dy < cellRadius) {
            const cx = cellRadius - dx;
            const cy = cellRadius - dy;
            if (cx * cx + cy * cy > cellRadius * cellRadius) continue;
          }
          put(x, y, colour);
        }
      }
    }
  }
  void corner;
  return pixels;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const payload = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload) >>> 0, 0);
  return Buffer.concat([length, payload, crc]);
}

let table = null;
function crc32(bytes) {
  if (!table) {
    table = new Int32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[index] = value;
    }
  }
  let crc = -1;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function png(size) {
  const pixels = draw(size);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const directory = join(process.cwd(), "public", "icons");
mkdirSync(directory, { recursive: true });
for (const size of [192, 512]) {
  const file = join(directory, "icon-" + size + ".png");
  writeFileSync(file, png(size));
  console.log("wrote", file);
}
writeFileSync(join(directory, "apple-touch-icon.png"), png(180));
console.log("wrote", join(directory, "apple-touch-icon.png"));
