import { fitRgba } from "./bmp";
import type { FittedImage, SplashFit } from "./bmp";
import type { SplashFrame } from "./splash";

/**
 * The four ways an image can be adapted to a frame, matching this project's FolkSplash tool.
 *
 * One thing is deliberately different. FolkSplash sizes `autoAdapt` against the width and height in
 * the splash header, but a real CPH2723 splash declares 1080x1920 while its frames are up to
 * 1440x3168: adapting to the header would shrink the images the panel actually shows. The frame that
 * is being replaced is the honest reference, so every mode below uses it.
 */
export type SplashResolutionMode = "direct" | "followOriginal" | "autoAdapt" | "custom";

export interface AdaptRequest {
  mode: SplashResolutionMode;
  /** The frame being replaced; its size is the reference for the modes that size against one. */
  frame: SplashFrame;
  /** What the image really is, and how big. */
  image: { width: number; height: number };
  customWidth?: number;
  customHeight?: number;
  /** The original frame's size, read from the current image. Defaults to the frame's own BMP size. */
  originalWidth?: number;
  originalHeight?: number;
}

export interface AdaptResult extends FittedImage {
  fit: SplashFit | "none";
  /** The size the image was adapted to, for the interface to show and the metadata to record. */
  target: { width: number; height: number };
}

export function adaptImage(
  rgba: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  request: AdaptRequest,
): AdaptResult {
  const originalWidth = request.originalWidth ?? imageWidth;
  const originalHeight = request.originalHeight ?? imageHeight;

  switch (request.mode) {
    case "direct":
      // exactly the image that was supplied, pixel for pixel
      return {
        rgba,
        width: imageWidth,
        height: imageHeight,
        fit: "none",
        target: { width: imageWidth, height: imageHeight },
      };
    case "followOriginal": {
      const fitted = fitRgba(rgba, imageWidth, imageHeight, originalWidth, originalHeight, "cover");
      return { ...fitted, fit: "cover", target: { width: originalWidth, height: originalHeight } };
    }
    case "autoAdapt": {
      // never larger than the frame, and never upscaled beyond what the image already has
      const targetWidth = Math.min(imageWidth, originalWidth);
      const targetHeight = Math.min(imageHeight, originalHeight);
      const fitted = fitRgba(rgba, imageWidth, imageHeight, targetWidth, targetHeight, "stretch");
      return { ...fitted, fit: "stretch", target: { width: targetWidth, height: targetHeight } };
    }
    case "custom": {
      const targetWidth = request.customWidth ?? originalWidth;
      const targetHeight = request.customHeight ?? originalHeight;
      if (targetWidth <= 0 || targetHeight <= 0) {
        throw new Error("A custom frame size has to be positive; got " + targetWidth + "x" + targetHeight + ".");
      }
      const fitted = fitRgba(rgba, imageWidth, imageHeight, targetWidth, targetHeight, "cover");
      return { ...fitted, fit: "cover", target: { width: targetWidth, height: targetHeight } };
    }
  }
}
