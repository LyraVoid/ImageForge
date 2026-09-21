import { RouterProvider } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useThemeSync } from "@/stores/theme-store";
import { router } from "./router";

export function App() {
  useThemeSync();
  return (
    <TooltipProvider delayDuration={200}>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
