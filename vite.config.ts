import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 43173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:43174",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 43173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:43174",
        changeOrigin: true,
      },
    },
  },
});
