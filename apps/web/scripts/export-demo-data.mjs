/**
 * Exporta los avisos de demostración (los de la semilla) desde una API local a un JSON que usa
 * la versión de demostración que corre solo en el navegador. Las fotos SVG van incrustadas.
 *   API_URL=http://localhost:4000 UPLOAD_DIR=../api/uploads node scripts/export-demo-data.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API = process.env.API_URL ?? "http://localhost:4000";
const UPLOADS = process.env.UPLOAD_DIR ?? "../api/uploads";

const res = await fetch(`${API}/api/listings?pageSize=48&sort=recientes`).then((r) => r.json());
const out = [];
for (const card of res.items) {
  const d = await fetch(`${API}/api/listings/${card.id}`).then((r) => r.json());
  if (!d.photos.length || !d.photos.every((p) => p.url.startsWith("/uploads/demo/"))) continue;
  d.photos = await Promise.all(
    d.photos.map(async (p) => {
      const svg = await readFile(join(UPLOADS, p.url.replace("/uploads/", "")), "utf8");
      return { ...p, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
    }),
  );
  d.cover = d.photos[0]?.url ?? null;
  d.seller.whatsapp = null; // en la demo no se escribe a números reales
  d.isFavorite = false;
  d.isOwner = false;
  out.push(d);
}
await writeFile("src/demo/data.json", JSON.stringify(out));
console.log(`✔ ${out.length} avisos exportados a src/demo/data.json`);
