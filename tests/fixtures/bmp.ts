/**
 * A minimal 24 bit BMP writer, the pixel format splash frames use: bottom-up rows, BGR order, each
 * row padded to a four byte boundary. Independent of the project's own BMP reading code, so a test
 * that writes with this and reads with the project's code is checking the format, not itself.
 */
export function buildBmp(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): Uint8Array {
  const rowBytes = width * 3;
  const rowSize = Math.ceil(rowBytes / 4) * 4;
  const dataSize = rowSize * height;
  const out = new Uint8Array(54 + dataSize);
  const view = new DataView(out.buffer);

  out[0] = 0x42; // "BM"
  out[1] = 0x4d;
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setUint32(18, width, true);
  view.setUint32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, dataSize, true);
  view.setUint32(38, 2835, true);
  view.setUint32(42, 2835, true);

  for (let row = 0; row < height; row += 1) {
    // the first stored row is the bottom one
    const y = height - row - 1;
    const at = 54 + row * rowSize;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      out[at + x * 3] = b & 0xff;
      out[at + x * 3 + 1] = g & 0xff;
      out[at + x * 3 + 2] = r & 0xff;
    }
  }
  return out;
}
