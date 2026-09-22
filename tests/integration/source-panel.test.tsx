// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SourcePanel } from "@/components/app/source-panel";
import { detectArtifact } from "@/core/workspace";
import type { WorkspaceSourceRecord } from "@/workers/protocol";
import { buildBootImage } from "../fixtures/bootimg";

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
    // both tools that accept a package are planned, so both say so
    expect(screen.getAllByText("Not implemented in this build yet.").length).toBeGreaterThanOrEqual(1);
    // the patcher does not accept a package, so it is not offered here
    expect(screen.queryByText("Patch an image")).toBeNull();
  });

  it("offers the patcher for a boot image and no excuse about it", async () => {
    render(<SourcePanel source={source("init_boot.img", await buildBootImage({ kernel: null }))} />);

    expect(screen.getByText("Raw bytes")).toBeInTheDocument();
    expect(screen.getByText("Android init_boot image · v4")).toBeInTheDocument();
    expect(screen.getByText("Patch an image")).toBeInTheDocument();
    // the patcher is the only available tool here; the read-only inspector is still planned
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getAllByText("Not implemented in this build yet.")).toHaveLength(1);
  });

  it("says so when nothing implements the file it can name", () => {
    render(<SourcePanel source={source("mystery.bin", new Uint8Array(64).fill(0x11))} />);

    expect(screen.getByText("Raw bytes")).toBeInTheDocument();
    expect(screen.getByText("Unknown content")).toBeInTheDocument();
    expect(screen.getByText("Inspect an image")).toBeInTheDocument();
  });
});
