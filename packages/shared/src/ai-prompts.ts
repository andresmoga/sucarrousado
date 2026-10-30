/**
 * Instrucciones y respuestas de la IA, iguales en el servidor (API de Anthropic) y en la demostración
 * del navegador. Aquí vive qué se le pide a Claude y cómo se interpreta lo que responde.
 */
import { z } from "zod";
import { BODY_TYPES, COLORS, FEATURES, PHOTO_SLOT_KEYS, type Feature, type PhotoSlot } from "./catalog";
import type { DraftData, PhotoIssue, Recognition } from "./draft";

export const AI_PHOTO_ISSUES = ["placa_visible", "no_es_carro", "borrosa", "oscura"] as const;

/** Qué es cada ángulo, para que la IA clasifique sin adivinar. */
export const SLOT_GUIDE: Record<PhotoSlot, string> = {
  tres_cuartos: "exterior en diagonal: se ven el frente y un costado a la vez",
  frente: "exterior de frente, de forma recta: capó, farolas y parrilla",
  lateral: "exterior de perfil: un costado completo, de rueda a rueda",
  trasera: "exterior por detrás, de forma recta: stops y baúl cerrado",
  tablero: "interior: tablero o panel de instrumentos con el kilometraje",
  sillas_delanteras: "interior: sillas del conductor y del pasajero",
  sillas_traseras: "interior: silla trasera",
  motor: "capó abierto con el motor a la vista",
  llanta: "primer plano de una llanta y su rin",
  baul: "baúl abierto, por dentro",
  detalle_1: "primer plano de un detalle, rayón o golpe",
  detalle_2: "otro primer plano de un detalle",
};

const guide = () => PHOTO_SLOT_KEYS.map((k) => `- ${k}: ${SLOT_GUIDE[k]}`).join("\n");

/** Busca un valor JSON en la respuesta (el objeto completo o el primero entre llaves). */
export function extractJson(text: string | null | undefined): unknown {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const angle = z
  .string()
  .nullable()
  .optional()
  .transform((a) => ((PHOTO_SLOT_KEYS as readonly string[]).includes(a ?? "") ? (a as PhotoSlot) : null));
const issues = z
  .array(z.string())
  .default([])
  .transform((xs) => xs.filter((x): x is (typeof AI_PHOTO_ISSUES)[number] => (AI_PHOTO_ISSUES as readonly string[]).includes(x)));
const photoSchema = z.object({ n: z.number().int(), angulo: angle, problemas: issues });

// ───────────────────────── Reconocer el carro y cada foto ─────────────────────────

export const RECOGNIZE_SYSTEM =
  "Usted es un perito de carros usados en Colombia. Reconoce marca, línea, rango de años y versión a partir de fotos, " +
  "y dice qué ángulo muestra cada foto. Si no está seguro, baje la confianza y deje null; nunca invente. " +
  "Use los nombres comerciales que se usan en Colombia (por ejemplo Chevrolet, Renault, Mazda, Kia). " +
  "Marque 'placa_visible' si se lee una placa y 'no_es_carro' si la foto no muestra un carro ni una parte de uno.";

export function recognizePrompt(count: number): string {
  return (
    `Hay ${count} fotos, en orden (foto 1, foto 2…). Identifique el carro y diga el ángulo REAL de cada foto, ` +
    "aunque se repita o falte alguno. Ángulos posibles:\n" +
    guide() +
    "\nSi una foto no es ninguno de esos ángulos, ponga null.\nResponda SOLO este JSON:\n" +
    JSON.stringify({
      marca: "string o null", linea: "string o null", version_probable: "string o null",
      anio_desde: "número o null", anio_hasta: "número o null",
      carroceria: `uno de ${BODY_TYPES.join(", ")} o null`, color: `uno de ${COLORS.join(", ")} o null`,
      equipamiento_visible: `lista solo con elementos claramente visibles de: ${FEATURES.join(", ")}`,
      confianza: "0 a 1",
      fotos: [{ n: 1, angulo: "uno de los ángulos de arriba o null", problemas: `lista de: ${AI_PHOTO_ISSUES.join(", ")}` }],
      nota: "una frase en español para el vendedor, o null",
    })
  );
}

const recognitionResponseSchema = z.object({
  marca: z.string().nullable(),
  linea: z.string().nullable(),
  version_probable: z.string().nullable().optional(),
  anio_desde: z.number().int().nullable().optional(),
  anio_hasta: z.number().int().nullable().optional(),
  carroceria: z.enum(BODY_TYPES).nullable().optional().catch(null),
  color: z.enum(COLORS).nullable().optional().catch(null),
  equipamiento_visible: z.array(z.string()).default([]),
  confianza: z.number().min(0).max(1).catch(0.5),
  fotos: z.array(photoSchema).default([]),
  nota: z.string().nullable().optional(),
});

/** Lo que la IA ve en una foto. */
export interface PhotoCheck {
  /** Ángulo que se le asigna (sin repetir los guiados). */
  slot: PhotoSlot | null;
  /** Ángulo que la IA ve, aunque ya esté tomado por otra foto. */
  aiSlot: PhotoSlot | null;
  aiIssues: PhotoIssue[];
  aiChecked: boolean;
}

export interface RecognitionResult {
  recognition: Recognition;
  photos: PhotoCheck[];
}

/** Asigna a cada foto el ángulo que la IA ve, sin repetir; las repetidas quedan sin ángulo para corregir. */
function assignSlots(checks: { aiSlot: PhotoSlot | null; aiIssues: PhotoIssue[] }[], taken: Set<PhotoSlot> = new Set()): PhotoCheck[] {
  return checks.map((c) => {
    let slot = c.aiIssues.includes("no_es_carro") ? null : c.aiSlot;
    if (slot && taken.has(slot)) slot = slot === "detalle_1" && !taken.has("detalle_2") ? "detalle_2" : null;
    if (slot) taken.add(slot);
    return { slot, aiSlot: c.aiSlot, aiIssues: c.aiIssues, aiChecked: true };
  });
}

export function parseRecognition(raw: unknown, count: number): RecognitionResult | null {
  const p = recognitionResponseSchema.safeParse(raw);
  if (!p.success) return null;
  const r = p.data;
  const checks = Array.from({ length: count }, (_, i) => {
    const f = r.fotos.find((x) => x.n === i + 1);
    return { aiSlot: f?.angulo ?? null, aiIssues: (f?.problemas ?? []) as PhotoIssue[] };
  });
  return {
    recognition: {
      brand: r.marca, line: r.linea, versionGuess: r.version_probable ?? null,
      yearFrom: r.anio_desde ?? null, yearTo: r.anio_hasta ?? null,
      bodyType: r.carroceria ?? null, color: r.color ?? null,
      features: r.equipamiento_visible.filter((f): f is Feature => (FEATURES as readonly string[]).includes(f)),
      confidence: r.confianza, source: "ia", notes: r.nota ?? null,
    },
    photos: assignSlots(checks),
  };
}

/** Sin IA: ángulos por orden de llegada, sin verificar. */
export function demoRecognition(count: number, notes = "La IA no está configurada: confirme los datos con la placa y revise el ángulo de cada foto."): RecognitionResult {
  return {
    recognition: {
      brand: null, line: null, versionGuess: null, yearFrom: null, yearTo: null,
      bodyType: null, color: null, features: [], confidence: 0, source: "demo", notes,
    },
    photos: Array.from({ length: count }, (_, i) => ({ slot: PHOTO_SLOT_KEYS[i] ?? null, aiSlot: null, aiIssues: [], aiChecked: false })),
  };
}

// ───────────────────────── Revisar fotos nuevas ─────────────────────────

export const CLASSIFY_SYSTEM =
  "Usted revisa fotos de avisos de carros usados en Colombia. Dice qué ángulo muestra cada foto y si tiene problemas. " +
  "No invente: si no está seguro del ángulo, ponga null.";

export function classifyPrompt(count: number): string {
  return (
    `Hay ${count} foto(s), en orden. Diga el ángulo REAL de cada una. Ángulos posibles:\n` +
    guide() +
    "\nSi no es ninguno, null. Responda SOLO este JSON:\n" +
    JSON.stringify({ fotos: [{ n: 1, angulo: "ángulo o null", problemas: `lista de: ${AI_PHOTO_ISSUES.join(", ")}` }] })
  );
}

/** Resultado por foto nueva; `taken` son los ángulos ya ocupados por las demás fotos. */
export function parseClassification(raw: unknown, count: number, taken: Set<PhotoSlot>): PhotoCheck[] | null {
  const p = z.object({ fotos: z.array(photoSchema).default([]) }).safeParse(raw);
  if (!p.success) return null;
  const checks = Array.from({ length: count }, (_, i) => {
    const f = p.data.fotos.find((x) => x.n === i + 1);
    return { aiSlot: f?.angulo ?? null, aiIssues: (f?.problemas ?? []) as PhotoIssue[] };
  });
  return assignSlots(checks, new Set(taken));
}

// ───────────────────────── Editar el aviso conversando ─────────────────────────

export const CHAT_SYSTEM =
  "Usted ayuda a un vendedor a ajustar su aviso de carro usado en Colombia, en español colombiano y tratando de usted. " +
  "Aplique lo que pida sobre el título, la descripción o el precio. No invente datos del carro: use solo los hechos dados y lo que el vendedor diga. " +
  "Si pide un precio fuera del rango justo, hágalo y avísele con una frase. Sin emojis ni signos de exclamación. " +
  'Responda SOLO JSON: {"respuesta": "1 o 2 frases sobre lo que cambió", "cambios": {"title"?: string, "description"?: string, "priceCop"?: entero}}. ' +
  "En 'cambios' incluya solo lo que cambió; la descripción va completa.";

export function chatPrompt(d: DraftData, message: string): string {
  const facts = {
    vehiculo: d.vehicle,
    kilometraje: d.km,
    ciudad: d.city,
    detalles: d.details,
    precio_justo: d.valuation && { bajo: d.valuation.low, medio: d.valuation.mid, alto: d.valuation.high },
    aviso_actual: d.listing,
  };
  const history = d.chat.slice(-10).map((m) => `${m.role === "user" ? "Vendedor" : "Asistente"}: ${m.text}`).join("\n");
  return `Hechos: ${JSON.stringify(facts)}\n\nConversación previa:\n${history || "(ninguna)"}\n\nPedido del vendedor: ${message}`;
}

export const chatResponseSchema = z.object({
  respuesta: z.string().min(1).max(800),
  cambios: z
    .object({
      title: z.string().min(10).max(90).optional(),
      description: z.string().min(40).max(4000).optional(),
      priceCop: z.number().int().min(5_000_000).max(5_000_000_000).optional(),
    })
    .default({}),
});

export function parseChat(raw: unknown): { reply: string; patch: { title?: string; description?: string; priceCop?: number } } | null {
  const r = chatResponseSchema.safeParse(raw);
  return r.success ? { reply: r.data.respuesta, patch: r.data.cambios } : null;
}
