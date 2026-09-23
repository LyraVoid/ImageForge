// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SourcePanel } from "@/components/app/source-panel";
import { detectArtifact } from "@/core/workspace";
import type { WorkspaceSourceRecord } from "@/workers/protocol";
import { buildBootImage } from "../fixtures/bootimg";
import { buildSparse } from "../fixtures/sparse";
import { buildSplash } from "../fixtures/splash";

function source(name: string, bytes: Uint8Array): WorkspaceSourceRecord {
  const detected = detectArtifact(bytes);
  return { id: "source-1", name, sizeBytes: bytes.length, kind: detected.kind, detected };
}

function zipBytes(): Uint8Array {
  const bytes = new Uint8Array(128);
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  return bytes;
}

afterEach(cleanup);

describe("the source panel", () => {
  it("names a package and the tool that would take it", () => {
    render(<SourcePanel source={source("ota.zip", zipBytes())} />);

    expect(screen.getByText("What you opened")).toBeInTheDocument();
    expect(screen.getByText("Zip archive")).toBeInTheDocument();
    expect(screen.getByText("Unknown content")).toBeInTheDocument();
    expect(screen.getByText("Extract from a package")).toBeInTheDocument();
    // both tools that accept a package are implemented now, so neither says otherwise
    expect(screen.queryByText("Not implemented in this build yet.")).toBeNull();
    // the patcher does not accept a package, so it is not offered here
    expect(screen.queryByText("Patch an image")).toBeNull();
  });

  it("offers the patcher for a boot image and no excuse about it", async () => {
    render(<SourcePanel source={source("init_boot.img", await buildBootImage({ kernel: null }))} />);

    expect(screen.getByText("Raw bytes")).toBeInTheDocument();
    expect(screen.getByText("Android init_boot image · v4")).toBeInTheDocument();
    expect(screen.getByText("Patch an image")).toBeInTheDocument();
    // name the tools rather than count them: a new tool that accepts a boot image is not a failure
    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getAllByText("Available").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Not implemented in this build yet.")).toBeNull();
  });

  it("says so when nothing implements the file it can name", () => {
    render(<SourcePanel source={source("mystery.bin", new Uint8Array(64).fill(0x11))} />);

    expect(screen.getByText("Raw bytes")).toBeInTheDocument();
    expect(screen.getByText("Unknown content")).toBeInTheDocument();
    expect(screen.getByText("Inspect an image")).toBeInTheDocument();
  });
});

describe("only files that are boot images get the boot image tools", () => {
  it("does not offer the logo tool for something it could not name", () => {
    render(<SourcePanel source={source("mystery.img", new Uint8Array(64 * 1024).fill(0x11))} />);

    expect(screen.queryByText("Boot logo (first screen)")).toBeNull();
  });

  it("does not offer it for a partition image that is not a logo either", async () => {
    const sparse = buildSparse([
      { type: "raw", blockCount: 2, data: new Uint8Array(8192).fill(0x41) },
      { type: "dont-care", blockCount: 1 },
    ]);
    render(<SourcePanel source={source("super.sparse.img", sparse)} />);
    expect(screen.getByText("Android sparse image")).toBeInTheDocument();
    expect(screen.queryByText("Boot logo (first screen)")).toBeNull();
  });

  it("offers it for a splash image, which it can now name", async () => {
    const splash = await buildSplash([{ name: "boot", width: 8, height: 4, color: [1, 2, 3] }]);
    render(<SourcePanel source={source("splash.img", splash)} />);

    expect(screen.getByText("Splash or logo image")).toBeInTheDocument();
    expect(screen.getByText("Boot logo (first screen)")).toBeInTheDocument();
  });
});
