// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/ui/status-badge";
import { StepIndicator } from "@/components/ui/step-indicator";
import { WORKFLOW_STEPS } from "@/app/workflow";

describe("workflow UI", () => {
  it("marks the current workflow step for assistive technology", () => {
    render(<StepIndicator steps={WORKFLOW_STEPS} currentIndex={2} />);
    expect(screen.getByRole("list", { name: /workflow progress/i })).toBeInTheDocument();
    const current = screen.getByText("Patch").closest("button");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("renders verification states with their label and detail", () => {
    render(<StatusBadge status="pass" label="Image structure valid" detail="boot header v4" />);
    expect(screen.getByText("Image structure valid")).toBeInTheDocument();
    expect(screen.getByText("boot header v4")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
  });

  it("renders a failing check with its technical detail", () => {
    render(<StatusBadge status="fail" label="Ramdisk SHA-256 matches the patch plan" detail="expected a, found b" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("expected a, found b")).toBeInTheDocument();
  });
});
