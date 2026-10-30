/**
 * Servidor de demostración que corre en el navegador (build con VITE_DEMO=1).
 * Responde las mismas rutas que la API con los mismos esquemas y reglas de @tcu/shared:
 * búsqueda, avisos, cuentas, tasación, fotos, publicar con IA (modo demostración) y video.
 * Nada sale del navegador: las fotos se procesan en un canvas (sin EXIF) y el estado se guarda,
 * si se puede, en localStorage.
 */
import {
  DEMO_VEHICLES,
  FREE_ACTIVE_LISTINGS,
  FREE_LISTING_DAYS,
  LEGAL_VERSION,
  PHOTO_SLOT_KEYS,
  PRICING_MODEL_VERSION,
  CHAT_SYSTEM,
  CLASSIFY_SYSTEM,
  RECOGNIZE_SYSTEM,
  buildQualityReport,
  chatPrompt,
  classifyPrompt,
  demoRecognition,
  firstMessage,
  missingRequiredSlots,
  parseChat,
  parseClassification,
  parseRecognition,
  recognizePrompt,
  computeFairPrice,
  conditionBreakdown,
  conditionScore,
  draftChatSchema,
  draftConfirmSchema,
  draftCreateSchema,
  draftListingPatchSchema,
  draftPhotosSchema,
  draftRequestSchema,
  hashDistance,
  listingSearchSchema,
  listingUpdateSchema,
  loginSchema,
  photoIssuesFromMetrics,
  registerSchema,
  sellerProfileSchema,
  ruleChat,
  templateDraft,
  valuationRequestSchema,
  waitlistSchema,
  type ChatMessage,
  type SiteConfig,
  type ConditionInput,
  type DraftVehicle,
  type ManualVehicle,
  type Draft,
  type DraftData,
  type Facet,
  type ListingCard,
  type ListingDetail,
  type ListingSearch,
  type MyListing,
  type PhotoIssue,
  type PhotoQuality,
  type PhotoSlot,
  type PublicUser,
  type SearchResponse,
} from "@tcu/shared";
import { ZodError } from "zod";
import seed from "../demo/data.json";
import { aiAvailable, askJson } from "./demo-ai";
import { renderDemoVideo } from "./demo-video";

// ───────────────────────── Estado ─────────────────────────

interface User extends PublicUser {
  password: string;
}
interface VideoState {
  status: "sin_video" | "en_proceso" | "listo" | "error";
  url: string | null;
  posterUrl: string | null;
  ext?: string;
}
interface State {
  users: User[];
  listings: ListingDetail[];
  sellerOf: Record<string, string>;
  favorites: Record<string, string[]>;
  drafts: Record<string, { userId: string; data: DraftData; createdAt: string; updatedAt: string }>;
  uploads: Record<string, { userId: string; dataUrl: string; quality: PhotoQuality }>;
  waitlist: string[];
}

const KEY = "carrousado.demo.v1";
const SEED = seed as unknown as ListingDetail[];

function fresh(): State {
  return { users: [], listings: structuredClone(SEED), sellerOf: {}, favorites: {}, drafts: {}, uploads: {}, waitlist: [] };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const saved = JSON.parse(raw) as Omit<State, "listings"> & { mine: ListingDetail[]; overrides: Record<string, Partial<ListingDetail>> };
    const listings = [...saved.mine, ...structuredClone(SEED).map((l) => ({ ...l, ...saved.overrides[l.id] }))];
    return { ...saved, listings };
  } catch {
    return fresh();
  }
}

const st = load();
/** true cuando la IA respondió en esta visita (dentro de Claude, con permiso). */
let aiOn = false;

/** Guarda lo que cambió frente a la semilla. Si no cabe o no hay almacenamiento, sigue en memoria. */
function persist() {
  try {
    const seedIds = new Set(SEED.map((l) => l.id));
    const overrides: Record<string, Partial<ListingDetail>> = {};
    for (const l of st.listings) {
      if (seedIds.has(l.id)) overrides[l.id] = { status: l.status, priceCop: l.priceCop, description: l.description, questions: l.questions, views: l.views };
    }
    const { listings: _l, ...rest } = st;
    localStorage.setItem(KEY, JSON.stringify({ ...rest, mine: st.listings.filter((l) => !seedIds.has(l.id)), overrides }));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

/** Fotos subidas en la demo: se guardan como data URL y se piden con su ruta /uploads/… */
export function resolveDemoAsset(url: string): string | undefined {
  return st.uploads[url]?.dataUrl;
}

// ───────────────────────── Utilidades ─────────────────────────

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(code);
  }
}

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const publicUser = ({ password: _p, ...u }: User): PublicUser => ({ ...u, canPublish: true });

function currentUser(token: string | null): User | null {
  if (!token?.startsWith("demo.")) return null;
  return st.users.find((u) => u.id === token.slice(5)) ?? null;
}

const toCard = (l: ListingDetail): ListingCard => ({
  id: l.id, title: l.title, priceCop: l.priceCop, km: l.km, city: l.city, brand: l.brand, line: l.line,
  modelYear: l.modelYear, fuel: l.fuel, transmission: l.transmission, sellerKind: l.sellerKind, cover: l.cover,
  fair: l.fair, conditionScore: l.conditionScore, createdAt: l.createdAt,
});

const byId = (id: string) => st.listings.find((l) => l.id === id);
const sellerId = (l: ListingDetail) => st.sellerOf[l.id] ?? l.seller.id;
const activeOf = (uid: string, except?: string) =>
  st.listings.filter((l) => sellerId(l) === uid && l.status === "activo" && l.id !== except).length;

function assertFreeLimit(u: User, except?: string) {
  if (u.kind === "particular" && activeOf(u.id, except) >= FREE_ACTIVE_LISTINGS) throw new HttpError(409, "limite_plan_gratis");
}

// ───────────────────────── Búsqueda ─────────────────────────

type FilterKey = keyof Omit<ListingSearch, "sort" | "page" | "pageSize">;

function matches(l: ListingDetail, f: ListingSearch, skip?: FilterKey): boolean {
  const on = (k: FilterKey) => f[k] !== undefined && k !== skip;
  if (l.status !== "activo") return false;
  if (on("q")) {
    const hay = norm(`${l.brand} ${l.line} ${l.title} ${l.version ?? ""} ${l.description} ${l.city}`);
    if (!norm(f.q).split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (on("brand") && norm(l.brand) !== norm(f.brand)) return false;
  if (on("line") && norm(l.line) !== norm(f.line)) return false;
  if (on("city") && l.city !== f.city) return false;
  if (on("fuel") && l.fuel !== f.fuel) return false;
  if (on("transmission") && l.transmission !== f.transmission) return false;
  if (on("bodyType") && l.bodyType !== f.bodyType) return false;
  if (on("seller") && l.sellerKind !== f.seller) return false;
  if (on("yearMin") && l.modelYear < f.yearMin!) return false;
  if (on("yearMax") && l.modelYear > f.yearMax!) return false;
  if (on("priceMin") && l.priceCop < f.priceMin!) return false;
  if (on("priceMax") && l.priceCop > f.priceMax!) return false;
  if (on("kmMax") && l.km > f.kmMax!) return false;
  if (on("fair")) {
    if (!l.fair) return false;
    if (f.fair === "bajo" && !(l.priceCop < l.fair.low)) return false;
    if (f.fair === "en_rango" && !(l.priceCop >= l.fair.low && l.priceCop <= l.fair.high)) return false;
  }
  return true;
}

const SORT: Record<ListingSearch["sort"], (a: ListingDetail, b: ListingDetail) => number> = {
  recientes: (a, b) => b.createdAt.localeCompare(a.createdAt),
  precio_asc: (a, b) => a.priceCop - b.priceCop,
  precio_desc: (a, b) => b.priceCop - a.priceCop,
  km_asc: (a, b) => a.km - b.km,
  modelo_desc: (a, b) => b.modelYear - a.modelYear || b.createdAt.localeCompare(a.createdAt),
};

function facet(f: ListingSearch, key: FilterKey, get: (l: ListingDetail) => string | null): Facet[] {
  const counts = new Map<string, number>();
  for (const l of st.listings) {
    const v = get(l);
    if (v && matches(l, f, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, 30);
}

function search(params: URLSearchParams): SearchResponse {
  const f = listingSearchSchema.parse(Object.fromEntries(params));
  const all = st.listings.filter((l) => matches(l, f)).sort((a, b) => SORT[f.sort](a, b) || a.id.localeCompare(b.id));
  const start = (f.page - 1) * f.pageSize;
  return {
    items: all.slice(start, start + f.pageSize).map(toCard),
    total: all.length,
    page: f.page,
    pageSize: f.pageSize,
    facets: { brand: facet(f, "brand", (l) => l.brand), city: facet(f, "city", (l) => l.city), fuel: facet(f, "fuel", (l) => l.fuel) },
  };
}

function detail(id: string, u: User | null): ListingDetail {
  const l = byId(id);
  const isOwner = !!u && sellerId(l!) === u.id;
  if (!l || (l.status !== "activo" && !isOwner)) throw new HttpError(404, "aviso_no_encontrado");
  if (!isOwner) l.views += 1;
  const sid = sellerId(l);
  const owner = st.users.find((x) => x.id === sid);
  return {
    ...structuredClone(l),
    seller: { ...l.seller, whatsapp: u ? (owner?.whatsapp ?? null) : null, activeListings: activeOf(sid) || l.seller.activeListings },
    isFavorite: !!u && (st.favorites[u.id] ?? []).includes(id),
    isOwner,
  };
}

function similar(id: string): ListingCard[] {
  const base = byId(id);
  if (!base) return [];
  return st.listings
    .filter((l) => l.status === "activo" && l.id !== id && (l.brand === base.brand || l.bodyType === base.bodyType))
    .filter((l) => l.priceCop >= base.priceCop * 0.7 && l.priceCop <= base.priceCop * 1.3)
    .sort((a, b) => {
      const same = (l: ListingDetail) => (l.brand === base.brand && l.line === base.line ? 0 : 1);
      return same(a) - same(b) || Math.abs(a.priceCop - base.priceCop) - Math.abs(b.priceCop - base.priceCop);
    })
    .slice(0, 4)
    .map(toCard);
}

// ───────────────────────── Tasación ─────────────────────────

function lookup(plate: string) {
  const v = DEMO_VEHICLES[plate];
  if (!v) throw new HttpError(404, "placa_no_encontrada");
  return v;
}

function valuate(body: unknown) {
  const req = valuationRequestSchema.parse(body);
  const vehicle = lookup(req.plate);
  const marketPrices = st.listings
    .filter((l) => l.status === "activo" && norm(l.brand) === norm(vehicle.brand) && norm(l.line) === norm(vehicle.line))
    .filter((l) => Math.abs(l.modelYear - vehicle.modelYear) <= 1 && Math.abs(l.km - req.km) <= 20_000)
    .map((l) => l.priceCop);
  const score = conditionScore(req.condition);
  const price = computeFairPrice({
    fasecoldaValue: vehicle.fasecoldaValue, marketPrices, km: req.km, modelYear: vehicle.modelYear,
    city: req.city, conditionScore: score, evidence: "declarado",
  });
  return {
    id: uuid(), vehicle, fasecoldaValue: vehicle.fasecoldaValue, conditionScore: score, evidence: "declarado" as const,
    modelVersion: PRICING_MODEL_VERSION, ...price,
  };
}

// ───────────────────────── Fotos ─────────────────────────

const MAX_BYTES = 12 * 1024 * 1024;
const STORE_MAX_SIDE = 1600;

/** Mide resolución, brillo, nitidez (laplaciano) y huella dHash, como el servidor. */
function measure(bitmap: ImageBitmap): PhotoQuality {
  const { width, height } = bitmap;
  const s = Math.min(1, 512 / Math.max(width, height));
  const w = Math.max(3, Math.round(width * s));
  const h = Math.max(3, Math.round(height * s));
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    g[i] = 0.2126 * px[i * 4]! + 0.7152 * px[i * 4 + 1]! + 0.0722 * px[i * 4 + 2]!;
    sum += g[i]!;
  }
  let n = 0, m = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = Math.min(255, Math.max(0, g[i - w]! + g[i + w]! + g[i - 1]! + g[i + 1]! - 4 * g[i]! + 128));
      n++;
      const d = v - m;
      m += d / n;
      m2 += d * (v - m);
    }
  }
  const metrics = { width, height, brightness: Math.round(sum / (w * h)), sharpness: Math.round(Math.sqrt(m2 / Math.max(1, n)) * 10) / 10 };

  const hc = new OffscreenCanvas(9, 8);
  const hctx = hc.getContext("2d", { willReadFrequently: true })!;
  hctx.drawImage(bitmap, 0, 0, 9, 8);
  const hp = hctx.getImageData(0, 0, 9, 8).data;
  const lum = (i: number) => 0.2126 * hp[i * 4]! + 0.7152 * hp[i * 4 + 1]! + 0.0722 * hp[i * 4 + 2]!;
  let hash = "";
  for (let row = 0; row < 8; row++) {
    for (let half = 0; half < 2; half++) {
      let nib = 0;
      for (let j = 0; j < 4; j++) {
        const col = half * 4 + j;
        nib = (nib << 1) | (lum(row * 9 + col) > lum(row * 9 + col + 1) ? 1 : 0);
      }
      hash += nib.toString(16);
    }
  }
  return { ...metrics, hash, issues: photoIssuesFromMetrics(metrics) };
}

async function upload(u: User, file: File) {
  if (file.size > MAX_BYTES) throw new HttpError(413, "archivo_muy_grande");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HttpError(400, "formato_no_soportado");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new HttpError(400, "imagen_danada");
  }
  const quality = measure(bitmap);
  // Se vuelve a dibujar en un canvas: la copia guardada no lleva EXIF ni GPS.
  const s = Math.min(1, STORE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * s);
  c.height = Math.round(bitmap.height * s);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const dataUrl = c.toDataURL("image/jpeg", 0.8);
  const url = `/uploads/demo-u/${u.id.slice(0, 8)}/${uuid()}.jpg`;
  st.uploads[url] = { userId: u.id, dataUrl, quality };
  persist();
  return { url, quality };
}

// ───────────────────────── Borradores ─────────────────────────

function toDraft(id: string): Draft {
  const r = st.drafts[id]!;
  return { id, data: structuredClone(r.data), quality: buildQualityReport(r.data), aiEnabled: aiOn, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

function draftOf(u: User, id: string) {
  const r = st.drafts[id];
  if (!r || r.userId !== u.id) throw new HttpError(404, "borrador_no_encontrado");
  return r;
}

function save(id: string) {
  st.drafts[id]!.updatedAt = now();
  persist();
  return toDraft(id);
}

function qualityOf(u: User, urls: string[]) {
  const q = new Map<string, PhotoQuality>();
  for (const url of urls) {
    const up = st.uploads[url];
    if (!up || up.userId !== u.id) throw new HttpError(400, "fotos_invalidas");
    q.set(url, up.quality);
  }
  return q;
}

function markDuplicates(photos: DraftData["photos"]) {
  for (const [i, p] of photos.entries()) {
    const issues: PhotoIssue[] = p.quality.issues.filter((x) => x !== "duplicada");
    if (photos.slice(0, i).some((o) => hashDistance(o.quality.hash, p.quality.hash) <= 3)) issues.push("duplicada");
    p.quality = { ...p.quality, issues };
  }
}

function createDraft(u: User, body: unknown) {
  assertFreeLimit(u);
  const { photos } = draftCreateSchema.parse(body);
  const q = qualityOf(u, photos);
  const id = uuid();
  const data: DraftData = {
    step: "fotos",
    photos: photos.map((url) => ({ url, slot: null, quality: q.get(url)!, aiIssues: [] })),
    recognition: null, plate: null, km: null, city: null, vehicle: null, match: null,
    details: null, listing: null, valuation: null, chat: [], listingId: null, startedAt: now(),
  };
  markDuplicates(data.photos);
  st.drafts[id] = { userId: u.id, data, createdAt: now(), updatedAt: now() };
  return save(id);
}

/** Revisa con la IA (si hay) las fotos que aún no se han revisado. */
async function checkNewPhotos(d: DraftData, fresh: DraftData["photos"]) {
  const ai = await aiAvailable();
  if (!ai.images || !fresh.length) return;
  const taken = new Set(d.photos.filter((p) => !fresh.includes(p) && p.slot).map((p) => p.slot!));
  for (let i = 0; i < fresh.length; i += ai.images) {
    const batch = fresh.slice(i, i + ai.images);
    const raw = await askJson(CLASSIFY_SYSTEM, classifyPrompt(batch.length), { images: batch.map((p) => st.uploads[p.url]!.dataUrl), tier: "quick" });
    const checks = parseClassification(raw, batch.length, taken);
    if (!checks) return;
    batch.forEach((p, j) => {
      const c = checks[j]!;
      Object.assign(p, { aiSlot: c.aiSlot, aiIssues: c.aiIssues, aiChecked: true, slot: p.slot ?? c.slot });
      if (p.slot) taken.add(p.slot);
    });
  }
}

async function setPhotos(u: User, id: string, body: unknown) {
  const r = draftOf(u, id);
  const { photos } = draftPhotosSchema.parse(body);
  const q = qualityOf(u, photos.map((p) => p.url));
  const prev = new Map(r.data.photos.map((p) => [p.url, p]));
  r.data.photos = photos.map((p) => {
    const old = prev.get(p.url);
    const slotConfirmed = p.slotConfirmed ?? (old && old.slot === p.slot ? old.slotConfirmed : undefined);
    return { url: p.url, slot: p.slot, quality: q.get(p.url)!, aiIssues: old?.aiIssues ?? [], aiSlot: old?.aiSlot, aiChecked: old?.aiChecked, slotConfirmed };
  });
  if (r.data.recognition) await checkNewPhotos(r.data, r.data.photos.filter((p) => !prev.has(p.url)));
  markDuplicates(r.data.photos);
  return save(id);
}

async function recognize(u: User, id: string) {
  const r = draftOf(u, id);
  const d = r.data;
  const ai = await aiAvailable();
  let res = null;
  if (ai.images) {
    // La IA reconoce el carro con las primeras fotos; el resto se revisa después, por tandas.
    const first = d.photos.slice(0, ai.images);
    const raw = await askJson(RECOGNIZE_SYSTEM, recognizePrompt(first.length), { images: first.map((p) => st.uploads[p.url]!.dataUrl) });
    res = parseRecognition(raw, first.length);
  } else {
    await wait(900);
  }
  aiOn = !!res;
  res ??= demoRecognition(
    d.photos.length,
    ai.text
      ? "No pudimos revisar las fotos con la IA esta vez: confirme los datos con una placa de prueba y revise el ángulo de cada foto."
      : "En esta demostración la IA solo funciona dentro de Claude: confirme los datos con una placa de prueba y revise el ángulo de cada foto.",
  );
  d.recognition = res.recognition;
  d.photos = d.photos.map((p, i) => {
    const c = res.photos[i];
    return c ? { ...p, slot: p.slot ?? c.slot, aiIssues: c.aiIssues, aiSlot: c.aiSlot, aiChecked: c.aiChecked } : p;
  });
  if (aiOn) await checkNewPhotos(d, d.photos.slice(res.photos.length));
  d.step = "confirmar";
  return save(id);
}

/** Carro escrito a mano: rango solo con avisos comparables (si hay suficientes). */
function valuateManual(v: ManualVehicle, km: number, city: string, condition: ConditionInput) {
  const marketPrices = st.listings
    .filter((l) => l.status === "activo" && norm(l.brand) === norm(v.brand) && norm(l.line) === norm(v.line))
    .filter((l) => Math.abs(l.modelYear - v.modelYear) <= 1 && Math.abs(l.km - km) <= 20_000)
    .map((l) => l.priceCop);
  const price = computeFairPrice({
    fasecoldaValue: null, marketPrices, km, modelYear: v.modelYear, city, conditionScore: conditionScore(condition), evidence: "declarado",
  });
  return price && { id: uuid(), low: price.low, mid: price.mid, high: price.high, fasecoldaValue: null, comparables: price.comparables, adjustments: price.adjustments };
}

async function confirm(u: User, id: string, body: unknown) {
  const r = draftOf(u, id);
  const input = draftConfirmSchema.parse(body);
  const d = r.data;
  const found = DEMO_VEHICLES[input.plate];
  let vehicle: DraftVehicle;
  if (found) {
    const val = valuate({ plate: input.plate, km: input.km, city: input.city, condition: input.details.condition });
    vehicle = { ...found, source: "placa" };
    d.valuation = { id: val.id, low: val.low, mid: val.mid, high: val.high, fasecoldaValue: val.fasecoldaValue, comparables: val.comparables, adjustments: val.adjustments };
  } else if (input.vehicle) {
    vehicle = { ...input.vehicle, fasecoldaValue: null, source: "manual" };
    d.valuation = valuateManual(input.vehicle, input.km, input.city, input.details.condition);
  } else {
    throw new HttpError(404, "placa_no_encontrada");
  }
  await wait(600);
  const rec = d.recognition;
  if (!rec || rec.source !== "ia" || !rec.brand) d.match = "sin_dato";
  else {
    const n = (x: string | null | undefined) => norm(x).replace(/[^a-z0-9]/g, "");
    const sameBrand = n(rec.brand) === n(vehicle.brand);
    const sameLine = !rec.line || n(vehicle.line).includes(n(rec.line)) || n(rec.line).includes(n(vehicle.line));
    const yearOk = !rec.yearFrom || !rec.yearTo || (vehicle.modelYear >= rec.yearFrom - 1 && vehicle.modelYear <= rec.yearTo + 1);
    d.match = sameBrand && sameLine && yearOk ? "coincide" : "diferente";
  }
  d.plate = input.plate;
  d.km = input.km;
  d.city = input.city;
  d.vehicle = vehicle;
  d.details = input.details;
  const text = templateDraft({
    vehicle, km: input.km, city: input.city, color: input.details.color, transmission: input.details.transmission,
    condition: input.details.condition, features: input.details.features,
  });
  d.listing = { title: text.title, description: text.description, priceCop: d.listing?.priceCop || d.valuation?.mid || 0 };
  d.step = "editar";
  if (!d.chat.length) d.chat.push({ role: "assistant", at: now(), text: firstMessage(d) });
  return save(id);
}

function patchListing(u: User, id: string, body: unknown) {
  const r = draftOf(u, id);
  if (!r.data.listing) throw new HttpError(400, "paso_invalido");
  r.data.listing = { ...r.data.listing, ...draftListingPatchSchema.parse(body) };
  return save(id);
}

async function chat(u: User, id: string, body: unknown) {
  const r = draftOf(u, id);
  if (!r.data.listing) throw new HttpError(400, "paso_invalido");
  const { message } = draftChatSchema.parse(body);
  const raw = aiOn ? await askJson(CHAT_SYSTEM, chatPrompt(r.data, message), { tier: "quick" }) : null;
  if (!raw) await wait(500);
  const res = parseChat(raw) ?? ruleChat(r.data, message);
  const msgs: ChatMessage[] = [{ role: "user", text: message, at: now() }, { role: "assistant", text: res.reply, at: now() }];
  r.data.listing = { ...r.data.listing, ...res.patch };
  r.data.chat = [...r.data.chat, ...msgs].slice(-40);
  return save(id);
}

function publish(u: User, id: string) {
  const r = draftOf(u, id);
  const d = r.data;
  if (d.listingId) return { draft: toDraft(id), listingId: d.listingId };
  if (!d.listing || !d.details || !d.plate || d.km === null || !d.city || !d.vehicle) throw new HttpError(400, "paso_invalido");
  if (d.listing.priceCop < 5_000_000) throw new HttpError(400, "datos_invalidos", [{ path: ["priceCop"], message: "Escriba el precio (desde $5.000.000)." }]);
  if (missingRequiredSlots(d.photos).length) throw new HttpError(400, "fotos_obligatorias");
  if (!u.sellerProfileComplete) throw new HttpError(400, "datos_vendedor");
  assertFreeLimit(u);
  const rank = (s: PhotoSlot | null) => (s ? PHOTO_SLOT_KEYS.indexOf(s) : 99);
  const photos = [...d.photos].sort((a, b) => rank(a.slot) - rank(b.slot)).map((p) => ({ url: p.url, slot: p.slot ?? "detalle_2" }));
  const b = conditionBreakdown(d.details.condition);
  const score = conditionScore(d.details.condition);
  const listingId = uuid();
  const v = d.vehicle;
  const fair = d.valuation ? { low: d.valuation.low, mid: d.valuation.mid, high: d.valuation.high } : null;
  st.listings.unshift({
    id: listingId, title: d.listing.title, priceCop: d.listing.priceCop, km: d.km, city: d.city,
    brand: v.brand, line: v.line, modelYear: v.modelYear, fuel: v.fuel ?? null, transmission: d.details.transmission,
    sellerKind: u.kind, cover: photos[0]?.url ?? null, fair, conditionScore: score, createdAt: now(),
    version: v.version ?? null, description: d.listing.description, color: d.details.color, bodyType: d.details.bodyType,
    doors: d.details.doors, armored: d.details.armored, features: d.details.features, status: "activo", views: 0,
    expiresAt: new Date(Date.now() + FREE_LISTING_DAYS * 86_400_000).toISOString(),
    photos,
    condition: { score, evidence: "declarado", ...b },
    estimate: d.valuation && fair
      ? { ...fair, fasecoldaValue: d.valuation.fasecoldaValue, comparables: d.valuation.comparables, adjustments: d.valuation.adjustments, modelVersion: PRICING_MODEL_VERSION, createdAt: now() }
      : null,
    seller: { id: u.id, name: u.name, kind: u.kind, since: now(), whatsapp: null, activeListings: 1 },
    questions: [], isFavorite: false, isOwner: true,
  });
  st.sellerOf[listingId] = u.id;
  d.listingId = listingId;
  d.step = "publicado";
  const draft = save(id);
  startVideo(listingId);
  return { draft, listingId };
}

// ───────────────────────── Video (en el navegador) ─────────────────────────

const videos = new Map<string, VideoState>();

function startVideo(listingId: string) {
  const l = byId(listingId);
  if (!l) return;
  const poster = l.cover ? (resolveDemoAsset(l.cover) ?? l.cover) : null;
  videos.set(listingId, { status: "en_proceso", url: null, posterUrl: poster });
  renderDemoVideo({
    photos: l.photos.map((p) => resolveDemoAsset(p.url) ?? p.url),
    brand: l.brand, line: l.line, modelYear: l.modelYear, km: l.km, city: l.city, priceCop: l.priceCop,
    fair: l.fair, features: l.features, conditionScore: l.conditionScore,
  })
    .then(({ blob, ext }) => videos.set(listingId, { status: "listo", url: URL.createObjectURL(blob), posterUrl: poster, ext }))
    .catch((err) => {
      console.warn("No se pudo hacer el video en este navegador", err);
      videos.set(listingId, { status: "error", url: null, posterUrl: poster });
    });
}

// ───────────────────────── Enrutador ─────────────────────────

type Handler = (ctx: { u: User | null; need: () => User; body: unknown; params: string[]; qs: URLSearchParams; form: FormData | null }) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, path: string, h: Handler) =>
  routes.push([method, new RegExp(`^${path.replace(/:\w+/g, "([^/]+)")}$`), h]);

on("POST", "/api/auth/register", ({ body }) => {
  const b = registerSchema.parse(body);
  if (st.users.some((u) => u.email === b.email)) throw new HttpError(409, "correo_registrado");
  const user: User = { id: uuid(), name: b.name, email: b.email, kind: "particular", whatsapp: b.whatsapp ?? null, canPublish: true, sellerProfileComplete: false, password: b.password };
  st.users.push(user);
  persist();
  return { token: `demo.${user.id}`, user: publicUser(user) };
});
on("POST", "/api/auth/login", ({ body }) => {
  const { email, password } = loginSchema.parse(body);
  const u = st.users.find((x) => x.email === email && x.password === password);
  if (!u) throw new HttpError(401, "credenciales_invalidas");
  return { token: `demo.${u.id}`, user: publicUser(u) };
});
on("GET", "/api/me", ({ need }) => publicUser(need()));
on("GET", "/api/me/listings", ({ need }) => {
  const u = need();
  return st.listings
    .filter((l) => sellerId(l) === u.id)
    .map((l): MyListing => ({ ...toCard(l), status: l.status, views: l.views, expiresAt: l.expiresAt, pendingQuestions: l.questions.filter((q) => !q.answer).length }));
});
on("GET", "/api/me/favorites", ({ need }) => {
  const ids = st.favorites[need().id] ?? [];
  return ids.map(byId).filter((l): l is ListingDetail => !!l && l.status === "activo").map(toCard);
});
on("GET", "/api/demo-plates", () => Object.keys(DEMO_VEHICLES));
on("GET", "/api/config", (): SiteConfig => ({
  beta: false, invitesRequired: false, ai: false, provider: "mock", demoPlates: Object.keys(DEMO_VEHICLES),
  legal: { name: "Carro Usado (demostración)", id: "[pendiente]", email: "[pendiente]", address: "[pendiente]", city: "Bogotá", phone: null },
  legalVersion: LEGAL_VERSION, publicUrl: location.href.split("#")[0]!,
}));
on("POST", "/api/me/invite", ({ need }) => publicUser(need()));
on("PUT", "/api/me/seller-profile", ({ need, body }) => {
  const u = need();
  sellerProfileSchema.parse(body);
  u.sellerProfileComplete = true; // en la demo solo se marca; los datos no se guardan
  persist();
  return publicUser(u);
});
on("POST", "/api/valuations", ({ body }) => valuate(body));
on("POST", "/api/vehicles/lookup", ({ need, body }) => {
  need();
  return lookup(String((body as { plate?: string })?.plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
});
on("POST", "/api/waitlist", ({ body }) => {
  st.waitlist.push(waitlistSchema.parse(body).email);
  persist();
  return { ok: true };
});
on("POST", "/api/uploads", ({ need, form }) => {
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "formato_no_soportado");
  return upload(need(), file);
});
on("POST", "/api/ai/listing-draft", ({ need, body }) => {
  need();
  const i = draftRequestSchema.parse(body);
  return templateDraft({ ...i, vehicle: lookup(i.plate) });
});

on("GET", "/api/listings", ({ qs }) => search(qs));
on("GET", "/api/listings/:id", ({ u, params }) => detail(params[0]!, u));
on("GET", "/api/listings/:id/similar", ({ params }) => similar(params[0]!));
on("PATCH", "/api/listings/:id", ({ need, params, body }) => {
  const u = need();
  const l = byId(params[0]!);
  if (!l || sellerId(l) !== u.id) throw new HttpError(404, "aviso_no_encontrado");
  const patch = listingUpdateSchema.parse(body);
  if (patch.status === "activo" && l.status !== "activo") assertFreeLimit(u, l.id);
  Object.assign(l, patch);
  persist();
  return { ok: true };
});
on("POST", "/api/listings/:id/questions", ({ need, params, body }) => {
  const u = need();
  const l = byId(params[0]!);
  if (!l || l.status !== "activo") throw new HttpError(404, "aviso_no_encontrado");
  if (sellerId(l) === u.id) throw new HttpError(400, "pregunta_propia");
  const text = String((body as { body?: string })?.body ?? "").trim();
  if (text.length < 3 || text.length > 500) throw new HttpError(400, "datos_invalidos");
  const id = uuid();
  l.questions.unshift({ id, body: text, answer: null, createdAt: now(), answeredAt: null });
  persist();
  return { id };
});
on("POST", "/api/questions/:id/answer", ({ need, params, body }) => {
  const u = need();
  const l = st.listings.find((x) => x.questions.some((q) => q.id === params[0]));
  if (!l || sellerId(l) !== u.id) throw new HttpError(403, "no_autorizado");
  const q = l.questions.find((x) => x.id === params[0])!;
  q.answer = String((body as { answer?: string })?.answer ?? "").trim();
  q.answeredAt = now();
  persist();
  return { ok: true };
});
on("PUT", "/api/favorites/:id", ({ need, params }) => {
  const u = need();
  const list = (st.favorites[u.id] ??= []);
  if (!list.includes(params[0]!)) list.unshift(params[0]!);
  persist();
  return { ok: true };
});
on("DELETE", "/api/favorites/:id", ({ need, params }) => {
  const u = need();
  st.favorites[u.id] = (st.favorites[u.id] ?? []).filter((x) => x !== params[0]);
  persist();
  return { ok: true };
});

on("POST", "/api/drafts", ({ need, body }) => createDraft(need(), body));
on("GET", "/api/drafts/:id", ({ need, params }) => (draftOf(need(), params[0]!), toDraft(params[0]!)));
on("PUT", "/api/drafts/:id/photos", ({ need, params, body }) => setPhotos(need(), params[0]!, body));
on("POST", "/api/drafts/:id/recognize", ({ need, params }) => recognize(need(), params[0]!));
on("POST", "/api/drafts/:id/confirm", ({ need, params, body }) => confirm(need(), params[0]!, body));
on("PATCH", "/api/drafts/:id/listing", ({ need, params, body }) => patchListing(need(), params[0]!, body));
on("POST", "/api/drafts/:id/chat", ({ need, params, body }) => chat(need(), params[0]!, body));
on("POST", "/api/drafts/:id/publish", ({ need, params }) => publish(need(), params[0]!));

on("GET", "/api/listings/:id/video", ({ params }) => videos.get(params[0]!) ?? { status: "sin_video", url: null, posterUrl: null });
on("POST", "/api/listings/:id/video", ({ need, params }) => {
  const l = byId(params[0]!);
  if (!l || sellerId(l) !== need().id) throw new HttpError(404, "aviso_no_encontrado");
  startVideo(l.id);
  return { status: "en_proceso" };
});

/** Atiende una solicitud como lo haría la API. Lanza { status, code, issues } si falla. */
export async function demoRequest(path: string, init: RequestInit, token: string | null): Promise<unknown> {
  const url = new URL(path, "http://demo.local");
  const method = (init.method ?? "GET").toUpperCase();
  const u = currentUser(token);
  const need = () => {
    if (!u) throw new HttpError(401, "sesion_invalida");
    return u;
  };
  const form = init.body instanceof FormData ? init.body : null;
  const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
  await wait(120); // como una red rápida, para que se vean los estados de carga
  for (const [m, re, h] of routes) {
    const hit = m === method && re.exec(url.pathname);
    if (!hit) continue;
    try {
      return structuredClone(await h({ u, need, body, params: hit.slice(1), qs: url.searchParams, form }));
    } catch (err) {
      if (err instanceof ZodError) throw new HttpError(400, "datos_invalidos", err.issues.map((i) => ({ path: i.path, message: i.message })));
      throw err;
    }
  }
  throw new HttpError(404, "solicitud_invalida");
}

export { HttpError as DemoHttpError };
