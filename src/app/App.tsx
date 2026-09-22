import { RouterProvider } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocaleSync } from "@/stores/locale-store";
import { useThemeSync } from "@/stores/theme-store";
import { router } from "./router";

export function App() {
  useThemeSync();
  useLocaleSync();
  return (
    <TooltipProvider delayDuration={200}>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
