import {
  FREE_ACTIVE_LISTINGS,
  FREE_LISTING_DAYS,
  conditionBreakdown,
  conditionScore,
  type Adjustment,
  type Facet,
  type ListingCard,
  type ListingCreateInput,
  type ListingDetail,
  type ListingSearch,
  type MyListing,
  type SearchResponse,
} from "@tcu/shared";
import type pg from "pg";
import type { Queryable } from "../db";
import type { VehicleDataProvider } from "../providers/vehicle-data";
import { hashPlate, VehicleNotFoundError } from "./valuation";

export class ListingError extends Error {
  constructor(
    readonly code:
      | "aviso_no_encontrado"
      | "no_autorizado"
      | "limite_plan_gratis"
      | "tasacion_invalida"
      | "pregunta_propia",
    readonly status: number,
  ) {
    super(code);
  }
}

// ───────────────────────── Búsqueda ─────────────────────────

const FROM = `
  FROM listings l
  JOIN vehicles ve ON ve.id = l.vehicle_id
  JOIN users u ON u.id = l.seller_id
  LEFT JOIN price_estimates pe ON pe.id = l.estimate_id`;

const CARD_COLS = `
  l.id, l.title, l.price_cop, l.km, l.city, l.created_at, l.condition_score,
  ve.brand, ve.line, ve.model_year, ve.fuel, ve.transmission,
  u.kind AS seller_kind,
  pe.low, pe.mid, pe.high,
  (SELECT p.url FROM listing_photos p WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS cover`;

interface CardRow {
  id: string;
  title: string;
  price_cop: string;
  km: number;
  city: string;
  created_at: Date;
  condition_score: number | null;
  brand: string;
  line: string;
  model_year: number;
  fuel: string | null;
  transmission: string | null;
  seller_kind: "particular" | "profesional";
  low: string | null;
  mid: string | null;
  high: string | null;
  cover: string | null;
}

const toCard = (r: CardRow): ListingCard => ({
  id: r.id,
  title: r.title,
  priceCop: Number(r.price_cop),
  km: r.km,
  city: r.city,
  brand: r.brand,
  line: r.line,
  modelYear: r.model_year,
  fuel: r.fuel,
  transmission: r.transmission,
  sellerKind: r.seller_kind,
  cover: r.cover,
  fair: r.mid ? { low: Number(r.low), mid: Number(r.mid), high: Number(r.high) } : null,
  conditionScore: r.condition_score,
  createdAt: r.created_at.toISOString(),
});

type FilterKey = keyof Omit<ListingSearch, "sort" | "page" | "pageSize">;

/** Arma el WHERE con parámetros numerados; `skip` deja fuera un filtro (para contar sus facetas). */
function buildWhere(f: ListingSearch, skip?: FilterKey) {
  const conds = ["l.status = 'activo'"];
  const params: unknown[] = [];
  const add = (key: FilterKey, sql: string, value: unknown) => {
    if (value === undefined || key === skip) return;
    params.push(value);
    conds.push(sql.replaceAll("?", `$${params.length}`));
  };
  add("q", "(l.search @@ websearch_to_tsquery('spanish', ?) OR (ve.brand || ' ' || ve.line) ILIKE '%' || ? || '%')", f.q);
  add("brand", "lower(ve.brand) = lower(?)", f.brand);
  add("line", "lower(ve.line) = lower(?)", f.line);
  add("city", "l.city = ?", f.city);
  add("fuel", "ve.fuel = ?", f.fuel);
  add("transmission", "ve.transmission = ?", f.transmission);
  add("bodyType", "ve.body_type = ?", f.bodyType);
  add("seller", "u.kind = ?", f.seller);
  add("yearMin", "ve.model_year >= ?", f.yearMin);
  add("yearMax", "ve.model_year <= ?", f.yearMax);
  add("priceMin", "l.price_cop >= ?", f.priceMin);
  add("priceMax", "l.price_cop <= ?", f.priceMax);
  add("kmMax", "l.km <= ?", f.kmMax);
  if (f.fair === "bajo" && skip !== "fair") conds.push("pe.low IS NOT NULL AND l.price_cop < pe.low");
  if (f.fair === "en_rango" && skip !== "fair") conds.push("pe.low IS NOT NULL AND l.price_cop BETWEEN pe.low AND pe.high");
  return { where: `WHERE ${conds.join(" AND ")}`, params };
}

const ORDER: Record<ListingSearch["sort"], string> = {
  recientes: "l.created_at DESC",
  precio_asc: "l.price_cop ASC",
  precio_desc: "l.price_cop DESC",
  km_asc: "l.km ASC",
  modelo_desc: "ve.model_year DESC, l.created_at DESC",
};

async function facet(db: Queryable, f: ListingSearch, key: FilterKey, column: string): Promise<Facet[]> {
  const { where, params } = buildWhere(f, key);
  const { rows } = await db.query<{ value: string; count: string }>(
    `SELECT ${column} AS value, count(*) AS count ${FROM} ${where} AND ${column} IS NOT NULL
     GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 30`,
    params,
  );
  return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
}

export async function searchListings(db: Queryable, f: ListingSearch): Promise<SearchResponse> {
  const { where, params } = buildWhere(f);
  const offset = (f.page - 1) * f.pageSize;
  const [items, total, brand, city, fuel] = await Promise.all([
    db.query<CardRow>(
      `SELECT ${CARD_COLS} ${FROM} ${where} ORDER BY ${ORDER[f.sort]}, l.id LIMIT ${f.pageSize} OFFSET ${offset}`,
      params,
    ),
    db.query<{ n: string }>(`SELECT count(*) AS n ${FROM} ${where}`, params),
    facet(db, f, "brand", "ve.brand"),
    facet(db, f, "city", "l.city"),
    facet(db, f, "fuel", "ve.fuel"),
  ]);
  return {
    items: items.rows.map(toCard),
    total: Number(total.rows[0]?.n ?? 0),
    page: f.page,
    pageSize: f.pageSize,
    facets: { brand, city, fuel },
  };
}

// ───────────────────────── Detalle ─────────────────────────

export async function getListing(db: Queryable, id: string, viewerId: string | null): Promise<ListingDetail> {
  const { rows } = await db.query<
    CardRow & {
      version: string | null;
      description: string | null;
      color: string | null;
      body_type: string | null;
      doors: number | null;
      armored: boolean;
      features: string[];
      status: ListingDetail["status"];
      views: number;
      expires_at: Date | null;
      seller_id: string;
      seller_name: string | null;
      seller_email: string;
      seller_since: Date;
      seller_whatsapp: string | null;
      fasecolda_value: string | null;
      comparables: number | null;
      adjustments: Adjustment[] | null;
      model_version: string | null;
      estimate_created_at: Date | null;
    }
  >(
    `SELECT ${CARD_COLS},
            ve.version, ve.color, ve.body_type, ve.doors, ve.armored,
            l.description, l.features, l.status, l.views, l.expires_at,
            u.id AS seller_id, u.name AS seller_name, u.email AS seller_email,
            u.created_at AS seller_since, u.whatsapp AS seller_whatsapp,
            pe.fasecolda_value, pe.comparables, pe.adjustments, pe.model_version, pe.created_at AS estimate_created_at
       ${FROM}
      WHERE l.id = $1`,
    [id],
  );
  const r = rows[0];
  const isOwner = !!viewerId && r?.seller_id === viewerId;
  // Un aviso pausado o vendido solo lo ve su dueño.
  if (!r || (r.status !== "activo" && !isOwner)) throw new ListingError("aviso_no_encontrado", 404);

  const [photos, condition, questions, fav, active] = await Promise.all([
    db.query<{ url: string; slot: string }>(
      "SELECT url, slot FROM listing_photos WHERE listing_id = $1 ORDER BY position",
      [id],
    ),
    db.query<NonNullable<ListingDetail["condition"]>>(
      `SELECT score, evidence, paint, mechanics, interior, tires, history, docs
         FROM condition_reports WHERE listing_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id],
    ),
    db.query<{ id: string; body: string; answer: string | null; created_at: Date; answered_at: Date | null }>(
      "SELECT id, body, answer, created_at, answered_at FROM questions WHERE listing_id = $1 ORDER BY created_at DESC LIMIT 50",
      [id],
    ),
    viewerId
      ? db.query("SELECT 1 FROM favorites WHERE user_id = $1 AND listing_id = $2", [viewerId, id])
      : Promise.resolve({ rowCount: 0 }),
    db.query<{ n: string }>("SELECT count(*) AS n FROM listings WHERE seller_id = $1 AND status = 'activo'", [r.seller_id]),
  ]);

  if (!isOwner) await db.query("UPDATE listings SET views = views + 1 WHERE id = $1", [id]);

  const card = toCard(r);
  return {
    ...card,
    version: r.version,
    description: r.description ?? "",
    color: r.color,
    bodyType: r.body_type,
    doors: r.doors,
    armored: r.armored,
    features: r.features,
    status: r.status,
    views: r.views,
    expiresAt: r.expires_at?.toISOString() ?? null,
    photos: photos.rows,
    condition: condition.rows[0] ?? null,
    estimate:
      card.fair
        ? {
            ...card.fair,
            fasecoldaValue: r.fasecolda_value === null ? null : Number(r.fasecolda_value),
            comparables: r.comparables ?? 0,
            adjustments: r.adjustments ?? [],
            modelVersion: r.model_version ?? "",
            createdAt: r.estimate_created_at?.toISOString() ?? "",
          }
        : null,
    seller: {
      id: r.seller_id,
      name: r.seller_name ?? r.seller_email.split("@")[0]!,
      kind: r.seller_kind,
      since: r.seller_since.toISOString(),
      // El WhatsApp solo se entrega a quien inició sesión (menos raspado de números).
      whatsapp: viewerId ? r.seller_whatsapp : null,
      activeListings: Number(active.rows[0]?.n ?? 0),
    },
    questions: questions.rows.map((q) => ({
      id: q.id,
      body: q.body,
      answer: q.answer,
      createdAt: q.created_at.toISOString(),
      answeredAt: q.answered_at?.toISOString() ?? null,
    })),
    isFavorite: (fav.rowCount ?? 0) > 0,
    isOwner,
  };
}

/** Avisos parecidos: misma marca y línea primero, luego mismo tipo y precio cercano. */
export async function similarListings(db: Queryable, id: string): Promise<ListingCard[]> {
  const { rows } = await db.query<CardRow>(
    `WITH base AS (
       SELECT l.price_cop, ve.brand, ve.line, ve.body_type FROM listings l JOIN vehicles ve ON ve.id = l.vehicle_id WHERE l.id = $1
     )
     SELECT ${CARD_COLS} ${FROM}, base
      WHERE l.status = 'activo' AND l.id <> $1
        AND (ve.brand = base.brand OR ve.body_type = base.body_type)
        AND l.price_cop BETWEEN base.price_cop * 0.7 AND base.price_cop * 1.3
      ORDER BY (ve.brand = base.brand AND ve.line = base.line) DESC, abs(l.price_cop - base.price_cop)
      LIMIT 4`,
    [id],
  );
  return rows.map(toCard);
}

// ───────────────────────── Publicar ─────────────────────────

async function withTx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function assertFreeLimit(db: Queryable, userId: string, exceptListingId?: string) {
  const { rows } = await db.query<{ kind: string; n: string }>(
    `SELECT u.kind, (SELECT count(*) FROM listings WHERE seller_id = u.id AND status = 'activo' AND id IS DISTINCT FROM $2) AS n
       FROM users u WHERE u.id = $1`,
    [userId, exceptListingId ?? null],
  );
  const r = rows[0];
  if (r?.kind === "particular" && Number(r.n) >= FREE_ACTIVE_LISTINGS) {
    throw new ListingError("limite_plan_gratis", 409);
  }
}

export async function createListing(
  pool: pg.Pool,
  provider: VehicleDataProvider,
  userId: string,
  input: ListingCreateInput,
): Promise<{ id: string }> {
  await assertFreeLimit(pool, userId);
  // Placa del RUNT/Fasecolda; si no aparece, el carro que escribió el vendedor.
  const vehicle = (await provider.lookupByPlate(input.plate)) ?? (input.vehicle ? { ...input.vehicle, fasecoldaCode: undefined } : null);
  if (!vehicle) throw new VehicleNotFoundError(input.plate);

  return withTx(pool, async (c) => {
    const ve = await c.query<{ id: string }>(
      `INSERT INTO vehicles (plate_hash, fasecolda_code, brand, line, version, model_year, fuel,
                             transmission, body_type, color, armored, doors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (plate_hash) DO UPDATE SET
         fasecolda_code = EXCLUDED.fasecolda_code, version = EXCLUDED.version, fuel = EXCLUDED.fuel,
         transmission = EXCLUDED.transmission, body_type = EXCLUDED.body_type, color = EXCLUDED.color,
         armored = EXCLUDED.armored, doors = EXCLUDED.doors
       RETURNING id`,
      [
        hashPlate(input.plate), vehicle.fasecoldaCode ?? null, vehicle.brand, vehicle.line, vehicle.version ?? null,
        vehicle.modelYear, vehicle.fuel ?? null, input.transmission, input.bodyType, input.color, input.armored, input.doors,
      ],
    );
    const vehicleId = ve.rows[0]!.id;

    // La tasación debe ser de este mismo carro; si no, el aviso se publica sin rango.
    let estimateId: string | null = null;
    if (input.estimateId) {
      const est = await c.query("SELECT 1 FROM price_estimates WHERE id = $1 AND vehicle_id = $2", [input.estimateId, vehicleId]);
      if (!est.rowCount) throw new ListingError("tasacion_invalida", 400);
      estimateId = input.estimateId;
    }

    const score = conditionScore(input.condition);
    const listing = await c.query<{ id: string }>(
      `INSERT INTO listings (seller_id, vehicle_id, title, description, price_cop, km, city, plan, status,
                             expires_at, estimate_id, condition_score, features)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'gratis','activo', now() + make_interval(days => $8), $9, $10, $11)
       RETURNING id`,
      [userId, vehicleId, input.title, input.description, input.priceCop, input.km, input.city,
       FREE_LISTING_DAYS, estimateId, score, input.features],
    );
    const listingId = listing.rows[0]!.id;
    if (estimateId) await c.query("UPDATE price_estimates SET listing_id = $1 WHERE id = $2", [listingId, estimateId]);

    const b = conditionBreakdown(input.condition);
    await c.query(
      `INSERT INTO condition_reports (listing_id, score, paint, mechanics, interior, tires, history, docs, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'declarado')`,
      [listingId, score, b.paint, b.mechanics, b.interior, b.tires, b.history, b.docs],
    );

    for (const [i, p] of input.photos.entries()) {
      await c.query("INSERT INTO listing_photos (listing_id, url, slot, position) VALUES ($1,$2,$3,$4)", [listingId, p.url, p.slot, i]);
    }
    return { id: listingId };
  });
}

export async function updateListing(
  db: Queryable,
  userId: string,
  id: string,
  patch: { priceCop?: number; description?: string; status?: "activo" | "pausado" | "vendido" },
) {
  const own = await db.query<{ status: string }>("SELECT status FROM listings WHERE id = $1 AND seller_id = $2", [id, userId]);
  if (!own.rowCount) throw new ListingError("aviso_no_encontrado", 404);
  if (patch.status === "activo" && own.rows[0]!.status !== "activo") await assertFreeLimit(db, userId, id);
  await db.query(
    `UPDATE listings SET
       price_cop   = COALESCE($3, price_cop),
       description = COALESCE($4, description),
       status      = COALESCE($5, status),
       updated_at  = now()
     WHERE id = $1 AND seller_id = $2`,
    [id, userId, patch.priceCop ?? null, patch.description ?? null, patch.status ?? null],
  );
}

export async function myListings(db: Queryable, userId: string): Promise<MyListing[]> {
  const { rows } = await db.query<CardRow & { status: MyListing["status"]; views: number; pending: string; expires_at: Date | null }>(
    `SELECT ${CARD_COLS}, l.status, l.views, l.expires_at,
            (SELECT count(*) FROM questions q WHERE q.listing_id = l.id AND q.answer IS NULL) AS pending
       ${FROM} WHERE l.seller_id = $1 ORDER BY l.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    ...toCard(r),
    status: r.status,
    views: r.views,
    pendingQuestions: Number(r.pending),
    expiresAt: r.expires_at?.toISOString() ?? null,
  }));
}

// ───────────────────────── Preguntas y favoritos ─────────────────────────

export async function askQuestion(db: Queryable, userId: string, listingId: string, body: string) {
  const l = await db.query<{ seller_id: string }>("SELECT seller_id FROM listings WHERE id = $1 AND status = 'activo'", [listingId]);
  if (!l.rowCount) throw new ListingError("aviso_no_encontrado", 404);
  if (l.rows[0]!.seller_id === userId) throw new ListingError("pregunta_propia", 400);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO questions (listing_id, asker_id, body) VALUES ($1,$2,$3) RETURNING id",
    [listingId, userId, body],
  );
  return { id: rows[0]!.id };
}

export async function answerQuestion(db: Queryable, userId: string, questionId: string, answer: string) {
  const { rowCount } = await db.query(
    `UPDATE questions q SET answer = $3, answered_at = now()
       FROM listings l WHERE q.id = $1 AND l.id = q.listing_id AND l.seller_id = $2`,
    [questionId, userId, answer],
  );
  if (!rowCount) throw new ListingError("no_autorizado", 403);
}

export async function setFavorite(db: Queryable, userId: string, listingId: string, on: boolean) {
  if (on) {
    await db.query("INSERT INTO favorites (user_id, listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userId, listingId]);
  } else {
    await db.query("DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2", [userId, listingId]);
  }
}

export async function myFavorites(db: Queryable, userId: string): Promise<ListingCard[]> {
  const { rows } = await db.query<CardRow>(
    `SELECT ${CARD_COLS} ${FROM} JOIN favorites f ON f.listing_id = l.id AND f.user_id = $1
      WHERE l.status = 'activo' ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows.map(toCard);
}
