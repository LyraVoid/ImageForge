import { sha256Hex } from "../../hash";
import { toImageForgeError } from "../../errors";
import { COMPRESSION_LABEL, detectCompression, isDecompressionSupported } from "../compression";
import type { ImageFormat, SectionName } from "../types";
import { sectionOf } from "../types";
import { parseImage } from "./parser";

export type CheckStatus = "pass" | "warn" | "fail";

export interface VerificationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface VerifyExpectations {
  format?: ImageFormat;
  headerVersion?: number;
  ramdiskSha256?: string;
  kernelSha256?: string;
  cmdlineIncludes?: string;
  bootconfigIncludes?: string;
  maxSizeBytes?: number;
}

export interface ImageVerification {
  valid: boolean;
  checks: VerificationCheck[];
  sha256: string;
  format: ImageFormat | "unknown";
  warnings: string[];
}

function check(id: string, label: string, status: CheckStatus, detail?: string): VerificationCheck {
  const value: VerificationCheck = { id, label, status };
  if (detail !== undefined) value.detail = detail;
  return value;
}

function findRamdisk(image: ReturnType<typeof parseImage>): { name: SectionName; data: Uint8Array } | null {
  const ramdisk = sectionOf(image, "ramdisk") ?? sectionOf(image, "vendor_ramdisk");
  return ramdisk ? { name: ramdisk.name, data: ramdisk.data } : null;
}

export async function verifyImage(
  bytes: Uint8Array,
  expectations: VerifyExpectations = {},
): Promise<ImageVerification> {
  const checks: VerificationCheck[] = [];
  const warnings: string[] = [];
  let format: ImageFormat | "unknown" = "unknown";

  const limit = expectations.maxSizeBytes ?? 512 * 1024 * 1024;
  checks.push(
    bytes.length <= limit
      ? check("size-limit", "Output size within limits", "pass", bytes.length + " bytes")
      : check("size-limit", "Output size within limits", "fail", bytes.length + " bytes exceeds " + limit),
  );

  try {
    const image = parseImage(bytes);
    format = image.format;
    warnings.push(...image.warnings);
    checks.push(
      check(
        "structure",
        "Image structure valid",
        "pass",
        image.format + " header v" + image.headerVersion + ", page size " + image.pageSize + " bytes",
      ),
    );

    if (expectations.format !== undefined) {
      checks.push(
        image.format === expectations.format
          ? check("format", "Image format matches the patch plan", "pass", image.format)
          : check(
              "format",
              "Image format matches the patch plan",
              "fail",
              "expected " + expectations.format + ", found " + image.format,
            ),
      );
    }

    if (expectations.headerVersion !== undefined) {
      checks.push(
        image.headerVersion === expectations.headerVersion
          ? check("header-version", "Boot header version matches the patch plan", "pass", "v" + image.headerVersion)
          : check(
              "header-version",
              "Boot header version matches the patch plan",
              "fail",
              "expected v" + expectations.headerVersion + ", found v" + image.headerVersion,
            ),
      );
    }

    const ramdisk = findRamdisk(image);
    if (ramdisk) {
      const compression = detectCompression(ramdisk.data);
      checks.push(
        isDecompressionSupported(compression)
          ? check("ramdisk-payload", "Ramdisk payload readable", "pass", COMPRESSION_LABEL[compression])
          : check(
              "ramdisk-payload",
              "Ramdisk payload readable",
              "warn",
              COMPRESSION_LABEL[compression] + " payloads cannot be expanded in this build",
            ),
      );
      if (expectations.ramdiskSha256 !== undefined) {
        const actual = await sha256Hex(ramdisk.data);
        checks.push(
          actual === expectations.ramdiskSha256
            ? check("ramdisk-hash", "Ramdisk SHA-256 matches the patch plan", "pass", actual)
            : check(
                "ramdisk-hash",
                "Ramdisk SHA-256 matches the patch plan",
                "fail",
                "expected " + expectations.ramdiskSha256 + ", found " + actual,
              ),
        );
      }
    } else {
      checks.push(check("ramdisk-payload", "Ramdisk payload readable", "warn", "The image has no ramdisk section."));
    }

    const kernel = sectionOf(image, "kernel");
    if (expectations.kernelSha256 !== undefined) {
      const actual = kernel ? await sha256Hex(kernel.data) : "";
      checks.push(
        actual === expectations.kernelSha256
          ? check("kernel-hash", "Kernel SHA-256 matches the patch plan", "pass", actual)
          : check(
              "kernel-hash",
              "Kernel SHA-256 matches the patch plan",
              "fail",
              "expected " + expectations.kernelSha256 + ", found " + (actual || "no kernel"),
            ),
      );
    }

    if (expectations.cmdlineIncludes !== undefined) {
      checks.push(
        image.cmdline.includes(expectations.cmdlineIncludes)
          ? check("cmdline", "Kernel cmdline carries the planned options", "pass", expectations.cmdlineIncludes)
          : check(
              "cmdline",
              "Kernel cmdline carries the planned options",
              "fail",
              '"' + expectations.cmdlineIncludes + '" is missing from the cmdline',
            ),
      );
    }

    if (expectations.bootconfigIncludes !== undefined) {
      const bootconfig = sectionOf(image, "bootconfig");
      const text = bootconfig ? new TextDecoder().decode(bootconfig.data) : "";
      checks.push(
        text.includes(expectations.bootconfigIncludes)
          ? check("bootconfig", "Bootconfig carries the patch manifest", "pass")
          : check("bootconfig", "Bootconfig carries the patch manifest", "fail", "marker not found in bootconfig"),
      );
    }
  } catch (error) {
    const normalized = toImageForgeError(error);
    checks.push(
      check(
        "structure",
        "Image structure valid",
        "fail",
        normalized.technical ?? normalized.message,
      ),
    );
  }

  const sha256 = await sha256Hex(bytes);
  return {
    valid: checks.every((entry) => entry.status !== "fail"),
    checks,
    sha256,
    format,
    warnings,
  };
}
