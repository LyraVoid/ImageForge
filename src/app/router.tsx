import { Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { createBrowserRouter } from "react-router";
import { AppShell } from "./AppShell";
import { RouteFallback } from "./route-fallback";

const HomePage = lazy(() => import("@/routes/HomePage").then((module) => ({ default: module.HomePage })));
const AnalyzePage = lazy(() =>
  import("@/routes/AnalyzePage").then((module) => ({ default: module.AnalyzePage })),
);
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

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: lazyRoute(<HomePage />) },
      { path: "analyze", element: lazyRoute(<AnalyzePage />) },
      { path: "patch", element: lazyRoute(<PatchPage />) },
      { path: "processing", element: lazyRoute(<ProcessingPage />) },
      { path: "result", element: lazyRoute(<ResultPage />) },
      { path: "settings", element: lazyRoute(<SettingsPage />) },
      { path: "*", element: lazyRoute(<NotFoundPage />) },
    ],
  },
]);
