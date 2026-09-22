export type ImageForgeErrorCode =
  | "IMAGE_PARSE_ERROR"
  | "UNSUPPORTED_IMAGE"
  | "UNSUPPORTED_ARCHITECTURE"
  | "INCOMPATIBLE_PROVIDER"
  | "ARTIFACT_ERROR"
  | "PATCH_ERROR"
  | "REPACK_ERROR"
  | "VERIFICATION_ERROR"
  | "WORKER_ERROR"
  | "PACKAGE_ERROR"
  | "ABORTED";

export interface ImageForgeErrorJson {
  code: ImageForgeErrorCode;
  message: string;
  technical?: string;
}

export class ImageForgeError extends Error {
  readonly code: ImageForgeErrorCode;
  readonly technical: string | undefined;

  constructor(code: ImageForgeErrorCode, message: string, technical?: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ImageForgeError";
    this.code = code;
    this.technical = technical;
  }

  toJSON(): ImageForgeErrorJson {
    const json: ImageForgeErrorJson = { code: this.code, message: this.message };
    if (this.technical !== undefined) json.technical = this.technical;
    return json;
  }
}

class CodedError extends ImageForgeError {
  constructor(code: ImageForgeErrorCode, name: string, message: string, technical?: string) {
    super(code, message, technical);
    this.name = name;
  }
}

export class ImageParseError extends CodedError {
  constructor(technical: string, message = "This image could not be parsed.") {
    super("IMAGE_PARSE_ERROR", "ImageParseError", message, technical);
  }
}

export class UnsupportedImageError extends CodedError {
  constructor(technical: string, message = "This image format is not supported.") {
    super("UNSUPPORTED_IMAGE", "UnsupportedImageError", message, technical);
  }
}

export class UnsupportedArchitectureError extends CodedError {
  constructor(technical: string, message = "This image architecture is not supported by the selected method.") {
    super("UNSUPPORTED_ARCHITECTURE", "UnsupportedArchitectureError", message, technical);
  }
}

export class IncompatibleProviderError extends CodedError {
  constructor(technical: string, message = "The selected patch method is not compatible with this image.") {
    super("INCOMPATIBLE_PROVIDER", "IncompatibleProviderError", message, technical);
  }
}

export class ArtifactError extends CodedError {
  constructor(technical: string, message = "A required artifact could not be resolved.") {
    super("ARTIFACT_ERROR", "ArtifactError", message, technical);
  }
}

export class PatchError extends CodedError {
  constructor(technical: string, message = "The patch step failed.") {
    super("PATCH_ERROR", "PatchError", message, technical);
  }
}

export class RepackError extends CodedError {
  constructor(technical: string, message = "The image could not be repacked.") {
    super("REPACK_ERROR", "RepackError", message, technical);
  }
}

export class VerificationError extends CodedError {
  constructor(technical: string, message = "The produced image failed verification.") {
    super("VERIFICATION_ERROR", "VerificationError", message, technical);
  }
}

export class PackageError extends CodedError {
  constructor(technical: string, message = "This package could not be read.") {
    super("PACKAGE_ERROR", "PackageError", message, technical);
  }
}

export class WorkerError extends CodedError {
  constructor(technical: string, message = "A worker task failed.") {
    super("WORKER_ERROR", "WorkerError", message, technical);
  }
}

export class AbortedError extends CodedError {
  constructor(message = "The operation was cancelled.") {
    super("ABORTED", "AbortedError", message);
  }
}

export function isImageForgeError(value: unknown): value is ImageForgeError {
  return value instanceof ImageForgeError;
}

export function toImageForgeError(value: unknown): ImageForgeError {
  if (isImageForgeError(value)) return value;
  if (value instanceof Error) {
    const technical = value.stack ?? value.message;
    return new ImageForgeError("PATCH_ERROR", value.message, technical, value);
  }
  return new ImageForgeError("PATCH_ERROR", "An unexpected error occurred.", String(value));
}

export function describeError(value: unknown): ImageForgeErrorJson {
  return toImageForgeError(value).toJSON();
}
