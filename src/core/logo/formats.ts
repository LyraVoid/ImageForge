import { SPLASH_MAGIC, SPLASH_MAGIC_OFFSET } from "./splash";
import type { ByteSource } from "../package/source";

/**
 * The splash formats this build knows, as a table rather than as code paths. OPPO / Realme / OnePlus
 * on Qualcomm is the one that is implemented and verified against a real partition; the table exists
 * so a second vendor's container (MediaTek's `logo.bin`, for one) becomes a new entry plus its own
 * parser instead of a rewrite of the tool.
 */
export interface LogoFormat {
  id: "oppo-qualcomm" | "mtk-logo";
  /** Engine prose: the interface translates it through the record table. */
  label: string;
  /** Where the magic sits and what it is. */
  magic: { offset: number; text: string };
}

export const LOGO_FORMATS: LogoFormat[] = [
  {
    id: "oppo-qualcomm",
    label: "OPPO / Realme / OnePlus splash (Qualcomm)",
    magic: { offset: SPLASH_MAGIC_OFFSET, text: SPLASH_MAGIC },
  },
  {
    id: "mtk-logo",
    label: "MediaTek logo (Xiaomi and other MTK devices)",
    // the 512 byte header starts with this magic at offset 8
    magic: { offset: 8, text: "logo" },
  },
];

/** Which known splash container these bytes are, or null when it is none of them. */
export async function detectLogoFormat(source: ByteSource): Promise<LogoFormat | null> {
  for (const format of LOGO_FORMATS) {
    if (source.size < format.magic.offset + format.magic.text.length) continue;
    const head = await source.read(format.magic.offset, format.magic.text.length);
    if (new TextDecoder().decode(head) === format.magic.text) return format;
  }
  return null;
}
