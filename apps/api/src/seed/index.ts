/**
 * Llena la base con avisos de demostración. Valores ilustrativos: NO son de Fasecolda.
 *   pnpm --filter @tcu/api seed           (solo si no hay avisos)
 *   pnpm --filter @tcu/api seed --reset   (borra avisos y usuarios de demo y vuelve a sembrar)
 */
import {
  FEATURES,
  PRICING_MODEL_VERSION,
  computeFairPrice,
  conditionBreakdown,
  conditionScore,
  type ConditionInput,
} from "@tcu/shared";
import { pool } from "../db";
import { hashPassword } from "../services/auth";
import { storage } from "../services/storage";
import { demoPhotos } from "./photos";

// Generador pseudoaleatorio con semilla: la demo sale igual cada vez.
let s = 20261027;
const rand = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const between = (a: number, b: number) => a + rand() * (b - a);

interface Model {
  brand: string; line: string; version: string; year: number; fuel: string;
  transmission: string; body: string; doors: number; value: number;
}

const MODELS: Model[] = [
  { brand: "Mazda", line: "3", version: "Grand Touring LX 2.5", year: 2021, fuel: "Gasolina", transmission: "Automática", body: "Sedán", doors: 4, value: 86_500_000 },
  { brand: "Mazda", line: "CX-30", version: "Touring 2.0", year: 2022, fuel: "Gasolina", transmission: "Automática", body: "SUV", doors: 5, value: 104_000_000 },
  { brand: "Mazda", line: "2", version: "Touring 1.5", year: 2020, fuel: "Gasolina", transmission: "Mecánica", body: "Hatchback", doors: 5, value: 56_000_000 },
  { brand: "Renault", line: "Duster", version: "Intens 1.3T CVT", year: 2022, fuel: "Gasolina", transmission: "Automática", body: "SUV", doors: 5, value: 74_000_000 },
  { brand: "Renault", line: "Logan", version: "Life+ 1.6", year: 2021, fuel: "Gasolina", transmission: "Mecánica", body: "Sedán", doors: 4, value: 44_000_000 },
  { brand: "Chevrolet", line: "Onix", version: "Premier 1.0T", year: 2022, fuel: "Gasolina", transmission: "Automática", body: "Sedán", doors: 4, value: 63_000_000 },
  { brand: "Chevrolet", line: "Tracker", version: "LTZ 1.2T", year: 2021, fuel: "Gasolina", transmission: "Automática", body: "SUV", doors: 5, value: 78_000_000 },
  { brand: "Kia", line: "Sportage", version: "Vibrant 2.0", year: 2021, fuel: "Gasolina", transmission: "Automática", body: "SUV", doors: 5, value: 98_000_000 },
  { brand: "Kia", line: "Picanto", version: "Vibrant 1.25", year: 2022, fuel: "Gasolina", transmission: "Mecánica", body: "Hatchback", doors: 5, value: 49_000_000 },
  { brand: "Toyota", line: "Corolla Cross", version: "1.8 HEV XEI", year: 2023, fuel: "Híbrido", transmission: "Automática", body: "SUV", doors: 5, value: 118_000_000 },
  { brand: "Toyota", line: "Hilux", version: "2.4 4x4 Diésel", year: 2020, fuel: "Diésel", transmission: "Mecánica", body: "Pick-up", doors: 4, value: 138_000_000 },
  { brand: "Volkswagen", line: "T-Cross", version: "Comfortline 1.6", year: 2021, fuel: "Gasolina", transmission: "Automática", body: "SUV", doors: 5, value: 84_000_000 },
  { brand: "BMW", line: "Serie 3", version: "320i Sport Line", year: 2020, fuel: "Gasolina", transmission: "Automática", body: "Sedán", doors: 4, value: 128_000_000 },
  { brand: "BMW", line: "X1", version: "sDrive20i", year: 2021, fuel: "Gasolina", transmission: "Automática", body: "SUV", doors: 5, value: 142_000_000 },
  { brand: "Audi", line: "Q3", version: "35 TFSI Advanced", year: 2021, fuel: "Gasolina", transmission: "Automática", body: "SUV", doors: 5, value: 139_000_000 },
  { brand: "Audi", line: "A3", version: "Sportback 35 TFSI", year: 2020, fuel: "Gasolina", transmission: "Automática", body: "Hatchback", doors: 5, value: 104_000_000 },
  { brand: "Mercedes-Benz", line: "GLA", version: "GLA 200 Progressive", year: 2022, fuel: "Gasolina", transmission: "Automática", body: "SUV", doors: 5, value: 158_000_000 },
  { brand: "Mercedes-Benz", line: "Clase C", version: "C 200 Avantgarde", year: 2019, fuel: "Gasolina", transmission: "Automática", body: "Sedán", doors: 4, value: 128_000_000 },
  { brand: "Volvo", line: "XC40", version: "B4 Momentum", year: 2022, fuel: "Híbrido", transmission: "Automática", body: "SUV", doors: 5, value: 162_000_000 },
  { brand: "BYD", line: "Dolphin", version: "Mini GL", year: 2024, fuel: "Eléctrico", transmission: "Automática", body: "Hatchback", doors: 5, value: 68_000_000 },
  { brand: "Ford", line: "Mustang", version: "GT 5.0", year: 2019, fuel: "Gasolina", transmission: "Automática", body: "Coupé", doors: 2, value: 215_000_000 },
  { brand: "Renault", line: "Kangoo", version: "Zen 1.6", year: 2020, fuel: "Gasolina", transmission: "Mecánica", body: "Van", doors: 5, value: 52_000_000 },
];

const CITY_WEIGHTED = ["Bogotá", "Bogotá", "Bogotá", "Bogotá", "Medellín", "Medellín", "Cali", "Barranquilla", "Bucaramanga", "Tunja", "Pereira", "Cartagena"];
const COLORS = ["Blanco", "Blanco", "Gris", "Gris", "Plata", "Negro", "Negro", "Rojo", "Azul", "Verde", "Beige"];

const PARTICULARES = [
  ["Laura Gómez", "3001112233"], ["Andrés Pardo", "3014445566"], ["Camila Restrepo", "3107778899"],
  ["Julián Herrera", "3152223344"], ["Natalia Ríos", "3165556677"], ["Felipe Castaño", "3178889900"],
  ["Diana Moreno", "3183334455"], ["Sergio Vargas", "3196667788"], ["Paola Méndez", "3201234567"],
  ["Mauricio Torres", "3209876543"], ["Carolina Suárez", "3112345678"], ["Ricardo Peña", "3123456789"],
  ["Valentina Ortiz", "3134567890"], ["Jorge Salazar", "3145678901"],
];
const PROFESIONALES = [["Autos La 80", "3017654321"], ["Usados Premium Chicó", "3027654321"]];

const QUESTIONS = [
  ["¿Tiene todos los mantenimientos en concesionario?", "Sí, todos en concesionario. Le muestro las facturas en la visita."],
  ["¿Recibe carro en parte de pago?", "Por ahora solo venta directa, gracias."],
  ["¿El precio es negociable?", null],
  ["¿Cuántos dueños ha tenido?", "Soy el segundo dueño."],
] as const;

const rating = (lo: number) => Math.min(5, Math.max(1, Math.round(between(lo, 5.4))));

async function main() {
  // Los avisos de demostración nunca van a producción (modo beta = sitio sin avisos de ejemplo).
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("La semilla de demostración no se carga en producción. Use una base de desarrollo.");
  }
  const reset = process.argv.includes("--reset");
  const { rows } = await pool.query<{ n: string }>("SELECT count(*) AS n FROM listings");
  if (Number(rows[0]!.n) > 0 && !reset) {
    console.log("Ya hay avisos; use --reset para volver a sembrar.");
    return;
  }
  if (reset) {
    await pool.query(`DELETE FROM listings WHERE seller_id IN (SELECT id FROM users WHERE email LIKE '%@demo.sucarrousado.com')`);
    await pool.query(`DELETE FROM price_estimates WHERE listing_id IS NULL AND vehicle_id IN (SELECT id FROM vehicles WHERE plate_hash LIKE 'demo-%')`);
    await pool.query(`DELETE FROM vehicles WHERE plate_hash LIKE 'demo-%'`);
    await pool.query(`DELETE FROM users WHERE email LIKE '%@demo.sucarrousado.com'`);
  }

  const password = await hashPassword("demo1234");
  const mkUser = async (name: string, whatsapp: string, kind: "particular" | "profesional", i: number) => {
    const email = `${kind === "particular" ? "vendedor" : "concesionario"}${i}@demo.sucarrousado.com`;
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, name, whatsapp, password_hash, kind, kyc_status, created_at)
       VALUES ($1,$2,$3,$4,$5,'verificado', now() - make_interval(days => $6)) RETURNING id`,
      [email, name, whatsapp, password, kind, Math.floor(between(30, 900))],
    );
    return r.rows[0]!.id;
  };
  const particulares = await Promise.all(PARTICULARES.map(([n, w], i) => mkUser(n!, w!, "particular", i + 1)));
  const profesionales = await Promise.all(PROFESIONALES.map(([n, w], i) => mkUser(n!, w!, "profesional", i + 1)));
  const buyer = await mkUser("Comprador Demo", "3000000000", "particular", 99);


  const TOTAL = 34;
  let created = 0;
  for (let i = 0; i < TOTAL; i++) {
    const m = MODELS[i % MODELS.length]!;
    const year = m.year - (i >= MODELS.length && rand() < 0.5 ? 1 : 0);
    const age = Math.max(1, 2026 - year);
    const km = Math.round(between(age * 9_000, age * 21_000) / 500) * 500;
    const city = pick(CITY_WEIGHTED);
    const color = pick(COLORS);
    const cond: ConditionInput = {
      paint: rating(2.6), interior: rating(2.8), mechanics: rating(3), tires: rating(2.4),
      claims: rand() < 0.75 ? "ninguno" : rand() < 0.8 ? "menor" : "mayor",
      docsUpToDate: rand() < 0.9,
    };
    const score = conditionScore(cond);
    const value = Math.round(m.value * (year === m.year ? 1 : 0.92));
    const market = Array.from({ length: Math.floor(between(2, 11)) }, () => Math.round(value * between(0.86, 1.06)));
    const fair = computeFairPrice({ fasecoldaValue: value, marketPrices: market, km, modelYear: year, city, conditionScore: score, evidence: "declarado" });
    // Unos por debajo del rango, la mayoría dentro, unos por encima.
    const price = Math.round((fair.mid * between(0.87, 1.13)) / 100_000) * 100_000;
    const seller = i < particulares.length ? particulares[i]! : pick(profesionales);
    const features = FEATURES.filter(() => rand() < 0.55);
    const createdDaysAgo = Math.floor(between(0, 40));

    const ve = await pool.query<{ id: string }>(
      `INSERT INTO vehicles (plate_hash, fasecolda_code, brand, line, version, model_year, fuel, transmission, body_type, color, doors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [`demo-${i}`, `DEMO-${1000 + i}`, m.brand, m.line, m.version, year, m.fuel, m.transmission, m.body, color, m.doors],
    );
    const est = await pool.query<{ id: string }>(
      `INSERT INTO price_estimates (vehicle_id, km, city, condition_score, fasecolda_value, market_median, comparables, low, mid, high, adjustments, model_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [ve.rows[0]!.id, km, city, score, value, fair.marketMedian, fair.comparables, fair.low, fair.mid, fair.high, JSON.stringify(fair.adjustments), PRICING_MODEL_VERSION],
    );

    const title = `${m.brand} ${m.line} ${m.version} ${year}`;
    const description = [
      `Vendo ${m.brand} ${m.line} ${m.version} modelo ${year}, ${km.toLocaleString("es-CO")} km, color ${color.toLowerCase()}, transmisión ${m.transmission.toLowerCase()}.`,
      cond.claims === "ninguno" ? "Sin siniestros reportados. Mantenimientos al día." : "Tuvo un choque menor, reparado en taller autorizado.",
      features.length ? `Equipamiento: ${features.map((f) => f.toLowerCase()).join(", ")}.` : "",
      `Se puede ver en ${city}.`,
    ].filter(Boolean).join("\n\n");

    const l = await pool.query<{ id: string }>(
      `INSERT INTO listings (seller_id, vehicle_id, title, description, price_cop, km, city, plan, status, expires_at,
                             estimate_id, condition_score, features, views, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'gratis','activo', now() + interval '60 days', $8, $9, $10, $11, now() - make_interval(days => $12))
       RETURNING id`,
      [seller, ve.rows[0]!.id, title, description, price, km, city, est.rows[0]!.id, score, features, Math.floor(between(10, 900)), createdDaysAgo],
    );
    const listingId = l.rows[0]!.id;
    await pool.query("UPDATE price_estimates SET listing_id = $1 WHERE id = $2", [listingId, est.rows[0]!.id]);

    const b = conditionBreakdown(cond);
    await pool.query(
      `INSERT INTO condition_reports (listing_id, score, paint, mechanics, interior, tires, history, docs, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'declarado')`,
      [listingId, score, b.paint, b.mechanics, b.interior, b.tires, b.history, b.docs],
    );

    for (const [pos, [slot, svg]] of demoPhotos(m.body, color, km, i).entries()) {
      const file = `${listingId}-${slot}.svg`;
      await storage().put(`demo/${file}`, Buffer.from(svg), "image/svg+xml");
      await pool.query("INSERT INTO listing_photos (listing_id, url, slot, position) VALUES ($1,$2,$3,$4)", [listingId, `/uploads/demo/${file}`, slot, pos]);
    }

    if (rand() < 0.5) {
      const [q, a] = pick(QUESTIONS);
      await pool.query(
        "INSERT INTO questions (listing_id, asker_id, body, answer, answered_at) VALUES ($1,$2,$3,$4,$5)",
        [listingId, buyer, q, a, a ? new Date() : null],
      );
    }
    created++;
  }
  console.log(`✔ ${created} avisos de demostración. Clave de todos los usuarios demo: demo1234`);
  console.log("  Ejemplos: vendedor1@demo.sucarrousado.com, concesionario1@demo.sucarrousado.com, vendedor99@demo.sucarrousado.com (comprador)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
