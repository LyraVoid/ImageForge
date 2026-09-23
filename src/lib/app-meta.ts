/**
 * The version shown in the header, in Settings and in an exported diagnostics report. It comes from
 * package.json through `define` in vite.config.ts (see src/env.d.ts), so there is one place to
 * change it and the three cannot disagree.
 */
export const APP_VERSION = __APP_VERSION__;
