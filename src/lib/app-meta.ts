/**
 * The version shown in the header, in Settings and in an exported diagnostics report. It comes from
 * package.json through `define` in vite.config.ts (see src/env.d.ts), so there is one place to
 * change it and the three cannot disagree.
 */
export const APP_VERSION = __APP_VERSION__;

/**
 * The repository this build came from. The theme menu links to it, and the link is hidden until it is
 * set: shipping a placeholder (`https://github.com/`) produces a link that goes nowhere useful.
 */
export const SOURCE_URL = "";
