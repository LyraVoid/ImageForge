/// <reference types="vite/client" />

/**
 * The version from package.json, replaced at build time by `define` in vite.config.ts. It is a
 * compile time constant rather than a fetch, so the interface can show it without a request.
 */
declare global {
  const __APP_VERSION__: string;
}

export {};
