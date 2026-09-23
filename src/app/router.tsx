import { Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router";
import { AppShell } from "./AppShell";
import { RouteFallback } from "./route-fallback";
import { PATCH_ROUTES } from "./tools";

const ToolsPage = lazy(() => import("@/routes/ToolsPage").then((module) => ({ default: module.ToolsPage })));
const PatchImagePage = lazy(() =>
  import("@/routes/PatchImagePage").then((module) => ({ default: module.PatchImagePage })),
);
const ExtractPage = lazy(() =>
  import("@/routes/ExtractPage").then((module) => ({ default: module.ExtractPage })),
);
const BootAnimationPage = lazy(() =>
  import("@/routes/BootAnimationPage").then((module) => ({ default: module.BootAnimationPage })),
);
const LogoPage = lazy(() =>
  import("@/routes/LogoPage").then((module) => ({ default: module.LogoPage })),
);
const InspectPage = lazy(() =>
  import("@/routes/InspectPage").then((module) => ({ default: module.InspectPage })),
);
const UnpackPage = lazy(() =>
  import("@/routes/UnpackPage").then((module) => ({ default: module.UnpackPage })),
);
const AnalyzePage = lazy(() => import("@/routes/AnalyzePage").then((module) => ({ default: module.AnalyzePage })));
const PatchPage = lazy(() => import("@/routes/PatchPage").then((module) => ({ default: module.PatchPage })));
const ProcessingPage = lazy(() =>
  import("@/routes/ProcessingPage").then((module) => ({ default: module.ProcessingPage })),
);
const ResultPage = lazy(() => import("@/routes/ResultPage").then((module) => ({ default: module.ResultPage })));
const SettingsPage = lazy(() =>
  import("@/routes/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
const NotFoundPage = lazy(() =>
  import("@/routes/NotFoundPage").then((module) => ({ default: module.NotFoundPage })),
);

function lazyRoute(node: ReactNode): ReactNode {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>;
}

/**
 * The site is a set of tools; the patcher is one of them, and it is the only one with steps. The
 * paths it used before the tools page existed stay valid as redirects: they used to be the address
 * of a working flow.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: lazyRoute(<ToolsPage />) },
      { path: "tools/patch/image", element: lazyRoute(<PatchImagePage />) },
      { path: "tools/patch/analyze", element: lazyRoute(<AnalyzePage />) },
      { path: "tools/patch/plan", element: lazyRoute(<PatchPage />) },
      { path: "tools/patch/run", element: lazyRoute(<ProcessingPage />) },
      { path: "tools/patch/result", element: lazyRoute(<ResultPage />) },
      { path: "tools/extract", element: lazyRoute(<ExtractPage />) },
      { path: "tools/unpack", element: lazyRoute(<UnpackPage />) },
      { path: "tools/logo", element: lazyRoute(<LogoPage />) },
      { path: "tools/bootanimation", element: lazyRoute(<BootAnimationPage />) },
      { path: "tools/inspect", element: lazyRoute(<InspectPage />) },
      { path: "settings", element: lazyRoute(<SettingsPage />) },
      { path: "analyze", element: <Navigate to={PATCH_ROUTES.analyze} replace /> },
      { path: "patch", element: <Navigate to={PATCH_ROUTES.plan} replace /> },
      { path: "processing", element: <Navigate to={PATCH_ROUTES.run} replace /> },
      { path: "result", element: <Navigate to={PATCH_ROUTES.result} replace /> },
      { path: "*", element: lazyRoute(<NotFoundPage />) },
    ],
  },
]);
