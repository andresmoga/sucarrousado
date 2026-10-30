import { createHash } from "node:crypto";
import {
  PRICING_MODEL_VERSION,
  computeFairPrice,
  conditionScore,
  type ManualVehicle,
  type ValuationRequest,
  type ValuationResult,
} from "@tcu/shared";
import type { Queryable } from "../db";
import type { VehicleDataProvider } from "../providers/vehicle-data";

export const hashPlate = (plate: string) =>
  createHash("sha256")
    .update(`${process.env.PLATE_HASH_SALT ?? "dev-salt"}:${plate}`)
    .digest("hex");

/** Avisos activos comparables: misma marca y línea, ±1 año, ±20.000 km. */
export async function findComparablePrices(
  db: Queryable,
  v: { brand: string; line: string; modelYear: number },
  km: number,
): Promise<number[]> {
  const { rows } = await db.query<{ price_cop: string }>(
    `SELECT l.price_cop
       FROM listings l JOIN vehicles ve ON ve.id = l.vehicle_id
      WHERE l.status = 'activo'
        AND lower(ve.brand) = lower($1) AND lower(ve.line) = lower($2)
        AND ve.model_year BETWEEN $3 - 1 AND $3 + 1
        AND l.km BETWEEN $4 - 20000 AND $4 + 20000
      ORDER BY l.created_at DESC
      LIMIT 50`,
    [v.brand, v.line, v.modelYear, km],
  );
  return rows.map((r) => Number(r.price_cop));
}

export class VehicleNotFoundError extends Error {}

export async function valuate(
  db: Queryable,
  provider: VehicleDataProvider,
  req: ValuationRequest,
): Promise<ValuationResult & { id: string }> {
  const vehicle = await provider.lookupByPlate(req.plate);
  if (!vehicle) throw new VehicleNotFoundError(req.plate);

  const marketPrices = await findComparablePrices(db, vehicle, req.km);
  const score = conditionScore(req.condition);
  const evidence = "declarado" as const; // la landing solo tiene autodeclaración
  const price = computeFairPrice({
    fasecoldaValue: vehicle.fasecoldaValue,
    marketPrices,
    km: req.km,
    modelYear: vehicle.modelYear,
    city: req.city,
    conditionScore: score,
    evidence,
  });

  const vehicleRow = await db.query<{ id: string }>(
    `INSERT INTO vehicles (plate_hash, fasecolda_code, brand, line, version, model_year, fuel)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (plate_hash) DO UPDATE SET fasecolda_code = EXCLUDED.fasecolda_code
     RETURNING id`,
    [hashPlate(req.plate), vehicle.fasecoldaCode ?? null, vehicle.brand, vehicle.line, vehicle.version ?? null, vehicle.modelYear, vehicle.fuel ?? null],
  );

  const est = await db.query<{ id: string }>(
    `INSERT INTO price_estimates
       (vehicle_id, km, city, condition_score, fasecolda_value, market_median, comparables, low, mid, high, adjustments, model_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      vehicleRow.rows[0]!.id, req.km, req.city, score, vehicle.fasecoldaValue, price.marketMedian,
      price.comparables, price.low, price.mid, price.high, JSON.stringify(price.adjustments), PRICING_MODEL_VERSION,
    ],
  );

  return {
    id: est.rows[0]!.id,
    vehicle,
    fasecoldaValue: vehicle.fasecoldaValue,
    conditionScore: score,
    evidence,
    modelVersion: PRICING_MODEL_VERSION,
    ...price,
  };
}

export interface ManualEstimate {
  id: string;
  low: number;
  mid: number;
  high: number;
  fasecoldaValue: null;
  comparables: number;
  adjustments: ValuationResult["adjustments"];
}

/**
 * Carro escrito a mano (placa no encontrada): rango solo con avisos comparables. Devuelve null si no hay
 * suficientes comparables; en ese caso el vendedor pone el precio y el aviso sale sin rango.
 */
export async function valuateManual(
  db: Queryable,
  plate: string,
  v: ManualVehicle,
  req: Omit<ValuationRequest, "plate">,
): Promise<ManualEstimate | null> {
  const marketPrices = await findComparablePrices(db, v, req.km);
  const score = conditionScore(req.condition);
  const price = computeFairPrice({
    fasecoldaValue: null, marketPrices, km: req.km, modelYear: v.modelYear, city: req.city, conditionScore: score, evidence: "declarado",
  });
  if (!price) return null;
  const vehicleRow = await db.query<{ id: string }>(
    `INSERT INTO vehicles (plate_hash, brand, line, version, model_year, fuel)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (plate_hash) DO UPDATE SET brand = EXCLUDED.brand, line = EXCLUDED.line, version = EXCLUDED.version,
       model_year = EXCLUDED.model_year, fuel = EXCLUDED.fuel
     RETURNING id`,
    [hashPlate(plate), v.brand, v.line, v.version ?? null, v.modelYear, v.fuel ?? null],
  );
  const est = await db.query<{ id: string }>(
    `INSERT INTO price_estimates
       (vehicle_id, km, city, condition_score, fasecolda_value, market_median, comparables, low, mid, high, adjustments, model_version)
     VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [vehicleRow.rows[0]!.id, req.km, req.city, score, price.marketMedian, price.comparables, price.low, price.mid, price.high,
     JSON.stringify(price.adjustments), PRICING_MODEL_VERSION],
  );
  return { id: est.rows[0]!.id, low: price.low, mid: price.mid, high: price.high, fasecoldaValue: null, comparables: price.comparables, adjustments: price.adjustments };
}
