import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // Persistence and HTTP tests share one Postgres; they must not reset schema in parallel.
    fileParallelism: false,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/auth": "http://127.0.0.1:3000",
      "/month": "http://127.0.0.1:3000",
      "/households": "http://127.0.0.1:3000",
    },
  },
  preview: {
    port: 5173,
    proxy: {
      "/auth": "http://127.0.0.1:3000",
      "/month": "http://127.0.0.1:3000",
      "/households": "http://127.0.0.1:3000",
    },
  },
});
