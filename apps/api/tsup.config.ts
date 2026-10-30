import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts", migrate: "src/migrate.ts", seed: "src/seed/index.ts" },
  format: "esm",
  target: "node20",
  clean: true,
  // El paquete compartido es TypeScript sin compilar: se empaqueta dentro de la API.
  noExternal: ["@tcu/shared"],
});
