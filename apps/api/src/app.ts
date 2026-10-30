import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import {
  BRAND,
  draftChatSchema,
  draftConfirmSchema,
  draftCreateSchema,
  draftListingPatchSchema,
  draftPhotosSchema,
  draftRequestSchema,
  formatCOP,
  listingCreateSchema,
  listingSearchSchema,
  listingUpdateSchema,
  loginSchema,
  plateSchema,
  registerSchema,
  sellerProfileSchema,
  valuationRequestSchema,
  waitlistSchema,
} from "@tcu/shared";
import Fastify, { type FastifyRequest } from "fastify";
import type pg from "pg";
import { z, ZodError } from "zod";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { siteConfig } from "./config";
import { MockVehicleDataProvider, type VehicleDataProvider } from "./providers/vehicle-data";
import { draftListing } from "./services/ai-draft";
import { AuthError, assertCanPublishInBeta, assertSellerProfile, getUser, login, readToken, redeemInvite, register, saveSellerProfile } from "./services/auth";
import {
  ListingError,
  answerQuestion,
  askQuestion,
  createListing,
  getListing,
  myFavorites,
  myListings,
  searchListings,
  setFavorite,
  similarListings,
  updateListing,
} from "./services/listings";
import { keyOf, storage, LocalStorage } from "./services/storage";
import { MAX_PHOTO_BYTES, UploadError, savePhoto } from "./services/uploads";
import { aiEnabled } from "./services/ai";
import {
  DraftError,
  chatDraft,
  confirmDraft,
  createDraft,
  getDraft,
  patchDraftListing,
  publishDraft,
  recognizeDraft,
  setPhotos,
} from "./services/drafts";
import { queueVideo, videoStatus } from "./services/video";
import { VehicleNotFoundError, valuate } from "./services/valuation";

const idParam = z.object({ id: z.string().uuid() });

export async function buildApp(deps: { db: pg.Pool; provider: VehicleDataProvider }) {
  const { db, provider } = deps;
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 256 * 1024,
    // Detrás del proxy del hosting: la IP real del visitante (para los límites por IP).
    trustProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY === "1" : process.env.NODE_ENV === "production",
  });

  await app.register(cors, { origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(",") : true });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "strict-origin-when-cross-origin");
    reply.header("x-frame-options", "DENY");
    reply.header("permissions-policy", "camera=(self), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
  });

  // Fotos y videos: del disco en desarrollo; en producción, redirección al almacenamiento S3/R2.
  const files = storage();
  if (files instanceof LocalStorage) {
    await app.register(fastifyStatic, { root: files.root, prefix: "/uploads/", decorateReply: false });
  } else {
    app.get("/uploads/*", async (req, reply) => {
      const key = keyOf((req.params as { "*": string })["*"]);
      return reply.header("cache-control", "public, max-age=86400").redirect(files.publicUrl(key)!, 301);
    });
  }
  /** Dirección pública directa de un archivo (para redes sociales, que no siempre siguen redirecciones). */
  const publicAsset = (url: string, base: string) => files.publicUrl(keyOf(url)) ?? `${base}${url}`;

  /** Lee la sesión si viene; no la exige. */
  const viewer = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    return h?.startsWith("Bearer ") ? readToken(h.slice(7)) : null;
  };
  /** Exige sesión válida y devuelve el id del usuario. */
  const requireUser = (req: FastifyRequest) => {
    const id = viewer(req);
    if (!id) throw new AuthError("sesion_invalida", 401);
    return id;
  };
  /** Registro, ingreso, preguntas e invitaciones: 10 por minuto por IP (AUTH_RATE_LIMIT para pruebas). */
  const authLimit = { config: { rateLimit: { max: Number(process.env.AUTH_RATE_LIMIT ?? 10), timeWindow: "1 minute" } } };
  /** Las consultas a Fasecolda/RUNT cuestan: límite más estricto. */
  const paidLookup = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: "datos_invalidos", issues: err.issues });
    if (err instanceof VehicleNotFoundError) return reply.status(404).send({ error: "placa_no_encontrada" });
    if (err instanceof AuthError || err instanceof ListingError || err instanceof DraftError) return reply.status(err.status).send({ error: err.code });
    if (err instanceof UploadError) return reply.status(400).send({ error: err.code });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") return reply.status(413).send({ error: "archivo_muy_grande" });
    return reply.status(status).send({ error: status === 429 ? "demasiadas_solicitudes" : status < 500 ? "solicitud_invalida" : "error_interno" });
  });

  app.get("/health", async () => {
    await db.query("SELECT 1");
    return { ok: true, provider: provider.name, ai: aiEnabled(), storage: files.kind };
  });
  app.get("/api/config", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return siteConfig(process.env, {
      ai: aiEnabled(),
      provider: provider.name,
      demoPlates: provider instanceof MockVehicleDataProvider ? MockVehicleDataProvider.demoPlates : [],
    });
  });
  const logErr = (e: unknown) => app.log.error(e);

  // ───────────── Cuentas ─────────────
  app.post("/api/auth/register", authLimit, async (req, reply) =>
    reply.status(201).send(await register(db, registerSchema.parse(req.body))),
  );
  app.post("/api/auth/login", authLimit, async (req) => {
    const { email, password } = loginSchema.parse(req.body);
    return login(db, email, password);
  });
  app.get("/api/me", async (req) => {
    const user = await getUser(db, requireUser(req));
    if (!user) throw new AuthError("sesion_invalida", 401);
    return user;
  });
  app.post("/api/me/invite", authLimit, async (req) =>
    redeemInvite(db, requireUser(req), z.object({ code: z.string().trim().min(1).max(40) }).parse(req.body).code),
  );
  app.put("/api/me/seller-profile", async (req) => saveSellerProfile(db, requireUser(req), sellerProfileSchema.parse(req.body)));
  app.get("/api/me/listings", async (req) => myListings(db, requireUser(req)));
  app.get("/api/me/favorites", async (req) => myFavorites(db, requireUser(req)));

  // ───────────── Tasación y datos del vehículo ─────────────
  app.get("/api/demo-plates", async () =>
    provider instanceof MockVehicleDataProvider ? MockVehicleDataProvider.demoPlates : [],
  );
  app.post("/api/valuations", paidLookup, async (req) => valuate(db, provider, valuationRequestSchema.parse(req.body)));
  app.post("/api/vehicles/lookup", paidLookup, async (req) => {
    requireUser(req);
    const plate = plateSchema.parse((req.body as { plate?: unknown } | undefined)?.plate);
    const v = await provider.lookupByPlate(plate);
    if (!v) throw new VehicleNotFoundError(plate);
    return v;
  });
  app.post("/api/waitlist", async (req, reply) => {
    const { email, valuationId } = waitlistSchema.parse(req.body);
    await db.query(
      `INSERT INTO waitlist (email, estimate_id) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET estimate_id = COALESCE(EXCLUDED.estimate_id, waitlist.estimate_id)`,
      [email.toLowerCase(), valuationId ?? null],
    );
    return reply.status(201).send({ ok: true });
  });

  // ───────────── Publicación asistida ─────────────
  app.post("/api/uploads", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const userId = requireUser(req);
    const file = await req.file();
    if (!file) throw new UploadError("sin_archivo");
    const buf = await file.toBuffer();
    return reply.status(201).send(await savePhoto(db, userId, buf));
  });
  app.post("/api/ai/listing-draft", paidLookup, async (req) => {
    requireUser(req);
    const input = draftRequestSchema.parse(req.body);
    const vehicle = await provider.lookupByPlate(input.plate);
    if (!vehicle) throw new VehicleNotFoundError(input.plate);
    return draftListing({ ...input, vehicle });
  });

  // ───────────── Avisos ─────────────
  app.get("/api/listings", async (req) => searchListings(db, listingSearchSchema.parse(req.query)));
  app.get("/api/listings/:id", async (req) => getListing(db, idParam.parse(req.params).id, viewer(req)));
  app.get("/api/listings/:id/similar", async (req) => similarListings(db, idParam.parse(req.params).id));
  app.post("/api/listings", async (req, reply) => {
    const userId = requireUser(req);
    await assertCanPublishInBeta(db, userId);
    await assertSellerProfile(db, userId);
    const created = await createListing(db, provider, userId, listingCreateSchema.parse(req.body));
    void queueVideo(db, created.id, logErr, { auto: true });
    return reply.status(201).send(created);
  });
  app.patch("/api/listings/:id", async (req) => {
    await updateListing(db, requireUser(req), idParam.parse(req.params).id, listingUpdateSchema.parse(req.body));
    return { ok: true };
  });

  app.post("/api/listings/:id/questions", authLimit, async (req, reply) => {
    const { body } = z.object({ body: z.string().trim().min(5, "Mínimo 5 caracteres").max(500) }).parse(req.body);
    return reply.status(201).send(await askQuestion(db, requireUser(req), idParam.parse(req.params).id, body));
  });
  app.post("/api/questions/:id/answer", async (req) => {
    const { answer } = z.object({ answer: z.string().trim().min(1).max(1000) }).parse(req.body);
    await answerQuestion(db, requireUser(req), idParam.parse(req.params).id, answer);
    return { ok: true };
  });

  // ───────────── Publicar con IA: borradores ─────────────
  const aiLimit = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
  app.post("/api/drafts", async (req, reply) => {
    const userId = requireUser(req);
    await assertCanPublishInBeta(db, userId);
    return reply.status(201).send(await createDraft(db, userId, draftCreateSchema.parse(req.body).photos));
  });
  app.get("/api/drafts/:id", async (req) => getDraft(db, requireUser(req), idParam.parse(req.params).id));
  app.put("/api/drafts/:id/photos", async (req) =>
    setPhotos(db, requireUser(req), idParam.parse(req.params).id, draftPhotosSchema.parse(req.body).photos),
  );
  app.post("/api/drafts/:id/recognize", aiLimit, async (req) => recognizeDraft(db, requireUser(req), idParam.parse(req.params).id));
  app.post("/api/drafts/:id/confirm", paidLookup, async (req) =>
    confirmDraft(db, provider, requireUser(req), idParam.parse(req.params).id, draftConfirmSchema.parse(req.body)),
  );
  app.patch("/api/drafts/:id/listing", async (req) =>
    patchDraftListing(db, requireUser(req), idParam.parse(req.params).id, draftListingPatchSchema.parse(req.body)),
  );
  app.post("/api/drafts/:id/chat", aiLimit, async (req) =>
    chatDraft(db, requireUser(req), idParam.parse(req.params).id, draftChatSchema.parse(req.body).message),
  );
  app.post("/api/drafts/:id/publish", async (req) => {
    const userId = requireUser(req);
    await assertCanPublishInBeta(db, userId);
    await assertSellerProfile(db, userId);
    const r = await publishDraft(db, provider, userId, idParam.parse(req.params).id);
    void queueVideo(db, r.listingId, logErr, { auto: true });
    return r;
  });

  // ───────────── Video para redes y página para compartir ─────────────
  app.get("/api/listings/:id/video", async (req) => videoStatus(db, idParam.parse(req.params).id));
  app.post("/api/listings/:id/video", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const userId = requireUser(req);
    const id = idParam.parse(req.params).id;
    const own = await db.query("SELECT 1 FROM listings WHERE id = $1 AND seller_id = $2", [id, userId]);
    if (!own.rowCount) throw new ListingError("aviso_no_encontrado", 404);
    void queueVideo(db, id, logErr);
    return reply.status(202).send({ status: "en_proceso" });
  });

  /**
   * Enlace para compartir: entrega a WhatsApp, Facebook y X la vista previa (Open Graph) con foto,
   * modelo y precio, y lleva a las personas a la página del aviso.
   */
  app.get("/api/share/:id", async (req, reply) => {
    const id = idParam.parse(req.params).id;
    const base = (process.env.PUBLIC_URL ?? `${req.protocol}://${req.headers.host}`).replace(/\/$/, "");
    const { rows } = await db.query<{ title: string; price_cop: string; km: number; city: string; cover: string | null; video: string | null }>(
      `SELECT l.title, l.price_cop, l.km, l.city,
              (SELECT url FROM listing_photos p WHERE p.listing_id = l.id ORDER BY position LIMIT 1) AS cover,
              (SELECT url FROM listing_videos v WHERE v.listing_id = l.id AND v.status = 'listo') AS video
         FROM listings l WHERE l.id = $1 AND l.status = 'activo'`,
      [id],
    );
    const r = rows[0];
    const target = `${base}/carros/${id}`;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const title = r ? `${r.title} | ${formatCOP(Number(r.price_cop))}` : BRAND.name;
    const desc = r ? `${r.km.toLocaleString("es-CO")} km en ${r.city}. Precio justo calculado con Fasecolda y el mercado. ${BRAND.slogan}` : BRAND.slogan;
    const img = r?.cover ? publicAsset(r.cover, base) : "";
    reply.header("content-type", "text/html; charset=utf-8").header("cache-control", "public, max-age=300");
    return `<!doctype html><html lang="es-CO"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(BRAND.name)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(target)}">${img ? `<meta property="og:image" content="${esc(img)}">` : ""}
${r?.video ? `<meta property="og:video" content="${esc(publicAsset(r.video, base))}"><meta property="og:video:type" content="video/mp4">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
</head><body><a href="${esc(target)}">Ver el aviso en ${esc(BRAND.name)}</a></body></html>`;
  });

  app.put("/api/favorites/:id", async (req) => {
    await setFavorite(db, requireUser(req), idParam.parse(req.params).id, true);
    return { ok: true };
  });
  app.delete("/api/favorites/:id", async (req) => {
    await setFavorite(db, requireUser(req), idParam.parse(req.params).id, false);
    return { ok: true };
  });

  // ───────────── La web (producción: un solo servidor para el sitio y la API) ─────────────
  const webDist = process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null;
  if (webDist && existsSync(join(webDist, "index.html"))) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      decorateReply: true,
      wildcard: false,
      setHeaders: (res, path) => {
        // Los archivos de /assets llevan huella en el nombre: se pueden guardar un año.
        res.header("cache-control", /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    // Rutas del sitio (/carros/…, /publicar…): siempre index.html; React Router decide.
    app.setNotFoundHandler((req, reply) => {
      if ((req.method === "GET" || req.method === "HEAD") && !req.url.startsWith("/api/") && !req.url.startsWith("/uploads/")) {
        return reply.header("cache-control", "no-cache").sendFile("index.html");
      }
      return reply.status(404).send({ error: "no_encontrado" });
    });
  }

  return app;
}
