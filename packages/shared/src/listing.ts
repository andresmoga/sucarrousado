import { z } from "zod";
import { BODY_TYPES, CITIES, COLORS, FEATURES, FUELS, PHOTO_SLOT_KEYS, TRANSMISSIONS, MIN_PHOTOS } from "./catalog";
import { conditionInputSchema, manualVehicleSchema, plateSchema, type Adjustment } from "./schemas";

// ───────────────────────── Cuentas ─────────────────────────

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Escriba su nombre").max(80),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(100),
  whatsapp: z
    .string()
    .trim()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => /^3\d{9}$/.test(s), "Celular colombiano de 10 dígitos (ej. 3001234567)")
    .optional(),
  /** Autorización de tratamiento de datos y aceptación de términos (Ley 1581 de 2012). Obligatoria. */
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Debe aceptar los términos y autorizar el tratamiento de sus datos" }) }),
  /** Código para publicar durante la beta (opcional). */
  inviteCode: z.string().trim().max(40).optional().transform((s) => s || undefined),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "Escriba su contraseña"),
});

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  kind: "particular" | "profesional";
  whatsapp: string | null;
  /** false durante la beta con código si aún no lo ha ingresado. */
  canPublish: boolean;
  /** ¿Ya dio los datos de vendedor que pide la ley (art. 53, Ley 1480 de 2011)? */
  sellerProfileComplete: boolean;
}

export const DOC_TYPES = { CC: "Cédula de ciudadanía", CE: "Cédula de extranjería", NIT: "NIT", PPT: "Permiso por protección temporal", PAS: "Pasaporte" } as const;

/** Datos del vendedor (no se muestran en el aviso; la ley exige pedirlos a quien publica). */
export const sellerProfileSchema = z.object({
  docType: z.enum(Object.keys(DOC_TYPES) as [keyof typeof DOC_TYPES, ...(keyof typeof DOC_TYPES)[]]),
  docNumber: z.string().trim().regex(/^[0-9A-Za-z.-]{4,20}$/, "Número de documento inválido"),
  address: z.string().trim().min(6, "Escriba la dirección").max(120),
  city: z.enum(CITIES, { errorMap: () => ({ message: "Elija el municipio" }) }),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => /^\d{7,10}$/.test(s), "Teléfono de 7 a 10 dígitos"),
});
export type SellerProfile = z.infer<typeof sellerProfileSchema>;

// ───────────────────────── Publicar ─────────────────────────

export const photoRefSchema = z.object({
  url: z.string().regex(/^\/uploads\/[\w./-]+$/, "Foto inválida"),
  slot: z.enum(PHOTO_SLOT_KEYS),
});

export const listingCreateSchema = z.object({
  plate: plateSchema,
  km: z.number().int().min(0).max(1_500_000),
  city: z.enum(CITIES),
  priceCop: z.number().int().min(5_000_000, "Precio mínimo $5.000.000").max(5_000_000_000),
  title: z.string().trim().min(10, "Mínimo 10 caracteres").max(90),
  description: z.string().trim().min(40, "Cuente un poco más (mínimo 40 caracteres)").max(4000),
  condition: conditionInputSchema,
  color: z.enum(COLORS),
  transmission: z.enum(TRANSMISSIONS),
  bodyType: z.enum(BODY_TYPES),
  doors: z.number().int().min(2).max(5),
  armored: z.boolean().default(false),
  features: z.array(z.enum(FEATURES)).max(FEATURES.length).default([]),
  photos: z.array(photoRefSchema).min(MIN_PHOTOS, `Suba al menos ${MIN_PHOTOS} fotos`).max(12),
  /** Tasación hecha en el paso de precio; queda ligada al aviso. */
  estimateId: z.string().uuid().optional(),
  /** Carro escrito a mano cuando la placa no aparece en el RUNT/Fasecolda. */
  vehicle: manualVehicleSchema.optional(),
});
export type ListingCreateInput = z.infer<typeof listingCreateSchema>;

export const listingUpdateSchema = z
  .object({
    priceCop: z.number().int().min(5_000_000).max(5_000_000_000).optional(),
    description: z.string().trim().min(40).max(4000).optional(),
    status: z.enum(["activo", "pausado", "vendido"]).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nada que actualizar");

export const draftRequestSchema = z.object({
  plate: plateSchema,
  km: z.number().int().min(0),
  city: z.string(),
  color: z.string().optional(),
  transmission: z.string().optional(),
  condition: conditionInputSchema,
  features: z.array(z.string()).default([]),
});

// ───────────────────────── Buscar ─────────────────────────

const optInt = z.coerce.number().int().nonnegative().optional();
const optStr = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((s) => (s ? s : undefined));

export const SORTS = {
  recientes: "Más recientes",
  precio_asc: "Menor precio",
  precio_desc: "Mayor precio",
  km_asc: "Menor kilometraje",
  modelo_desc: "Modelo más nuevo",
} as const;
export type Sort = keyof typeof SORTS;

export const listingSearchSchema = z.object({
  q: optStr,
  brand: optStr,
  line: optStr,
  city: optStr,
  fuel: z.enum(FUELS).optional(),
  transmission: z.enum(TRANSMISSIONS).optional(),
  bodyType: z.enum(BODY_TYPES).optional(),
  seller: z.enum(["particular", "profesional"]).optional(),
  /** "bajo": precio por debajo del rango justo; "en_rango": dentro del rango. */
  fair: z.enum(["bajo", "en_rango"]).optional(),
  yearMin: optInt,
  yearMax: optInt,
  priceMin: optInt,
  priceMax: optInt,
  kmMax: optInt,
  sort: z.enum(Object.keys(SORTS) as [Sort, ...Sort[]]).default("recientes"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type ListingSearch = z.infer<typeof listingSearchSchema>;
export type ListingSearchInput = z.input<typeof listingSearchSchema>;

// ───────────────────────── Respuestas ─────────────────────────

export type FairPosition = "bajo" | "en_rango" | "alto";

export function fairPosition(price: number, low: number, high: number): FairPosition {
  if (price < low) return "bajo";
  if (price > high) return "alto";
  return "en_rango";
}

export interface FairRange {
  low: number;
  mid: number;
  high: number;
}

export interface ListingCard {
  id: string;
  title: string;
  priceCop: number;
  km: number;
  city: string;
  brand: string;
  line: string;
  modelYear: number;
  fuel: string | null;
  transmission: string | null;
  sellerKind: "particular" | "profesional";
  cover: string | null;
  fair: FairRange | null;
  conditionScore: number | null;
  createdAt: string;
}

export interface Facet {
  value: string;
  count: number;
}

export interface SearchResponse {
  items: ListingCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: { brand: Facet[]; city: Facet[]; fuel: Facet[] };
}

export interface ListingDetail extends ListingCard {
  version: string | null;
  description: string;
  color: string | null;
  bodyType: string | null;
  doors: number | null;
  armored: boolean;
  features: string[];
  status: "borrador" | "activo" | "pausado" | "vendido" | "vencido";
  views: number;
  expiresAt: string | null;
  photos: { url: string; slot: string }[];
  condition: {
    score: number;
    evidence: "declarado" | "fotos_ia" | "inspeccion";
    paint: number;
    mechanics: number;
    interior: number;
    tires: number;
    history: number;
    docs: number;
  } | null;
  estimate: (FairRange & {
    /** null: la placa no se encontró y el rango salió solo del mercado. */
    fasecoldaValue: number | null;
    comparables: number;
    adjustments: Adjustment[];
    modelVersion: string;
    createdAt: string;
  }) | null;
  seller: {
    id: string;
    name: string;
    kind: "particular" | "profesional";
    since: string;
    whatsapp: string | null;
    activeListings: number;
  };
  questions: { id: string; body: string; answer: string | null; createdAt: string; answeredAt: string | null }[];
  isFavorite: boolean;
  isOwner: boolean;
}

export interface MyListing extends ListingCard {
  status: ListingDetail["status"];
  views: number;
  pendingQuestions: number;
  expiresAt: string | null;
}
