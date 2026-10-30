import {
  valuationRequestSchema,
  type Draft,
  type DraftConfirmInput,
  type ListingCard,
  type PhotoQuality,
  type PhotoSlot,
  type ListingCreateInput,
  type ListingDetail,
  type ListingSearchInput,
  type MyListing,
  type PublicUser,
  type RegisterInput,
  type SellerProfile,
  type SiteConfig,
  type SearchResponse,
  type ValuationRequest,
  type ValuationResult,
  type VehicleInfo,
} from "@tcu/shared";
import { getToken } from "./session";

/** Vacío = mismo dominio (en desarrollo, Vite reenvía /api a la API). */
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");

/** Demostración en el navegador (VITE_DEMO=1): las rutas de la API las atiende `demo-api.ts`. */
export const DEMO = !!import.meta.env.VITE_DEMO;
interface DemoBackend {
  request: (path: string, init: RequestInit, token: string | null) => Promise<unknown>;
  asset: (url: string) => string | undefined;
}
let demo: DemoBackend | null = null;
export const installDemoBackend = (b: DemoBackend) => {
  demo = b;
};

/** Ruta pública de una foto (las de /uploads viven en la API). */
export const assetUrl = (u: string | null | undefined) =>
  u ? (u.startsWith("/uploads/") ? (demo?.asset(u) ?? `${BASE}${u}`) : u) : "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (demo) {
    try {
      return (await demo.request(path, init, token)) as T;
    } catch (err) {
      const e = err as { status?: number; code?: string; issues?: ApiError["issues"] };
      if (e.status && e.code) throw new ApiError(e.status, e.code, e.issues);
      throw new ApiError(500, "error_interno");
    }
  }
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: ApiError["issues"] };
    throw new ApiError(res.status, body.error ?? "error_interno", body.issues);
  }
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** Mensajes para las personas, por código de error de la API. */
export const ERROR_TEXT: Record<string, string> = {
  credenciales_invalidas: "El correo o la contraseña no coinciden.",
  correo_registrado: "Ya hay una cuenta con ese correo. Inicie sesión.",
  sesion_invalida: "Su sesión venció. Inicie sesión de nuevo.",
  placa_no_encontrada: "No encontramos esa placa. Revise que esté bien escrita.",
  limite_plan_gratis: "El plan gratis permite un aviso activo. Pause o marque como vendido el que tiene para publicar otro.",
  formato_no_soportado: "Esa foto no es JPG, PNG ni WebP.",
  archivo_muy_grande: "La foto pesa más de 12 MB.",
  aviso_no_encontrado: "Este aviso ya no está disponible.",
  demasiadas_solicitudes: "Demasiados intentos seguidos. Espere un minuto.",
  datos_invalidos: "Revise los datos marcados.",
  codigo_invitacion: "Ese código de invitación no es válido. Revíselo o pídale uno al equipo.",
  invitacion_requerida: "Durante la beta solo publican vendedores invitados. Escriba su código de invitación.",
  datos_vendedor: "Antes de publicar complete sus datos de vendedor.",
  pregunta_propia: "No puede preguntar en su propio aviso.",
  imagen_danada: "No pudimos abrir esa foto. Pruebe con otra.",
  fotos_invalidas: "Alguna foto no se pudo usar. Súbala de nuevo.",
  borrador_no_encontrado: "No encontramos ese borrador.",
  paso_invalido: "Complete el paso anterior primero.",
  fotos_obligatorias: "Faltan fotos obligatorias o alguna no corresponde a su ángulo. Revise las marcadas en rojo.",
};
export const errorText = (e: unknown) =>
  e instanceof ApiError ? (ERROR_TEXT[e.code] ?? "Algo falló. Inténtelo de nuevo.") : "No hay conexión con el servidor.";

export const api = {
  register: (b: RegisterInput) => request<{ token: string; user: PublicUser }>("/api/auth/register", json("POST", b)),
  login: (email: string, password: string) =>
    request<{ token: string; user: PublicUser }>("/api/auth/login", json("POST", { email, password })),
  me: () => request<PublicUser>("/api/me"),
  myListings: () => request<MyListing[]>("/api/me/listings"),
  myFavorites: () => request<ListingCard[]>("/api/me/favorites"),

  search: (params: ListingSearchInput) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    return request<SearchResponse>(`/api/listings?${qs}`);
  },
  listing: (id: string) => request<ListingDetail>(`/api/listings/${id}`),
  similar: (id: string) => request<ListingCard[]>(`/api/listings/${id}/similar`),
  createListing: (b: ListingCreateInput) => request<{ id: string }>("/api/listings", json("POST", b)),
  updateListing: (id: string, b: { priceCop?: number; status?: "activo" | "pausado" | "vendido"; description?: string }) =>
    request<{ ok: true }>(`/api/listings/${id}`, json("PATCH", b)),
  ask: (id: string, body: string) => request<{ id: string }>(`/api/listings/${id}/questions`, json("POST", { body })),
  answer: (id: string, answer: string) => request<{ ok: true }>(`/api/questions/${id}/answer`, json("POST", { answer })),
  favorite: (id: string, on: boolean) => request<{ ok: true }>(`/api/favorites/${id}`, { method: on ? "PUT" : "DELETE" }),

  lookup: (plate: string) => request<VehicleInfo>("/api/vehicles/lookup", json("POST", { plate })),
  draft: (b: unknown) => request<{ title: string; description: string; source: "ia" | "plantilla" }>("/api/ai/listing-draft", json("POST", b)),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ url: string; quality: PhotoQuality }>("/api/uploads", { method: "POST", body: fd });
  },

  // Publicar con IA
  createDraft: (photos: string[]) => request<Draft>("/api/drafts", json("POST", { photos })),
  getDraft: (id: string) => request<Draft>(`/api/drafts/${id}`),
  setDraftPhotos: (id: string, photos: { url: string; slot: PhotoSlot | null; slotConfirmed?: boolean }[]) =>
    request<Draft>(`/api/drafts/${id}/photos`, json("PUT", { photos })),
  recognize: (id: string) => request<Draft>(`/api/drafts/${id}/recognize`, { method: "POST" }),
  confirmDraft: (id: string, b: DraftConfirmInput) => request<Draft>(`/api/drafts/${id}/confirm`, json("POST", b)),
  patchDraftListing: (id: string, b: { title?: string; description?: string; priceCop?: number }) =>
    request<Draft>(`/api/drafts/${id}/listing`, json("PATCH", b)),
  chat: (id: string, message: string) => request<Draft>(`/api/drafts/${id}/chat`, json("POST", { message })),
  publishDraft: (id: string) => request<{ draft: Draft; listingId: string }>(`/api/drafts/${id}/publish`, { method: "POST" }),

  // Video y compartir
  video: (listingId: string) =>
    request<{ status: "sin_video" | "en_proceso" | "listo" | "error"; url: string | null; posterUrl: string | null; ext?: string }>(`/api/listings/${listingId}/video`),
  regenerateVideo: (listingId: string) => request<{ status: string }>(`/api/listings/${listingId}/video`, { method: "POST" }),
  joinWaitlist: (email: string, valuationId?: string) => request<{ ok: true }>("/api/waitlist", json("POST", { email, valuationId })),
  demoPlates: () => request<string[]>("/api/demo-plates"),
  config: () => request<SiteConfig>("/api/config"),
  redeemInvite: (code: string) => request<PublicUser>("/api/me/invite", json("POST", { code })),
  saveSellerProfile: (b: SellerProfile) => request<PublicUser>("/api/me/seller-profile", json("PUT", b)),
};

// ───────────── Tasación ─────────────

/** `demo`: valores de prueba (proveedor de prueba o demostración en el navegador), no de Fasecolda. */
export type Valuation = ValuationResult & { id?: string; demo: boolean };
export class PlateNotFoundError extends Error {}

export async function requestValuation(input: ValuationRequest, demoValues = DEMO): Promise<Valuation> {
  const req = valuationRequestSchema.parse(input);
  try {
    return { ...(await request<ValuationResult & { id: string }>("/api/valuations", json("POST", req))), demo: demoValues };
  } catch (err) {
    if (err instanceof ApiError && err.code === "placa_no_encontrada") throw new PlateNotFoundError(req.plate);
    throw err;
  }
}

/** Enlace con vista previa (foto, modelo y precio) para WhatsApp, Facebook y X. */
export const shareUrl = (listingId: string) =>
  DEMO ? `${window.location.href.split("#")[0]}#/carros/${listingId}` : `${BASE || window.location.origin}/api/share/${listingId}`;
