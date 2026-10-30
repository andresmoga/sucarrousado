import { z } from "zod";

/** Placas colombianas de carro particular: 3 letras + 3 números (ej. ABC123). */
export const plateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => /^[A-Z]{3}\d{3}$/.test(s), "Placa inválida (formato ABC123)");

/** Calificación de 1 (malo) a 5 (excelente) que el vendedor declara por atributo. */
const rating = z.number().int().min(1).max(5);

export const conditionInputSchema = z.object({
  paint: rating,
  interior: rating,
  mechanics: rating,
  tires: rating,
  /** Historial: siniestros reportados al seguro. */
  claims: z.enum(["ninguno", "menor", "mayor"]).default("ninguno"),
  /** SOAT, revisión técnico-mecánica e impuestos al día. */
  docsUpToDate: z.boolean().default(true),
});
export type ConditionInput = z.infer<typeof conditionInputSchema>;

export const valuationRequestSchema = z.object({
  plate: plateSchema,
  km: z.number().int().min(0).max(1_500_000),
  city: z.string().trim().min(2).max(60),
  condition: conditionInputSchema,
  email: z.string().email().optional(),
});
export type ValuationRequest = z.infer<typeof valuationRequestSchema>;

export const evidenceLevel = z.enum(["declarado", "fotos_ia", "inspeccion"]);
export type EvidenceLevel = z.infer<typeof evidenceLevel>;

export const vehicleInfoSchema = z.object({
  brand: z.string(),
  line: z.string(),
  version: z.string().optional(),
  modelYear: z.number().int(),
  fuel: z.string().optional(),
  fasecoldaCode: z.string().optional(),
  fasecoldaValue: z.number().int().positive(),
});
export type VehicleInfo = z.infer<typeof vehicleInfoSchema>;

/**
 * Datos del carro escritos por el vendedor cuando la placa no aparece en el RUNT/Fasecolda.
 * Sin valor Fasecolda: el precio justo sale solo del mercado (si hay avisos comparables).
 */
export const manualVehicleSchema = z.object({
  brand: z.string().trim().min(2, "Escriba la marca").max(40),
  line: z.string().trim().min(1, "Escriba la línea").max(60),
  version: z.string().trim().max(80).optional().transform((s) => s || undefined),
  modelYear: z.number({ invalid_type_error: "Escriba el año modelo" }).int().min(1960, "Año modelo desde 1960").max(new Date().getFullYear() + 1, "Año modelo inválido"),
  fuel: z.string().trim().max(30).optional(),
});
export type ManualVehicle = z.infer<typeof manualVehicleSchema>;

/** Carro del borrador: el de la placa (con Fasecolda) o el que escribió el vendedor (sin Fasecolda). */
export type DraftVehicle = Omit<VehicleInfo, "fasecoldaValue"> & { fasecoldaValue: number | null; source: "placa" | "manual" };

export const adjustmentSchema = z.object({
  key: z.enum(["km", "condicion", "region", "mercado"]),
  label: z.string(),
  pct: z.number(),
});
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const valuationResultSchema = z.object({
  vehicle: vehicleInfoSchema,
  fasecoldaValue: z.number().int(),
  marketMedian: z.number().int().nullable(),
  comparables: z.number().int(),
  conditionScore: z.number().int().min(0).max(100),
  evidence: evidenceLevel,
  low: z.number().int(),
  mid: z.number().int(),
  high: z.number().int(),
  adjustments: z.array(adjustmentSchema),
  modelVersion: z.string(),
});
export type ValuationResult = z.infer<typeof valuationResultSchema>;

export const waitlistSchema = z.object({
  email: z.string().email(),
  valuationId: z.string().uuid().optional(),
});
