// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/ui/status-badge";
import { StepIndicator } from "@/components/ui/step-indicator";
import { WORKFLOW_STEP_KEYS } from "@/app/workflow";
import { translate } from "@/i18n/translate";

const steps = WORKFLOW_STEP_KEYS.map((step) => ({ id: step.id, label: translate("en", step.labelKey) }));

afterEach(cleanup);

describe("workflow UI", () => {
  it("marks the current workflow step for assistive technology", () => {
    render(<StepIndicator steps={steps} currentIndex={2} />);
    expect(screen.getByRole("list", { name: /workflow progress/i })).toBeInTheDocument();
    const current = screen.getByText("Patch").closest("button");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("renders the step names of the chosen language", () => {
    const japanese = WORKFLOW_STEP_KEYS.map((step) => ({ id: step.id, label: translate("ja", step.labelKey) }));
    render(<StepIndicator steps={japanese} currentIndex={2} />);
    expect(screen.getByText("パッチ")).toBeInTheDocument();
    expect(screen.queryByText("Patch")).toBeNull();
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
