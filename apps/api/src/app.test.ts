/**
 * Pruebas de integración contra PostgreSQL real.
 * Requieren TEST_DATABASE_URL apuntando a una base vacía y desechable; sin ella se omiten.
 */
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

// PNG pequeño y válido para probar subidas (se crea en beforeAll).
let PNG: Buffer;

d("API del marketplace", () => {
  let pool: pg.Pool;
  let app: Awaited<ReturnType<typeof import("./app")["buildApp"]>>;

  beforeAll(async () => {
    process.env.VIDEO_AUTO = "0";
    process.env.AUTH_RATE_LIMIT = "1000";
    PNG = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#888888" } }).png().toBuffer();
    process.env.UPLOAD_DIR = await mkdtemp(join(tmpdir(), "tcu-up-"));
    pool = new pg.Pool({ connectionString: url });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    const dir = join(import.meta.dirname, "..", "db", "migrations");
    for (const f of (await readdir(dir)).sort()) await pool.query(await readFile(join(dir, f), "utf8"));
    const { buildApp } = await import("./app");
    const { MockVehicleDataProvider } = await import("./providers/vehicle-data");
    app = await buildApp({ db: pool, provider: new MockVehicleDataProvider() });
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  const post = (path: string, body: unknown, token?: string) =>
    app.inject({ method: "POST", url: path, payload: body as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

  const sellerProfile = { docType: "CC", docNumber: "1020304050", address: "Cra 7 # 12-34", city: "Chía", phone: "3001234567" };

  async function signup(email: string, opts: { profile?: boolean; inviteCode?: string } = {}) {
    const r = await post("/api/auth/register", {
      name: "Prueba", email, password: "clave-segura", whatsapp: "300 123 4567", acceptTerms: true, inviteCode: opts.inviteCode,
    });
    expect(r.statusCode).toBe(201);
    const out = r.json() as { token: string; user: { id: string; canPublish: boolean; sellerProfileComplete: boolean } };
    if (opts.profile !== false) {
      const p = await app.inject({ method: "PUT", url: "/api/me/seller-profile", payload: sellerProfile, headers: { authorization: `Bearer ${out.token}` } });
      expect(p.statusCode).toBe(200);
    }
    return out;
  }

  async function upload(token: string, file: Buffer = PNG) {
    const boundary = "----tcu";
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const r = await app.inject({
      method: "POST",
      url: "/api/uploads",
      payload,
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(r.statusCode).toBe(201);
    return (r.json() as { url: string }).url;
  }

  /** Foto de prueba nítida y del tamaño de una cámara de celular (ruido aleatorio con semilla). */
  async function cameraPhoto(seed: number) {
    const w = 1600, h = 1200;
    const px = Buffer.alloc(w * h * 3);
    let x = seed * 9973 + 1;
    for (let i = 0; i < px.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      px[i] = 60 + (x % 140);
    }
    return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).withMetadata({ exif: { IFD0: { Make: "PruebaGPS" } } }).toBuffer();
  }

  const condition = { paint: 4, interior: 4, mechanics: 4, tires: 3, claims: "ninguno", docsUpToDate: true };

  async function publish(token: string, plate = "ABC123", price = 84_000_000) {
    const urls = await Promise.all([1, 2, 3, 4].map(() => upload(token)));
    const est = await post("/api/valuations", { plate, km: 60_000, city: "Bogotá", condition });
    const r = await post(
      "/api/listings",
      {
        plate, km: 60_000, city: "Bogotá", priceCop: price,
        title: "Mazda 3 Grand Touring 2021", description: "Carro muy bien cuidado, único dueño, mantenimientos en concesionario.",
        condition, color: "Gris", transmission: "Automática", bodyType: "Sedán", doors: 4, features: ["Frenos ABS"],
        photos: urls.map((url, i) => ({ url, slot: ["tres_cuartos", "frente", "lateral", "trasera"][i] })),
        estimateId: (est.json() as { id: string }).id,
      },
      token,
    );
    return r;
  }

  it("registra, inicia sesión y rechaza clave errada", async () => {
    await signup("ana@prueba.co");
    expect((await post("/api/auth/register", { name: "Ximena", email: "ana@prueba.co", password: "otra-clave", acceptTerms: true })).statusCode).toBe(409);
    expect((await post("/api/auth/login", { email: "ana@prueba.co", password: "mala-clave" })).statusCode).toBe(401);
    const ok = await post("/api/auth/login", { email: "ANA@prueba.co", password: "clave-segura" });
    expect(ok.statusCode).toBe(200);
    const me = await app.inject({ url: "/api/me", headers: { authorization: `Bearer ${ok.json().token}` } });
    expect(me.json().whatsapp).toBe("3001234567");
  });

  it("publica un aviso con tasación, fotos y condición", async () => {
    const { token } = await signup("vendedor@prueba.co");
    const r = await publish(token);
    expect(r.statusCode).toBe(201);
    const { id } = r.json() as { id: string };

    const detail = (await app.inject({ url: `/api/listings/${id}` })).json();
    expect(detail.brand).toBe("Mazda");
    expect(detail.photos).toHaveLength(4);
    expect(detail.estimate.low).toBeLessThan(detail.estimate.high);
    expect(detail.condition.evidence).toBe("declarado");
    expect(detail.seller.whatsapp).toBeNull(); // sin sesión no se entrega el número
  });

  it("aplica el límite de 1 aviso activo del plan gratis", async () => {
    const { token } = await signup("limite@prueba.co");
    expect((await publish(token)).statusCode).toBe(201);
    const second = await publish(token, "REN456", 70_000_000);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("limite_plan_gratis");
  });

  it("busca con filtros y facetas", async () => {
    const all = (await app.inject({ url: "/api/listings" })).json();
    expect(all.total).toBeGreaterThan(0);
    expect(all.facets.brand[0].value).toBe("Mazda");
    const none = (await app.inject({ url: "/api/listings?brand=BMW" })).json();
    expect(none.total).toBe(0);
    expect(none.facets.brand.map((f: { value: string }) => f.value)).toContain("Mazda"); // la faceta ignora su propio filtro
    const q = (await app.inject({ url: "/api/listings?q=mazda&priceMax=90000000&sort=precio_asc" })).json();
    expect(q.total).toBeGreaterThan(0);
  });

  it("preguntas, respuestas, favoritos y pausa", async () => {
    const seller = await signup("s2@prueba.co");
    const buyer = await signup("b2@prueba.co");
    const { id } = (await publish(seller.token, "TOY789", 120_000_000)).json() as { id: string };

    expect((await post(`/api/listings/${id}/questions`, { body: "¿Tiene llaves de repuesto?" }, seller.token)).statusCode).toBe(400);
    const q = await post(`/api/listings/${id}/questions`, { body: "¿Tiene llaves de repuesto?" }, buyer.token);
    expect(q.statusCode).toBe(201);
    expect((await post(`/api/questions/${q.json().id}/answer`, { answer: "No" }, buyer.token)).statusCode).toBe(403);
    expect((await post(`/api/questions/${q.json().id}/answer`, { answer: "Sí, las dos." }, seller.token)).statusCode).toBe(200);

    const auth = { authorization: `Bearer ${buyer.token}` };
    await app.inject({ method: "PUT", url: `/api/favorites/${id}`, headers: auth });
    const favs = (await app.inject({ url: "/api/me/favorites", headers: auth })).json();
    expect(favs.map((f: { id: string }) => f.id)).toContain(id);

    const detail = (await app.inject({ url: `/api/listings/${id}`, headers: auth })).json();
    expect(detail.isFavorite).toBe(true);
    expect(detail.seller.whatsapp).toBe("3001234567");
    expect(detail.questions[0].answer).toBe("Sí, las dos.");

    const pause = await app.inject({ method: "PATCH", url: `/api/listings/${id}`, payload: { status: "pausado" }, headers: { authorization: `Bearer ${seller.token}` } });
    expect(pause.statusCode).toBe(200);
    expect((await app.inject({ url: `/api/listings/${id}` })).statusCode).toBe(404);
  });

  it("rechaza archivos que no son imagen y exige sesión para subir", async () => {
    const { token } = await signup("up@prueba.co");
    const boundary = "----x";
    const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n<script>alert(1)</script>\r\n--${boundary}--\r\n`);
    const headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
    expect((await app.inject({ method: "POST", url: "/api/uploads", payload, headers })).statusCode).toBe(401);
    const r = await app.inject({ method: "POST", url: "/api/uploads", payload, headers: { ...headers, authorization: `Bearer ${token}` } });
    expect(r.json().error).toBe("formato_no_soportado");
  });

  it("valida datos y placa en la tasación", async () => {
    expect((await post("/api/valuations", { plate: "12", km: 1, city: "Bogotá", condition })).statusCode).toBe(400);
    expect((await post("/api/valuations", { plate: "ZZZ999", km: 1, city: "Bogotá", condition })).statusCode).toBe(404);
  });

  it("publica con IA: fotos, reconocimiento, confirmación, chat, video y enlace para compartir", { timeout: 120_000 }, async () => {
    const { token } = await signup("ia@prueba.co");
    const auth = { authorization: `Bearer ${token}` };

    // Fotos: la pequeña queda marcada por baja resolución; las de cámara pasan y pierden su EXIF.
    const small = await upload(token);
    const photos = [] as string[];
    for (let i = 0; i < 5; i++) photos.push(await upload(token, await cameraPhoto(i + 1)));
    const stored = await sharp(join(process.env.UPLOAD_DIR!, photos[0]!.replace("/uploads/", ""))).metadata();
    expect(stored.exif).toBeUndefined();
    expect(stored.width).toBeLessThanOrEqual(2000);

    // Fotos ajenas no se pueden usar.
    const other = await signup("otro@prueba.co");
    expect((await post("/api/drafts", { photos: [photos[0]] }, other.token)).statusCode).toBe(400);

    let r = await post("/api/drafts", { photos: [small, ...photos] }, token);
    expect(r.statusCode).toBe(201);
    let draft = r.json();
    expect(draft.data.photos[0].quality.issues).toContain("baja_resolucion");
    expect(draft.data.photos[1].quality.issues).toEqual([]);
    expect(draft.quality.items.some((i: { level: string }) => i.level === "importante")).toBe(true);

    // Sin clave de IA: reconocimiento en modo demostración y ángulos por orden.
    r = await post(`/api/drafts/${draft.id}/recognize`, {}, token);
    draft = r.json();
    expect(draft.data.recognition.source).toBe("demo");
    expect(draft.data.step).toBe("confirmar");
    expect(draft.data.photos[0].slot).toBe("tres_cuartos");

    // Quita la foto pequeña.
    r = await app.inject({ method: "PUT", url: `/api/drafts/${draft.id}/photos`, headers: auth, payload: { photos: draft.data.photos.slice(1).map((p: { url: string; slot: string }, i: number, all: unknown[]) => ({ url: p.url, slot: i === all.length - 1 ? "tres_cuartos" : p.slot })) } });
    expect(r.json().data.photos).toHaveLength(5);

    r = await post(`/api/drafts/${draft.id}/confirm`, {
      plate: "BMW320", km: 85_000, city: "Medellín",
      details: { color: "Negro", transmission: "Automática", bodyType: "Sedán", doors: 4, armored: false, features: ["Frenos ABS"], condition },
    }, token);
    expect(r.statusCode).toBe(200);
    draft = r.json();
    expect(draft.data.step).toBe("editar");
    expect(draft.data.vehicle.brand).toBe("BMW");
    expect(draft.data.match).toBe("sin_dato");
    expect(draft.data.listing.priceCop).toBe(draft.data.valuation.mid);
    expect(draft.data.chat[0].role).toBe("assistant");

    // Chat (reglas sin IA): precio y agregar un dato.
    r = await post(`/api/drafts/${draft.id}/chat`, { message: "ponga el precio en 99,5 millones" }, token);
    expect(r.json().data.listing.priceCop).toBe(99_500_000);
    r = await post(`/api/drafts/${draft.id}/chat`, { message: "agregue que tiene llantas nuevas" }, token);
    expect(r.json().data.listing.description).toContain("Tiene llantas nuevas.");

    process.env.VIDEO_AUTO = "1";
    r = await post(`/api/drafts/${draft.id}/publish`, {}, token);
    expect(r.statusCode).toBe(200);
    const { listingId } = r.json();
    const detail = (await app.inject({ url: `/api/listings/${listingId}` })).json();
    expect(detail.priceCop).toBe(99_500_000);
    expect(detail.photos).toHaveLength(5);

    // Publicar dos veces no duplica.
    expect((await post(`/api/drafts/${draft.id}/publish`, {}, token)).json().listingId).toBe(listingId);

    // Video para redes.
    let v = (await app.inject({ url: `/api/listings/${listingId}/video` })).json();
    for (let i = 0; i < 90 && v.status === "en_proceso"; i++) {
      await new Promise((ok) => setTimeout(ok, 1000));
      v = (await app.inject({ url: `/api/listings/${listingId}/video` })).json();
    }
    expect(v.status).toBe("listo");
    expect(v.url).toMatch(/\.mp4$/);

    // Enlace para compartir con vista previa.
    const share = await app.inject({ url: `/api/share/${listingId}` });
    expect(share.headers["content-type"]).toContain("text/html");
    expect(share.body).toContain('property="og:image"');
    expect(share.body).toMatch(/99\.500\.000/);
  });

  it("placa que no aparece: el vendedor escribe el carro y pone el precio", { timeout: 60_000 }, async () => {
    const { token } = await signup("chia@prueba.co");
    const auth = { authorization: `Bearer ${token}` };
    const photos = [] as string[];
    for (let i = 0; i < 4; i++) photos.push(await upload(token, await cameraPhoto(i + 11)));
    let draft = (await post("/api/drafts", { photos }, token)).json();
    draft = (await post(`/api/drafts/${draft.id}/recognize`, {}, token)).json();
    const details = { color: "Gris", transmission: "Mecánica", bodyType: "Hatchback", doors: 5, armored: false, features: [], condition };

    let r = await post(`/api/drafts/${draft.id}/confirm`, { plate: "JVP019", km: 62_000, city: "Chía", details }, token);
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toBe("placa_no_encontrada");

    r = await post(`/api/drafts/${draft.id}/confirm`, {
      plate: "JVP019", km: 62_000, city: "Chía", details,
      vehicle: { brand: "Chevrolet", line: "Onix", version: "LT 1.4", modelYear: 2019, fuel: "Gasolina" },
    }, token);
    expect(r.statusCode).toBe(200);
    draft = r.json();
    expect(draft.data.vehicle).toMatchObject({ brand: "Chevrolet", source: "manual", fasecoldaValue: null });
    expect(draft.data.valuation).toBeNull();
    expect(draft.data.listing.priceCop).toBe(0);
    expect(draft.quality.items.some((i: { text: string }) => i.text.startsWith("Escriba el precio"))).toBe(true);

    // Sin precio no publica.
    expect((await post(`/api/drafts/${draft.id}/publish`, {}, token)).statusCode).toBe(400);
    await app.inject({ method: "PATCH", url: `/api/drafts/${draft.id}/listing`, headers: auth, payload: { priceCop: 45_000_000 } });

    // Sin una foto obligatoria (la trasera) tampoco.
    const all = draft.data.photos.map((p: { url: string; slot: string }) => ({ url: p.url, slot: p.slot }));
    const put = (ps: unknown[]) => app.inject({ method: "PUT", url: `/api/drafts/${draft.id}/photos`, headers: auth, payload: { photos: ps } });
    await put(all.filter((p: { slot: string }) => p.slot !== "trasera"));
    r = await post(`/api/drafts/${draft.id}/publish`, {}, token);
    expect(r.json().error).toBe("fotos_obligatorias");
    await put(all);

    // Con precio y fotos completas sí publica, y sin rango de precio justo.
    r = await post(`/api/drafts/${draft.id}/publish`, {}, token);
    expect(r.statusCode).toBe(200);
    const detail = (await app.inject({ url: `/api/listings/${r.json().listingId}` })).json();
    expect(detail).toMatchObject({ brand: "Chevrolet", line: "Onix", modelYear: 2019, city: "Chía", fair: null, estimate: null });
  });


  it("lanzamiento: autorización de datos, datos del vendedor, invitaciones y configuración pública", async () => {
    // Sin aceptar términos no hay cuenta; al aceptarlos queda la versión y la fecha.
    expect((await post("/api/auth/register", { name: "Sin", email: "sin@prueba.co", password: "clave-segura" })).statusCode).toBe(400);
    const a = await signup("legal@prueba.co", { profile: false });
    const { rows } = await pool.query("SELECT legal_version, legal_accepted_at FROM users WHERE id = $1", [a.user.id]);
    expect(rows[0].legal_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rows[0].legal_accepted_at).toBeTruthy();
    expect(a.user.sellerProfileComplete).toBe(false);

    // Publicar exige los datos del vendedor (art. 53, Ley 1480 de 2011).
    let r = await publish(a.token);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("datos_vendedor");
    const bad = await app.inject({ method: "PUT", url: "/api/me/seller-profile", payload: { ...sellerProfile, phone: "12" }, headers: { authorization: `Bearer ${a.token}` } });
    expect(bad.statusCode).toBe(400);

    // Beta con código: sin código no publica; con el código sí.
    process.env.BETA_INVITE_CODE = "RUTA2026";
    try {
      const b = await signup("beta@prueba.co");
      expect(b.user.canPublish).toBe(false);
      r = await post("/api/drafts", { photos: [await upload(b.token)] }, b.token);
      expect(r.statusCode).toBe(403);
      expect(r.json().error).toBe("invitacion_requerida");
      expect((await post("/api/me/invite", { code: "otro" }, b.token)).statusCode).toBe(400);
      r = await post("/api/me/invite", { code: "ruta2026" }, b.token);
      expect(r.json().canPublish).toBe(true);
      const c = await signup("beta2@prueba.co", { inviteCode: "RUTA2026" });
      expect(c.user.canPublish).toBe(true);
      expect((await post("/api/auth/register", { name: "X", email: "beta3@prueba.co", password: "clave-segura", acceptTerms: true, inviteCode: "mal" })).statusCode).toBe(400);
      const cfg = (await app.inject({ url: "/api/config" })).json();
      expect(cfg).toMatchObject({ beta: true, invitesRequired: true, provider: "mock" });
      expect(cfg.demoPlates).toContain("ABC123");
    } finally {
      delete process.env.BETA_INVITE_CODE;
    }
  });
});
