import { Outlet, useLocation } from "react-router";
import { StepIndicator } from "@/components/ui/step-indicator";
import { useT } from "@/i18n/use-translation";
import { Header } from "./Header";
import { TaskProgressBar } from "@/components/app/task-progress-bar";
import { isPatchFlow } from "./tools";
import { useWorkflowSteps, stepIndexForPath } from "./workflow";

export function AppShell() {
  const t = useT();
  const location = useLocation();
  const steps = useWorkflowSteps();
  const stepIndex = stepIndexForPath(location.pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header />
      {isPatchFlow(location.pathname) ? (
        <div className="flex justify-center border-b border-border px-4 py-2 md:hidden">
          <StepIndicator steps={steps} currentIndex={stepIndex} />
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <TaskProgressBar />
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{t("shell.footer.privacy")}</p>
          <p>{t("shell.footer.description")}</p>
        </div>
      </footer>
    </div>
  );
}
