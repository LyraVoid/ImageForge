import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import "@/styles/index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("The #root container is missing from index.html.");
}

// The tools are local, so once the shell and the codecs are cached the app works offline. Only in a
// build: in development a service worker would keep serving the build's own files back at Vite.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
