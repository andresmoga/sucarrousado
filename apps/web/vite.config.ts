import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// En desarrollo y en preview, /api y /uploads se envían a la API (puerto 4000 por defecto).
const target = process.env.API_PROXY_TARGET ?? "http://localhost:4000";
const proxy = { "/api": target, "/uploads": target };

export default defineConfig({
  // La demostración se sirve desde cualquier carpeta (rutas relativas).
  base: process.env.VITE_DEMO ? "./" : "/",
  // VITE_DEMO=1: un solo HTML autocontenido (para publicarlo como página estática).
  plugins: process.env.VITE_DEMO ? [react(), viteSingleFile()] : [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
