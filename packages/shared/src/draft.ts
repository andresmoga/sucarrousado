import { z } from "zod";
import { BODY_TYPES, CITIES, COLORS, FEATURES, PHOTO_SLOTS, PHOTO_SLOT_KEYS, TRANSMISSIONS, type BodyType, type Feature, type PhotoSlot } from "./catalog";
import { fairPosition } from "./listing";
import { conditionInputSchema, manualVehicleSchema, plateSchema, type Adjustment, type ConditionInput, type DraftVehicle } from "./schemas";

// ───────────────────────── Calidad de fotos ─────────────────────────

/** Medidas mínimas para que una foto se vea bien en el aviso y en el video. */
export const PHOTO_MIN_WIDTH = 1024;
export const PHOTO_MIN_HEIGHT = 683;
/** Fotos que sugerimos subir, además de las obligatorias. */
export const SUGGESTED_PHOTOS = 8;

export const PHOTO_ISSUES = {
  baja_resolucion: "Resolución baja: tómela de nuevo con la cámara principal",
  oscura: "Muy oscura: tómela de día o con buena luz",
  sobreexpuesta: "Muy clara: evite el sol de frente",
  borrosa: "Se ve movida o borrosa",
  vertical: "Está vertical: gire el celular para fotos del carro",
  duplicada: "Es casi igual a otra foto",
  placa_visible: "Se ve la placa: tápela o recorte la foto",
  no_es_carro: "No parece una foto del carro",
  angulo_incorrecto: "No corresponde al ángulo elegido",
} as const;
export type PhotoIssue = keyof typeof PHOTO_ISSUES;

export interface PhotoQuality {
  width: number;
  height: number;
  /** Brillo medio 0–255. */
  brightness: number;
  /** Nitidez: dispersión del filtro laplaciano (más alto = más nítida). */
  sharpness: number;
  /** Huella perceptual de 64 bits en hex, para detectar fotos repetidas. */
  hash: string;
  issues: PhotoIssue[];
}

/** Reglas sin IA a partir de las medidas de la foto. */
export function photoIssuesFromMetrics(q: Omit<PhotoQuality, "issues" | "hash">): PhotoIssue[] {
  const issues: PhotoIssue[] = [];
  const long = Math.max(q.width, q.height);
  const short = Math.min(q.width, q.height);
  if (long < PHOTO_MIN_WIDTH || short < PHOTO_MIN_HEIGHT) issues.push("baja_resolucion");
  if (q.brightness < 55) issues.push("oscura");
  if (q.brightness > 225) issues.push("sobreexpuesta");
  if (q.sharpness < 6) issues.push("borrosa");
  if (q.height > q.width * 1.05) issues.push("vertical");
  return issues;
}

/** Distancia de Hamming entre dos huellas hex de 64 bits. */
export function hashDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

// ───────────────────────── Borrador ─────────────────────────

export interface DraftPhoto {
  url: string;
  slot: PhotoSlot | null;
  quality: PhotoQuality;
  /** Problemas que vio la IA (placa visible, no es un carro…). */
  aiIssues: PhotoIssue[];
  /** Ángulo que la IA ve en la foto (null: no es ninguno de los ángulos guiados). */
  aiSlot?: PhotoSlot | null;
  /** true cuando la IA revisó esta foto; sin IA el ángulo no se puede verificar. */
  aiChecked?: boolean;
  /** El vendedor confirmó que la foto sí es del ángulo elegido, aunque la IA dijera otra cosa. */
  slotConfirmed?: boolean;
}

/** Los detalles aceptan cualquier foto; el resto debe ser el ángulo que la IA ve. */
export function slotMismatch(p: Pick<DraftPhoto, "slot" | "aiSlot" | "aiChecked" | "slotConfirmed">): boolean {
  if (!p.aiChecked || !p.slot || p.slotConfirmed) return false;
  if (p.slot === "detalle_1" || p.slot === "detalle_2") return false;
  return p.aiSlot !== p.slot;
}

/** Todos los problemas de una foto: medidas, lo que vio la IA y si no coincide con su ángulo. */
export function photoIssues(p: DraftPhoto): PhotoIssue[] {
  const all = new Set<PhotoIssue>([...p.quality.issues, ...p.aiIssues]);
  if (slotMismatch(p)) all.add("angulo_incorrecto");
  return [...all];
}

/** Ángulos obligatorios que aún no tienen una foto válida (asignada y, si hay IA, verificada). */
export function missingRequiredSlots(photos: DraftPhoto[]): PhotoSlot[] {
  return PHOTO_SLOTS.filter((s) => s.required && !photos.some((p) => p.slot === s.key && !slotMismatch(p) && !p.aiIssues.includes("no_es_carro"))).map((s) => s.key);
}

export interface Recognition {
  brand: string | null;
  line: string | null;
  versionGuess: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  bodyType: BodyType | null;
  color: (typeof COLORS)[number] | null;
  features: Feature[];
  /** 0 a 1. */
  confidence: number;
  /** "ia" = lo vio el modelo; "demo" = la IA no está configurada. */
  source: "ia" | "demo";
  notes: string | null;
}

export interface DraftDetails {
  color: (typeof COLORS)[number];
  transmission: (typeof TRANSMISSIONS)[number];
  bodyType: BodyType;
  doors: number;
  armored: boolean;
  features: Feature[];
  condition: ConditionInput;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface DraftData {
  step: "fotos" | "confirmar" | "editar" | "publicado";
  photos: DraftPhoto[];
  recognition: Recognition | null;
  plate: string | null;
  km: number | null;
  city: (typeof CITIES)[number] | null;
  vehicle: DraftVehicle | null;
  /** ¿Lo que dice la placa coincide con lo que vio la IA en las fotos? */
  match: "coincide" | "diferente" | "sin_dato" | null;
  details: DraftDetails | null;
  listing: { title: string; description: string; priceCop: number } | null;
  valuation: {
    id: string;
    low: number;
    mid: number;
    high: number;
    /** null cuando la placa no se encontró y el precio salió solo del mercado. */
    fasecoldaValue: number | null;
    comparables: number;
    adjustments: Adjustment[];
  } | null;
  chat: ChatMessage[];
  listingId: string | null;
  /** Momento en que empezó, para mostrar cuánto tardó. */
  startedAt: string;
}

export interface Draft {
  id: string;
  data: DraftData;
  quality: QualityReport;
  aiEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────── Solicitudes ─────────────────────────

const uploadUrl = z.string().regex(/^\/uploads\/[\w./-]+$/);

export const draftCreateSchema = z.object({
  photos: z.array(uploadUrl).min(1, "Suba al menos una foto").max(12),
});

export const draftPhotosSchema = z.object({
  photos: z
    .array(z.object({ url: uploadUrl, slot: z.enum(PHOTO_SLOT_KEYS).nullable(), slotConfirmed: z.boolean().optional() }))
    .min(1)
    .max(12),
});

export const draftConfirmSchema = z.object({
  plate: plateSchema,
  /** Solo si la placa no aparece: el vendedor escribe el carro. */
  vehicle: manualVehicleSchema.optional(),
  km: z.number().int().min(0).max(1_500_000),
  city: z.enum(CITIES),
  details: z.object({
    color: z.enum(COLORS),
    transmission: z.enum(TRANSMISSIONS),
    bodyType: z.enum(BODY_TYPES),
    doors: z.number().int().min(2).max(5),
    armored: z.boolean().default(false),
    features: z.array(z.enum(FEATURES)).default([]),
    condition: conditionInputSchema,
  }),
});
export type DraftConfirmInput = z.infer<typeof draftConfirmSchema>;

export const draftListingPatchSchema = z
  .object({
    title: z.string().trim().min(10).max(90).optional(),
    description: z.string().trim().min(40).max(4000).optional(),
    priceCop: z.number().int().min(5_000_000).max(5_000_000_000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nada que cambiar");

export const draftChatSchema = z.object({ message: z.string().trim().min(1).max(600) });

// ───────────────────────── Recomendaciones y calidad ─────────────────────────

export interface QualityItem {
  level: "importante" | "sugerencia" | "bien";
  text: string;
}
export interface QualityReport {
  score: number;
  items: QualityItem[];
}

const slotLabel = (k: PhotoSlot) => PHOTO_SLOTS.find((s) => s.key === k)!.label.toLowerCase();

/** Revisión del aviso con reglas claras; igual en la web y en la API. */
export function buildQualityReport(d: DraftData): QualityReport {
  const items: QualityItem[] = [];
  let score = 100;
  const bad = (text: string, cost: number) => {
    items.push({ level: "importante", text });
    score -= cost;
  };
  const tip = (text: string, cost: number) => {
    items.push({ level: "sugerencia", text });
    score -= cost;
  };

  // Fotos
  const slots = new Set(d.photos.filter((p) => !slotMismatch(p)).map((p) => p.slot).filter(Boolean));
  const missingRequired = missingRequiredSlots(d.photos);
  if (missingRequired.length) bad(`Faltan fotos obligatorias: ${missingRequired.map((k) => slotLabel(k)).join(", ")}.`, 8 * missingRequired.length);
  if (!slots.has("tablero")) tip("Agregue una foto del tablero con el kilometraje: genera confianza.", 4);
  if (!slots.has("sillas_delanteras") && !slots.has("sillas_traseras")) tip("Agregue una foto de las sillas o la cojinería.", 3);
  if (d.photos.length < SUGGESTED_PHOTOS) tip(`Suba al menos ${SUGGESTED_PHOTOS} fotos; lleva ${d.photos.length}.`, 4);

  const withIssues = d.photos.filter((p) => photoIssues(p).length);
  for (const p of withIssues) {
    const all = photoIssues(p);
    const name = p.slot ? `La foto “${slotLabel(p.slot)}”` : `La foto ${d.photos.indexOf(p) + 1}`;
    const grave = all.some((i) => i === "placa_visible" || i === "no_es_carro" || i === "baja_resolucion" || i === "angulo_incorrecto");
    (grave ? bad : tip)(`${name}: ${all.map((i) => PHOTO_ISSUES[i].charAt(0).toLowerCase() + PHOTO_ISSUES[i].slice(1)).join("; ")}.`, grave ? 6 : 3);
  }

  // Coincidencia placa ↔ fotos
  if (d.match === "diferente") bad("La placa no coincide con el carro de las fotos. Revise la placa o las fotos.", 15);

  // Texto y precio
  if (d.listing) {
    if (d.listing.priceCop < 5_000_000) bad("Escriba el precio del carro (desde $5.000.000).", 10);
    if (d.listing.description.length < 300) tip("Amplíe la descripción: cuente mantenimientos, dueños y por qué vende.", 5);
    if (d.valuation) {
      const pos = fairPosition(d.listing.priceCop, d.valuation.low, d.valuation.high);
      if (pos === "alto") tip("El precio está por encima del rango justo; los compradores lo verán marcado.", 6);
      if (pos === "bajo") items.push({ level: "bien", text: "Precio por debajo del rango justo: aparecerá en “Por debajo del precio justo”." });
      if (pos === "en_rango") items.push({ level: "bien", text: "Precio dentro del rango justo." });
    }
  }
  if (d.details) {
    if (!d.details.features.length) tip("Marque el equipamiento del carro; ayuda en las búsquedas.", 3);
    if (!d.details.condition.docsUpToDate) bad("Tiene papeles pendientes: póngalos al día antes de vender o dígalo en el aviso.", 5);
  }
  if (d.photos.length >= SUGGESTED_PHOTOS && !withIssues.length) items.push({ level: "bien", text: "Fotos completas y de buena calidad." });

  const order = { importante: 0, sugerencia: 1, bien: 2 } as const;
  items.sort((a, b) => order[a.level] - order[b.level]);
  return { score: Math.max(0, Math.min(100, Math.round(score))), items };
}
