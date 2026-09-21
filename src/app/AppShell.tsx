import { Outlet, useLocation } from "react-router";
import { StepIndicator } from "@/components/ui/step-indicator";
import { Header } from "./Header";
import { WORKFLOW_STEPS, stepIndexForPath } from "./workflow";

export function AppShell() {
  const location = useLocation();
  const stepIndex = stepIndexForPath(location.pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header />
      <div className="flex justify-center border-b border-border px-4 py-2 md:hidden">
        <StepIndicator steps={WORKFLOW_STEPS} currentIndex={stepIndex} />
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>Local-first · Private · Open Source — images never leave your browser.</p>
          <p>
            ImageForge analyzes, patches, repacks and verifies Android images. It never flashes a device.
          </p>
        </div>
      </footer>
    </div>
  );
}
