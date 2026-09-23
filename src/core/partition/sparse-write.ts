import { PackageError } from "../errors";
import type { ByteSource } from "../package/source";
import {
  CHUNK_TYPE_FILL,
  CHUNK_TYPE_RAW,
  SPARSE_CHUNK_HEADER_SIZE,
  SPARSE_HEADER_SIZE,
  SPARSE_MAGIC,
} from "./sparse";

/**
 * Writes an Android sparse image, the format a raw partition is handed to flashing and packaging
 * tools in.
 *
 * The chunking follows AOSP's writer so that an image made here is byte for byte what `img2simg`
 * produces for the same input with its default arguments (which the tests check against the real
 * tool): a block whose bytes are all the same — zero or not — becomes one FILL chunk, runs of them
 * with the same value merge, and everything else becomes RAW chunks that merge while they are
 * adjacent. `DONTCARE` is deliberately not emitted: it means "leave whatever is already on the
 * device", which is a different statement from "this region is zero", and the AOSP tool does not use
 * it either. The header fields come from sparse_format.h, which is kept in .research/upstream/aosp/.
 */
export const DEFAULT_SPARSE_BLOCK_SIZE = 4096;

export interface SparsePackOptions {
  /** Block size in bytes; the AOSP tools take it as an argument and default to 4096. */
  blockSize?: number;
}

interface Run {
  kind: "fill" | "raw";
  /** For a fill run, the byte every pixel of it is. */
  value: number;
  startBlock: number;
  blocks: number;
}

function classify(block: Uint8Array): { kind: "fill"; value: number } | { kind: "raw" } {
  const first = block[0];
  for (let index = 1; index < block.length; index += 1) {
    if (block[index] !== first) return { kind: "raw" };
  }
  return { kind: "fill", value: first };
}

/** Walks the source block by block and reports its runs, which is what the header needs too. */
async function collectRuns(source: ByteSource, blockSize: number): Promise<{ runs: Run[]; totalBlocks: number }> {
  const totalBlocks = Math.ceil(source.size / blockSize);
  const runs: Run[] = [];
  for (let block = 0; block < totalBlocks; block += 1) {
    const offset = block * blockSize;
    const data = await source.read(offset, Math.min(blockSize, source.size - offset));
    const padded = new Uint8Array(blockSize);
    padded.set(data, 0);
    const kind = classify(padded);
    const previous = runs.at(-1);
    if (kind.kind === "fill") {
      if (previous?.kind === "fill" && previous.value === kind.value) previous.blocks += 1;
      else runs.push({ kind: "fill", value: kind.value, startBlock: block, blocks: 1 });
    } else if (previous?.kind === "raw") {
      previous.blocks += 1;
    } else {
      runs.push({ kind: "raw", value: 0, startBlock: block, blocks: 1 });
    }
  }
  return { runs, totalBlocks };
}

/**
 * A sparse image as a stream: the header is written once the runs are known, then each chunk's
 * header and payload as it is produced, so a three gigabyte partition never has to be in memory.
 */
export async function packSparseStream(
  source: ByteSource,
  options: SparsePackOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const blockSize = options.blockSize ?? DEFAULT_SPARSE_BLOCK_SIZE;
  if (!Number.isInteger(blockSize) || blockSize <= 0 || blockSize % 4 !== 0) {
    throw new PackageError(
      "A block size of " + blockSize + " is not a positive multiple of four.",
      "The block size has to be a positive multiple of four.",
    );
  }
  const { runs, totalBlocks } = await collectRuns(source, blockSize);

  const header = new Uint8Array(SPARSE_HEADER_SIZE);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, SPARSE_MAGIC, true);
  headerView.setUint16(4, 1, true);
  headerView.setUint16(6, 0, true);
  headerView.setUint16(8, SPARSE_HEADER_SIZE, true);
  headerView.setUint16(10, SPARSE_CHUNK_HEADER_SIZE, true);
  headerView.setUint32(12, blockSize, true);
  headerView.setUint32(16, totalBlocks, true);
  headerView.setUint32(20, runs.length, true);
  headerView.setUint32(24, 0, true);

  const chunkHeader = (type: number, blocks: number, totalSize: number): Uint8Array => {
    const out = new Uint8Array(SPARSE_CHUNK_HEADER_SIZE);
    const view = new DataView(out.buffer);
    view.setUint16(0, type, true);
    view.setUint16(2, 0, true);
    view.setUint32(4, blocks, true);
    view.setUint32(8, totalSize, true);
    return out;
  };

  let index = 0;
  let started = false;
  let payload: Uint8Array | null = null;
  let payloadOffset = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        if (runs.length === 0) {
          controller.enqueue(header);
          controller.close();
          return;
        }
        controller.enqueue(header);
        return;
      }
      if (payload) {
        const take = Math.min(payload.length - payloadOffset, 1024 * 1024);
        controller.enqueue(payload.subarray(payloadOffset, payloadOffset + take));
        payloadOffset += take;
        if (payloadOffset >= payload.length) payload = null;
        return;
      }
      if (index >= runs.length) {
        controller.close();
        return;
      }
      const run = runs[index];
      index += 1;
      const bytes = run.blocks * blockSize;
      if (run.kind === "fill") {
        const chunk = new Uint8Array(SPARSE_CHUNK_HEADER_SIZE + 4);
        chunk.set(chunkHeader(CHUNK_TYPE_FILL, run.blocks, SPARSE_CHUNK_HEADER_SIZE + 4), 0);
        new DataView(chunk.buffer).setUint32(SPARSE_CHUNK_HEADER_SIZE, (run.value * 0x01010101) >>> 0, true);
        controller.enqueue(chunk);
        return;
      }
      controller.enqueue(chunkHeader(CHUNK_TYPE_RAW, run.blocks, SPARSE_CHUNK_HEADER_SIZE + bytes));
      payload = await source.read(run.startBlock * blockSize, bytes);
      // a short read at the end of a partition is padded, exactly as its block was when classified
      if (payload.length < bytes) {
        const padded = new Uint8Array(bytes);
        padded.set(payload, 0);
        payload = padded;
      }
      payloadOffset = 0;
    },
  });
}

/** The same image, in memory. */
export async function packSparse(source: ByteSource, options: SparsePackOptions = {}): Promise<Uint8Array> {
  const stream = await packSparseStream(source, options);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
