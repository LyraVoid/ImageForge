import { Moon, Settings, Sun, Monitor, GitBranch } from "lucide-react";
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
import { StepIndicator } from "@/components/ui/step-indicator";
import { useThemeStore } from "@/stores/theme-store";
import type { ThemeMode } from "@/stores/theme-store";
import { WORKFLOW_STEPS, stepIndexForPath } from "./workflow";

export function Header() {
  const location = useLocation();
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const stepIndex = stepIndexForPath(location.pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-surface-muted">
          <span className="flex size-6 items-center justify-center rounded-md border border-primary-border bg-primary-muted text-[11px] font-semibold text-primary">
            IF
          </span>
          <span className="text-sm font-semibold tracking-tight">ImageForge</span>
          <Badge variant="neutral" className="hidden sm:inline-flex">
            v0.1
          </Badge>
        </Link>

        <div className="hidden flex-1 justify-center md:flex">
          <StepIndicator steps={WORKFLOW_STEPS} currentIndex={stepIndex} />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Open settings">
            <Link to="/settings">
              <Settings />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Change theme">
                {mode === "dark" ? <Moon /> : mode === "light" ? <Sun /> : <Monitor />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="size-3.5" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="https://github.com/" target="_blank" rel="noreferrer noopener">
                  <GitBranch className="size-3.5" />
                  Source
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
