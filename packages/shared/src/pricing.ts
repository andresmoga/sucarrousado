import { departmentOf } from "./catalog";
import type { Adjustment, ConditionInput, EvidenceLevel } from "./schemas";

/**
 * Motor "Precio Justo" v0 (reglas). Ver el documento de modelo de negocio:
 *   P = (wF·Fasecolda + wM·medianaMercado) · (1+A_km) · (1+A_condición) · (1+A_región)
 * Todos los pesos y topes son supuestos iniciales para calibrar con ventas reales.
 */
export const PRICING_MODEL_VERSION = "reglas-v0.1";

export const PRICING_CONFIG = {
  /** Avisos comparables necesarios para darle al mercado su peso máximo. */
  fullMarketComparables: 8,
  /** Peso máximo del mercado frente a Fasecolda. */
  maxMarketWeight: 0.6,
  /** Kilómetros por año que se consideran "normales" en Colombia (supuesto). */
  expectedKmPerYear: 15_000,
  /** -0,5 % por cada 5.000 km sobre lo esperado (y + por debajo), con tope ±8 %. */
  kmStep: 5_000,
  kmPctPerStep: 0.005,
  kmCap: 0.08,
  /** Puntaje 75 = neutro; 100 → +5 %, 50 → -5 %. Tope ±12 %. */
  neutralScore: 75,
  conditionPctPerPoint: 0.002,
  conditionCap: 0.12,
  /** Ajuste por departamento (supuesto, por calibrar). Bogotá y la Sabana = base. Sin dato = 0. */
  regionPct: {
    bogotadc: 0,
    cundinamarca: 0,
    antioquia: 0.01,
    valledelcauca: -0.01,
    atlantico: -0.015,
    santander: -0.01,
    bolivar: -0.015,
    boyaca: -0.02,
  } as Record<string, number>,
  /** Ancho del rango ±; se amplía si hay pocos comparables o evidencia débil. */
  baseSpread: 0.04,
  thinMarketSpread: 0.03,
  declaredOnlySpread: 0.02,
  /** Sin Fasecolda: avisos comparables mínimos para dar un rango, y cuánto se amplía. */
  marketOnlyMinComparables: 3,
  marketOnlySpread: 0.04,
};

/** Pesos del puntaje de condición (suman 1). */
export const CONDITION_WEIGHTS = {
  paint: 0.25,
  mechanics: 0.25,
  interior: 0.15,
  tires: 0.1,
  history: 0.15,
  docs: 0.1,
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const roundTo = (x: number, step = 100_000) => Math.round(x / step) * step;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Quita atípicos con el rango intercuartílico (1,5·IQR). Con menos de 4 datos no filtra. */
export function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.floor(p * (s.length - 1))]!;
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  return s.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
}

export type ConditionBreakdown = Record<keyof typeof CONDITION_WEIGHTS, number>;

/** Cada atributo de la condición llevado a 0–100. */
export function conditionBreakdown(c: ConditionInput): ConditionBreakdown {
  const r = (x: number) => Math.round(((x - 1) / 4) * 100); // 1..5 → 0..100
  return {
    paint: r(c.paint),
    mechanics: r(c.mechanics),
    interior: r(c.interior),
    tires: r(c.tires),
    history: c.claims === "ninguno" ? 100 : c.claims === "menor" ? 60 : 20,
    docs: c.docsUpToDate ? 100 : 40,
  };
}

/** Puntaje de condición 0–100 a partir de lo que declara el vendedor. */
export function conditionScore(c: ConditionInput): number {
  const b = conditionBreakdown(c);
  const w = CONDITION_WEIGHTS;
  const score = (Object.keys(w) as (keyof typeof w)[]).reduce((s, k) => s + w[k] * b[k], 0);
  return Math.round(clamp(score, 0, 100));
}

function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

export interface PricingInput {
  /** null cuando no hay valor Fasecolda (placa no encontrada): el precio sale solo del mercado. */
  fasecoldaValue: number | null;
  /** Precios de avisos comparables (misma línea, ±1 año, ±20.000 km). */
  marketPrices: number[];
  km: number;
  modelYear: number;
  city: string;
  conditionScore: number;
  evidence: EvidenceLevel;
  /** Año de referencia (inyectable para pruebas). */
  currentYear?: number;
}

export interface PricingOutput {
  marketMedian: number | null;
  comparables: number;
  low: number;
  mid: number;
  high: number;
  adjustments: Adjustment[];
}

export function computeFairPrice(input: PricingInput & { fasecoldaValue: number }): PricingOutput;
export function computeFairPrice(input: PricingInput): PricingOutput | null;
export function computeFairPrice(input: PricingInput): PricingOutput | null {
  const cfg = PRICING_CONFIG;
  const adjustments: Adjustment[] = [];

  // 1) Base: mezcla Fasecolda + mercado (o solo mercado si no hay Fasecolda)
  const clean = removeOutliers(input.marketPrices.filter((p) => p > 0));
  const marketMedian = median(clean);
  const n = clean.length;
  const marketOnly = input.fasecoldaValue === null;
  if (marketOnly && (marketMedian === null || n < cfg.marketOnlyMinComparables)) return null;
  const fasecolda = input.fasecoldaValue ?? marketMedian!;
  const wM = marketOnly ? 1 : marketMedian === null ? 0 : cfg.maxMarketWeight * Math.min(1, n / cfg.fullMarketComparables);
  const base = (1 - wM) * fasecolda + wM * (marketMedian ?? 0);
  if (marketOnly) {
    adjustments.push({ key: "mercado", label: `Sin valor Fasecolda: mediana de ${n} avisos comparables`, pct: 0 });
  } else if (marketMedian !== null) {
    adjustments.push({
      key: "mercado",
      label: `Mercado: mediana de ${n} avisos comparables (peso ${Math.round(wM * 100)} %)`,
      pct: base / fasecolda - 1,
    });
  }

  // 2) Kilometraje frente a lo esperado por edad
  const year = input.currentYear ?? new Date().getFullYear();
  const age = Math.max(1, year - input.modelYear);
  const expectedKm = age * cfg.expectedKmPerYear;
  const steps = (input.km - expectedKm) / cfg.kmStep;
  const aKm = clamp(-steps * cfg.kmPctPerStep, -cfg.kmCap, cfg.kmCap);
  if (Math.abs(aKm) >= 0.001) {
    adjustments.push({
      key: "km",
      label:
        aKm < 0
          ? `Kilometraje alto: ${input.km.toLocaleString("es-CO")} km vs. ~${expectedKm.toLocaleString("es-CO")} esperados`
          : `Kilometraje bajo: ${input.km.toLocaleString("es-CO")} km vs. ~${expectedKm.toLocaleString("es-CO")} esperados`,
      pct: aKm,
    });
  }

  // 3) Condición
  const aCond = clamp(
    (input.conditionScore - cfg.neutralScore) * cfg.conditionPctPerPoint,
    -cfg.conditionCap,
    cfg.conditionCap,
  );
  if (Math.abs(aCond) >= 0.001) {
    adjustments.push({
      key: "condicion",
      label: `Condición ${input.conditionScore}/100 (${input.evidence})`,
      pct: aCond,
    });
  }

  // 4) Región
  const dept = departmentOf(input.city);
  const aReg = (dept ? cfg.regionPct[normalizeCity(dept)] : undefined) ?? cfg.regionPct[normalizeCity(input.city)] ?? 0;
  if (aReg !== 0) {
    adjustments.push({ key: "region", label: `Ajuste por región: ${input.city}${dept && dept !== input.city ? ` (${dept})` : ""}`, pct: aReg });
  }

  const mid = base * (1 + aKm) * (1 + aCond) * (1 + aReg);

  // 5) Rango
  let spread = cfg.baseSpread;
  if (n < cfg.fullMarketComparables) spread += cfg.thinMarketSpread;
  if (input.evidence === "declarado") spread += cfg.declaredOnlySpread;
  if (marketOnly) spread += cfg.marketOnlySpread;

  return {
    marketMedian: marketMedian === null ? null : Math.round(marketMedian),
    comparables: n,
    low: roundTo(mid * (1 - spread)),
    mid: roundTo(mid),
    high: roundTo(mid * (1 + spread)),
    adjustments,
  };
}
