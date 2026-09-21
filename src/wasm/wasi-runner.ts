import { ConsoleStdout, File, OpenFile, PreopenDirectory, WASI, WASIProcExit } from "@bjorn3/browser_wasi_shim";
import { AbortedError } from "@/core/errors";

export interface WasiToolRunOptions {
  module: WebAssembly.Module;
  args: string[];
  files?: Record<string, Uint8Array>;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
  signal?: AbortSignal;
}

export interface WasiToolRunResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
  files: Record<string, Uint8Array>;
}

const moduleCache = new Map<string, WebAssembly.Module>();

export async function compileWasiModule(cacheKey: string, bytes: Uint8Array): Promise<WebAssembly.Module> {
  const cached = moduleCache.get(cacheKey);
  if (cached) return cached;
  const module = await WebAssembly.compile(bytes as unknown as BufferSource);
  moduleCache.set(cacheKey, module);
  return module;
}

export function clearWasiModuleCache(): void {
  moduleCache.clear();
}

interface InodeLike {
  data?: Uint8Array;
}

function directoryContents(directory: PreopenDirectory): Map<string, InodeLike> | undefined {
  const candidates: unknown[] = [directory, (directory as unknown as { dir?: unknown }).dir];
  for (const candidate of candidates) {
    const contents = (candidate as { contents?: Map<string, InodeLike> } | undefined)?.contents;
    if (contents instanceof Map) return contents;
  }
  return undefined;
}

export async function runWasiTool(options: WasiToolRunOptions): Promise<WasiToolRunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const inputs = new Map<string, File>();
  for (const [name, bytes] of Object.entries(options.files ?? {})) {
    inputs.set(name, new File(bytes));
  }

  const preopen = new PreopenDirectory("/", inputs);

  const record = (line: string, sink: string[], forward?: (value: string) => void): void => {
    if (options.signal?.aborted) throw new AbortedError();
    sink.push(line);
    forward?.(line);
  };

  const fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((line) => record(line, stdout, options.onStdout)),
    ConsoleStdout.lineBuffered((line) => record(line, stderr, options.onStderr)),
    preopen,
  ];

  const wasi = new WASI(["kptools", ...options.args], [], fds, { debug: false });
  const instance = await WebAssembly.instantiate(options.module, { wasi_snapshot_preview1: wasi.wasiImport });

  let exitCode = 0;
  try {
    const returned = wasi.start(
      instance as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } },
    );
    if (typeof returned === "number") exitCode = returned;
  } catch (error) {
    if (error instanceof WASIProcExit) {
      exitCode = error.code;
    } else if (error && typeof (error as { code?: unknown }).code === "number") {
      exitCode = (error as { code: number }).code;
    } else {
      throw error;
    }
  }

  const outputs: Record<string, Uint8Array> = {};
  const contents = directoryContents(preopen);
  if (contents) {
    for (const [name, inode] of contents) {
      if (inode.data instanceof Uint8Array) outputs[name] = inode.data;
    }
  }

  return { exitCode, stdout, stderr, files: outputs };
}
