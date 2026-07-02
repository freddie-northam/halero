import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverOrigin = "http://localhost:4253";

// Vite requires a default export here; biome.json carries a narrow override
// for exactly this file.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // The origin header is rewritten because the server rejects mutations
      // from foreign origins (CSRF check) and the Vite dev origin differs
      // from the server's own origin.
      "/api": { target: serverOrigin, headers: { origin: serverOrigin } },
      "/healthz": { target: serverOrigin },
    },
  },
});
