import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHaleroApi } from "./lib/api";
import { ApiProvider } from "./lib/api-context";
import { createTrpcClient } from "./lib/trpc";
import { buildWebModules } from "./registry";
import { createAppRouter } from "./router";

const client = createTrpcClient();
const api = createHaleroApi(client);
const queryClient = new QueryClient();
const router = createAppRouter(api, buildWebModules(client));

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Halero could not start: the page is missing #root.");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
