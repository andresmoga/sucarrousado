import { buildApp } from "./app";
import { productionProblems } from "./config";

// En producción no arranca a medias: dice exactamente qué variable falta.
const problems = productionProblems();
if (problems.length) {
  console.error("Faltan variables para producción:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}

import { pool } from "./db";
import { createVehicleDataProvider } from "./providers/vehicle-data";

const app = await buildApp({ db: pool, provider: createVehicleDataProvider() });
const port = Number(process.env.PORT ?? 4000);

await app.listen({ port, host: "0.0.0.0" });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
