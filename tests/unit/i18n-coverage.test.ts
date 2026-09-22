import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROVIDER_DESCRIPTORS,
  buildImageReport,
  createArtifactRegistry,
  createProviderRegistry,
  parseImage,
} from "@/core";
import { RECORD_MESSAGES } from "@/i18n/record";
import type { RecordLocale } from "@/i18n/record";
import { buildBootImage, buildVendorBootImage, gzipBytes } from "../fixtures/bootimg";
import { buildRamdisk } from "../fixtures/cpio";

const RECORD_LOCALES: RecordLocale[] = ["zh-Hans", "zh-Hant", "ja"];

function readSourceTree(directory: string): string {
  const parts: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(readSourceTree(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) parts.push(readFileSync(path, "utf8"));
  }
  return parts.join("\n");
}

/** Engine prose that is a fixed sentence: pipeline stage labels and progress lines. */
function literalsFromSources(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/label:\s*"([^"]+)"/g)) found.add(match[1]);
  for (const match of source.matchAll(/emit\([^)]*?,\s*"(?:[^"\\]|\\.)*"\s*\)/g)) {
    const inner = match[0].match(/,\s*"((?:[^"\\]|\\.)*)"\s*\)$/);
    if (inner) found.add(inner[1]);
  }
  return [...found];
}

async function collectedProse(): Promise<Set<string>> {
  const used = new Set<string>();
  const artifacts = createArtifactRegistry();
  const providers = createProviderRegistry(artifacts);

  // the analysis report of a boot image with a real CPIO ramdisk and of a vendor boot image
  const ramdisk = await gzipBytes(
    buildRamdisk([
      { name: "dev", mode: 0o040755 },
      { name: "init", data: "#!/init\n", mode: 0o100755 },
      { name: "link", mode: 0o120777 },
    ]),
  );
  const boot = parseImage(await buildBootImage({ ramdisk, bootconfig: new TextEncoder().encode("androidboot.x=1\n") }));
  const vendor = parseImage(await buildVendorBootImage({}));

  for (const image of [boot, vendor]) {
    const report = await buildImageReport(image, { sourceName: "boot.img", sourceSize: image.totalSize });
    for (const group of [...report.groups, report.technical]) {
      used.add(group.title);
      for (const field of group.fields) {
        used.add(field.label);
        if (field.hint) used.add(field.hint);
      }
    }
  }

  for (const descriptor of PROVIDER_DESCRIPTORS) {
    used.add(descriptor.description);
    for (const note of descriptor.notes) used.add(note);
  }

  for (const id of ["mock", "apatch", "kernelsu", "magisk"]) {
    const provider = providers.get(id);
    expect(provider, id).toBeDefined();
    const analysis = await provider?.analyze(boot);
    for (const note of analysis?.notes ?? []) used.add(note);
  }

  for (const literal of literalsFromSources(readSourceTree(join(process.cwd(), "src", "core")))) {
    used.add(literal);
  }

  return used;
}

describe("engine prose coverage", () => {
  it("translates every report label, provider sentence, stage label and progress line", async () => {
    const used = await collectedProse();
    expect(used.size).toBeGreaterThan(100);

    // Raw field names such as kernel_size are identifiers, not prose, and a sentence that
    // carries a file name, a digest or a count cannot be a key either. Both stay English on
    // purpose, which is why this check names what it demands instead of demanding everything.
    const IDENTIFIER = /^[A-Za-z0-9_[\].]+$/;
    const DATA = /[0-9]|[A-Za-z0-9_]+\.[A-Za-z0-9]+|\//;
    /** Header fields shown exactly as the format names them. */
    const RAW_FIELD_NAMES = new Set(["os_version raw"]);
    const prose = (text: string): boolean =>
      !IDENTIFIER.test(text) && !RAW_FIELD_NAMES.has(text) && !DATA.test(text);

    for (const locale of RECORD_LOCALES) {
      const table = RECORD_MESSAGES[locale];
      const missing = [...used].filter((text) => prose(text) && table[text] === undefined);
      expect(missing, locale + " is missing: " + missing.join(" | ")).toEqual([]);
    }
  });

  it("keeps every table entry tied to prose the engine actually produces", () => {
    const source = readSourceTree(join(process.cwd(), "src", "core"));
    for (const locale of RECORD_LOCALES) {
      const orphaned = Object.keys(RECORD_MESSAGES[locale]).filter((key) => !source.includes(key));
      expect(orphaned, locale + " has stale keys: " + orphaned.join(" | ")).toEqual([]);
    }
  });
});
