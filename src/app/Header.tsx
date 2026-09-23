import { Moon, Settings, Sun, Monitor, GitBranch, Trash2 } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageMenu } from "@/components/ui/language-menu";
import { StepIndicator } from "@/components/ui/step-indicator";
import { useT } from "@/i18n/use-translation";
import { APP_VERSION } from "@/lib/app-meta";
import { useForgeStore } from "@/stores/forge-store";
import { useThemeStore } from "@/stores/theme-store";
import type { ThemeMode } from "@/stores/theme-store";
import { isPatchFlow } from "./tools";
import { useWorkflowSteps, stepIndexForPath } from "./workflow";

const THEME_KEYS: Array<{ value: ThemeMode; labelKey: "shell.theme.light" | "shell.theme.dark" | "shell.theme.system" }> = [
  { value: "light", labelKey: "shell.theme.light" },
  { value: "dark", labelKey: "shell.theme.dark" },
  { value: "system", labelKey: "shell.theme.system" },
];

export function Header() {
  const t = useT();
  const location = useLocation();
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const steps = useWorkflowSteps();
  const stepIndex = stepIndexForPath(location.pathname);
  const clearWorkspace = useForgeStore((state) => state.clearWorkspace);
  const hasWorkspace = useForgeStore((state) => state.source !== null || state.artifacts.length > 0);
  // Only the patcher has steps; on the tools page the freed space belongs to the site name.
  const inPatchFlow = isPatchFlow(location.pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-surface-muted">
          <span className="flex size-6 items-center justify-center rounded-md border border-primary-border bg-primary-muted text-[11px] font-semibold text-primary">
            IF
          </span>
          <span className="text-sm font-semibold tracking-tight">ImageForge</span>
          <Badge variant="neutral" className="hidden sm:inline-flex">
            v{APP_VERSION}
          </Badge>
        </Link>

        <Link
          to="/"
          className="hidden text-xs text-muted-foreground transition-colors hover:text-foreground sm:block"
        >
          {t("shell.tools")}
        </Link>


        {inPatchFlow ? (
          <div className="hidden flex-1 justify-center md:flex">
            <StepIndicator steps={steps} currentIndex={stepIndex} />
          </div>
        ) : (
          <div className="hidden flex-1 md:block" />
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("shell.clearWorkspace")}
            title={t("shell.clearWorkspace")}
            onClick={() => {
              if (!hasWorkspace || window.confirm(t("shell.clearWorkspaceConfirm"))) void clearWorkspace();
            }}
          >
            <Trash2 />
          </Button>
          <LanguageMenu />
          <Button asChild variant="ghost" size="icon" aria-label={t("shell.aria.settings")}>
            <Link to="/settings">
              <Settings />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("shell.aria.theme")}>
                {mode === "dark" ? <Moon /> : mode === "light" ? <Sun /> : <Monitor />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{t("shell.appearance")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
                {THEME_KEYS.map((entry) => (
                  <DropdownMenuRadioItem key={entry.value} value={entry.value}>
                    {t(entry.labelKey)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="size-3.5" />
                  {t("shell.settings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="https://github.com/" target="_blank" rel="noreferrer noopener">
                  <GitBranch className="size-3.5" />
                  {t("shell.source")}
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
