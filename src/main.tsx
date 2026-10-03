import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/app.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Disable the WebView2 default context menu outside editable fields.
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, [contenteditable], .selectable, .prose")) return;
  e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
