import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Defaults to 5173, but honours the PORT env var so the dev server can be
    // launched on an alternate port without editing this file.
    port: Number(process.env.PORT) || 5173,
    host: true,
  },
});
