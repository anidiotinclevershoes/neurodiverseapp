import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
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
