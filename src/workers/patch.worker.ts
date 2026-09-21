import * as Comlink from "comlink";
import { createPatchWorkerSession } from "./session";

const session = createPatchWorkerSession();

Comlink.expose({
  version: () => session.version(),
  analyze: (file: ArrayBuffer, name?: string) => session.analyze(file, name),
  plan: (request: Parameters<typeof session.plan>[0]) => session.plan(request),
  patch: (request: Parameters<typeof session.patch>[0], onProgress?: Parameters<typeof session.patch>[1]) =>
    session.patch(request, onProgress),
  cancel: () => session.cancel(),
  reset: () => session.reset(),
});
