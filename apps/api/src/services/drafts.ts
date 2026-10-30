import {
  FREE_ACTIVE_LISTINGS,
  firstMessage,
  missingRequiredSlots,
  PHOTO_SLOT_KEYS,
  buildQualityReport,
  listingCreateSchema,
  hashDistance,
  type ChatMessage,
  type Draft,
  type DraftConfirmInput,
  type DraftData,
  type DraftVehicle,
  type PhotoIssue,
  type PhotoQuality,
  type PhotoSlot,
} from "@tcu/shared";
import type pg from "pg";
import type { Queryable } from "../db";
import type { VehicleDataProvider } from "../providers/vehicle-data";
import { aiEnabled, chatEdit, classifyPhotos, recognizeVehicle } from "./ai";
import { draftListing } from "./ai-draft";
import { ListingError, createListing } from "./listings";
import { readUpload } from "./storage";
import { VehicleNotFoundError, valuate, valuateManual } from "./valuation";

export class DraftError extends Error {
  constructor(
    readonly code: "borrador_no_encontrado" | "fotos_invalidas" | "paso_invalido" | "fotos_obligatorias",
    readonly status: number,
  ) {
    super(code);
  }
}

interface Row {
  id: string;
  data: DraftData;
  created_at: Date;
  updated_at: Date;
}

const toDraft = (r: Row): Draft => ({
  id: r.id,
  data: r.data,
  quality: buildQualityReport(r.data),
  aiEnabled: aiEnabled(),
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

async function load(db: Queryable, userId: string, id: string): Promise<Row> {
  const { rows } = await db.query<Row>("SELECT id, data, created_at, updated_at FROM listing_drafts WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!rows[0]) throw new DraftError("borrador_no_encontrado", 404);
  return rows[0];
}

async function save(db: Queryable, id: string, data: DraftData): Promise<Draft> {
  const { rows } = await db.query<Row>(
    "UPDATE listing_drafts SET data = $2, updated_at = now() WHERE id = $1 RETURNING id, data, created_at, updated_at",
    [id, JSON.stringify(data)],
  );
  return toDraft(rows[0]!);
}

/** Marca como duplicada la foto casi igual a una anterior. */
function markDuplicates(photos: DraftData["photos"]) {
  for (const [i, p] of photos.entries()) {
    const issues: PhotoIssue[] = p.quality.issues.filter((x) => x !== "duplicada");
    if (photos.slice(0, i).some((q) => hashDistance(q.quality.hash, p.quality.hash) <= 3)) issues.push("duplicada");
    p.quality = { ...p.quality, issues };
  }
}

/** Trae la calidad de las fotos y comprueba que sean del usuario. */
async function photosOf(db: Queryable, userId: string, urls: string[]): Promise<Map<string, PhotoQuality>> {
  const { rows } = await db.query<{ url: string; quality: PhotoQuality }>(
    "SELECT url, quality FROM uploads WHERE user_id = $1 AND url = ANY($2)",
    [userId, urls],
  );
  if (rows.length !== new Set(urls).size) throw new DraftError("fotos_invalidas", 400);
  return new Map(rows.map((r) => [r.url, r.quality]));
}

async function assertCanPublish(db: Queryable, userId: string) {
  const { rows } = await db.query<{ kind: string; n: string }>(
    "SELECT u.kind, (SELECT count(*) FROM listings WHERE seller_id = u.id AND status = 'activo') AS n FROM users u WHERE u.id = $1",
    [userId],
  );
  if (rows[0]?.kind === "particular" && Number(rows[0].n) >= FREE_ACTIVE_LISTINGS) throw new ListingError("limite_plan_gratis", 409);
}

// ───────────────────────── Pasos ─────────────────────────

export async function createDraft(db: Queryable, userId: string, urls: string[]): Promise<Draft> {
  await assertCanPublish(db, userId);
  const q = await photosOf(db, userId, urls);
  const data: DraftData = {
    step: "fotos",
    photos: urls.map((url) => ({ url, slot: null, quality: q.get(url)!, aiIssues: [] })),
    recognition: null, plate: null, km: null, city: null, vehicle: null, match: null,
    details: null, listing: null, valuation: null, chat: [], listingId: null,
    startedAt: new Date().toISOString(),
  };
  markDuplicates(data.photos);
  const { rows } = await db.query<Row>(
    "INSERT INTO listing_drafts (user_id, data) VALUES ($1, $2) RETURNING id, data, created_at, updated_at",
    [userId, JSON.stringify(data)],
  );
  return toDraft(rows[0]!);
}

export async function getDraft(db: Queryable, userId: string, id: string) {
  return toDraft(await load(db, userId, id));
}

/**
 * Reemplaza fotos y ángulos (agregar, quitar, reemplazar, corregir lo que dijo la IA).
 * Si ya se reconoció el carro, la IA revisa las fotos nuevas para verificar su ángulo.
 */
export async function setPhotos(
  db: Queryable,
  userId: string,
  id: string,
  photos: { url: string; slot: PhotoSlot | null; slotConfirmed?: boolean }[],
) {
  const row = await load(db, userId, id);
  const q = await photosOf(db, userId, photos.map((p) => p.url));
  const prev = new Map(row.data.photos.map((p) => [p.url, p]));
  row.data.photos = photos.map((p) => {
    const old = prev.get(p.url);
    const slotConfirmed = p.slotConfirmed ?? (old && old.slot === p.slot ? old.slotConfirmed : undefined);
    return { url: p.url, slot: p.slot, quality: q.get(p.url)!, aiIssues: old?.aiIssues ?? [], aiSlot: old?.aiSlot, aiChecked: old?.aiChecked, slotConfirmed };
  });
  const fresh = row.data.photos.filter((p) => !prev.has(p.url));
  if (row.data.recognition && fresh.length) {
    const taken = new Set(row.data.photos.filter((p) => prev.has(p.url) && p.slot).map((p) => p.slot!));
    const checks = await classifyPhotos(await Promise.all(fresh.map((p) => readUpload(p.url))), taken);
    fresh.forEach((p, i) => {
      const c = checks?.[i];
      if (!c) return;
      Object.assign(p, { aiSlot: c.aiSlot, aiIssues: c.aiIssues, aiChecked: true, slot: p.slot ?? c.slot });
    });
  }
  markDuplicates(row.data.photos);
  return save(db, id, row.data);
}

/** La IA mira las fotos: marca, línea, años, color, equipamiento visible, ángulo y problemas de cada foto. */
export async function recognizeDraft(db: Queryable, userId: string, id: string) {
  const row = await load(db, userId, id);
  const r = await recognizeVehicle(await Promise.all(row.data.photos.slice(0, 12).map((p) => readUpload(p.url))));
  row.data.recognition = r.recognition;
  row.data.photos = row.data.photos.map((p, i) => {
    const c = r.photos[i];
    return { ...p, slot: p.slot ?? c?.slot ?? null, aiIssues: c?.aiIssues ?? [], aiSlot: c?.aiSlot ?? null, aiChecked: c?.aiChecked ?? false };
  });
  row.data.step = "confirmar";
  return save(db, id, row.data);
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * El vendedor confirma con la placa y las características agrupadas. Con eso: datos exactos de Fasecolda,
 * comparación con lo que vio la IA, precio justo y un primer aviso redactado.
 */
export async function confirmDraft(db: Queryable, provider: VehicleDataProvider, userId: string, id: string, input: DraftConfirmInput) {
  const row = await load(db, userId, id);
  const d = row.data;
  const cond = { km: input.km, city: input.city, condition: input.details.condition };

  // Con la placa: referencia exacta y Fasecolda. Si no aparece, el vendedor escribe el carro.
  const found = await provider.lookupByPlate(input.plate);
  let vehicle: DraftVehicle;
  if (found) {
    const valuation = await valuate(db, provider, { plate: input.plate, ...cond });
    vehicle = { ...found, source: "placa" };
    d.valuation = {
      id: valuation.id, low: valuation.low, mid: valuation.mid, high: valuation.high,
      fasecoldaValue: valuation.fasecoldaValue, comparables: valuation.comparables, adjustments: valuation.adjustments,
    };
  } else if (input.vehicle) {
    vehicle = { ...input.vehicle, fasecoldaValue: null, source: "manual" };
    d.valuation = await valuateManual(db, input.plate, input.vehicle, cond);
  } else {
    throw new VehicleNotFoundError(input.plate);
  }

  const rec = d.recognition;
  if (!rec || rec.source !== "ia" || !rec.brand) d.match = "sin_dato";
  else {
    const sameBrand = norm(rec.brand) === norm(vehicle.brand);
    const sameLine = !rec.line || norm(vehicle.line).includes(norm(rec.line)) || norm(rec.line).includes(norm(vehicle.line));
    const yearOk = !rec.yearFrom || !rec.yearTo || (vehicle.modelYear >= rec.yearFrom - 1 && vehicle.modelYear <= rec.yearTo + 1);
    d.match = sameBrand && sameLine && yearOk ? "coincide" : "diferente";
  }

  d.plate = input.plate;
  d.km = input.km;
  d.city = input.city;
  d.vehicle = vehicle;
  d.details = input.details;
  const text = await draftListing({
    vehicle, km: input.km, city: input.city, color: input.details.color, transmission: input.details.transmission,
    condition: input.details.condition, features: input.details.features,
  });
  d.listing = { title: text.title, description: text.description, priceCop: d.listing?.priceCop || d.valuation?.mid || 0 };
  d.step = "editar";
  if (!d.chat.length) d.chat.push({ role: "assistant", at: new Date().toISOString(), text: firstMessage(d) });
  return save(db, id, d);
}

export async function patchDraftListing(db: Queryable, userId: string, id: string, patch: { title?: string; description?: string; priceCop?: number }) {
  const row = await load(db, userId, id);
  if (!row.data.listing) throw new DraftError("paso_invalido", 400);
  row.data.listing = { ...row.data.listing, ...patch };
  return save(db, id, row.data);
}

export async function chatDraft(db: Queryable, userId: string, id: string, message: string) {
  const row = await load(db, userId, id);
  if (!row.data.listing) throw new DraftError("paso_invalido", 400);
  const now = () => new Date().toISOString();
  const r = await chatEdit(row.data, message);
  const user: ChatMessage = { role: "user", text: message, at: now() };
  const bot: ChatMessage = { role: "assistant", text: r.reply, at: now() };
  row.data.listing = { ...row.data.listing, ...r.patch };
  row.data.chat = [...row.data.chat, user, bot].slice(-40);
  return save(db, id, row.data);
}

export async function publishDraft(pool: pg.Pool, provider: VehicleDataProvider, userId: string, id: string) {
  const row = await load(pool, userId, id);
  const d = row.data;
  if (d.listingId) return { draft: toDraft(row), listingId: d.listingId };
  if (!d.listing || !d.details || !d.plate || d.km === null || !d.city || !d.vehicle) throw new DraftError("paso_invalido", 400);
  // Frente, lateral, trasera y tres cuartos: cada una con una foto que sí sea de ese ángulo.
  if (missingRequiredSlots(d.photos).length) throw new DraftError("fotos_obligatorias", 400);
  // La galería sigue el orden de las fotos guiadas; las que no tienen ángulo van al final como detalle.
  const rank = (s: PhotoSlot | null) => (s ? PHOTO_SLOT_KEYS.indexOf(s) : 99);
  const photos = [...d.photos].sort((a, b) => rank(a.slot) - rank(b.slot)).map((p) => ({ url: p.url, slot: p.slot ?? ("detalle_2" as PhotoSlot) }));
  const input = listingCreateSchema.parse({
    plate: d.plate, km: d.km, city: d.city, priceCop: d.listing.priceCop, title: d.listing.title, description: d.listing.description,
    condition: d.details.condition, color: d.details.color, transmission: d.details.transmission, bodyType: d.details.bodyType,
    doors: d.details.doors, armored: d.details.armored, features: d.details.features, photos, estimateId: d.valuation?.id,
    vehicle: d.vehicle.source === "manual"
      ? { brand: d.vehicle.brand, line: d.vehicle.line, version: d.vehicle.version, modelYear: d.vehicle.modelYear, fuel: d.vehicle.fuel }
      : undefined,
  });
  const { id: listingId } = await createListing(pool, provider, userId, input);
  d.listingId = listingId;
  d.step = "publicado";
  return { draft: await save(pool, id, d), listingId };
}
