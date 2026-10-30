import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { DEMO, installDemoBackend } from "./lib/api";
import { AuthProvider } from "./lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

// La demostración se publica como una página estática: rutas con # y servidor dentro del navegador.
const Router = DEMO ? HashRouter : BrowserRouter;

const boot = DEMO
  ? import("./lib/demo-api").then((m) =>
      installDemoBackend({ request: m.demoRequest, asset: m.resolveDemoAsset }),
    )
  : Promise.resolve();

void boot.then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router>
          <AuthProvider>
            <App />
          </AuthProvider>
        </Router>
      </QueryClientProvider>
    </StrictMode>,
  ),
);
