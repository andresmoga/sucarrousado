import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { LEGAL_VERSION, type PublicUser, type RegisterInput, type SellerProfile } from "@tcu/shared";
import type { Queryable } from "../db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export class AuthError extends Error {
  constructor(
    readonly code: "credenciales_invalidas" | "correo_registrado" | "sesion_invalida" | "codigo_invitacion" | "invitacion_requerida" | "datos_vendedor",
    readonly status: number,
  ) {
    super(code);
  }
}

// ───────────── Contraseñas (scrypt con sal por usuario) ─────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// ───────────── Token de sesión firmado (HMAC-SHA256) ─────────────

const TOKEN_DAYS = 30;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET es obligatorio en producción");
  return s ?? "dev-secret-cambiar";
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function issueToken(userId: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + TOKEN_DAYS * 86_400 }));
  return `${payload}.${sign(payload)}`;
}

/** Devuelve el id del usuario o null si el token es inválido o venció. */
export function readToken(token: string, now = Date.now()): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    if (!sub || !exp || exp * 1000 < now) return null;
    return sub;
  } catch {
    return null;
  }
}

// ───────────── Usuarios ─────────────

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  kind: "particular" | "profesional";
  whatsapp: string | null;
  password_hash: string | null;
  invited: boolean;
  seller_doc_number: string | null;
}

/** Con BETA_INVITE_CODE, solo publican los invitados (y los concesionarios, que se crean a mano). */
export const invitesRequired = () => !!process.env.BETA_INVITE_CODE;
const validCode = (code: string | undefined) => {
  const want = process.env.BETA_INVITE_CODE ?? "";
  return !!code && want.length > 0 && code.trim().toUpperCase() === want.trim().toUpperCase();
};

export const toPublicUser = (r: UserRow): PublicUser => ({
  id: r.id,
  name: r.name ?? r.email.split("@")[0]!,
  email: r.email,
  kind: r.kind,
  whatsapp: r.whatsapp,
  canPublish: !invitesRequired() || r.invited || r.kind === "profesional",
  sellerProfileComplete: !!r.seller_doc_number,
});

const USER_COLS = "id, name, email, kind, whatsapp, password_hash, invited, seller_doc_number";

export async function register(db: Queryable, input: RegisterInput) {
  const exists = await db.query("SELECT 1 FROM users WHERE email = $1", [input.email]);
  if (exists.rowCount) throw new AuthError("correo_registrado", 409);
  if (input.inviteCode && invitesRequired() && !validCode(input.inviteCode)) throw new AuthError("codigo_invitacion", 400);
  // Queda constancia de la autorización: versión del texto aceptado y fecha (Ley 1581 de 2012, art. 9).
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (email, name, whatsapp, password_hash, legal_version, legal_accepted_at, invited)
     VALUES ($1, $2, $3, $4, $5, now(), $6) RETURNING ${USER_COLS}`,
    [input.email, input.name, input.whatsapp ?? null, await hashPassword(input.password), LEGAL_VERSION, validCode(input.inviteCode)],
  );
  const user = toPublicUser(rows[0]!);
  return { user, token: issueToken(user.id) };
}

export async function login(db: Queryable, email: string, password: string) {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE email = $1`, [email]);
  const row = rows[0];
  // Misma respuesta si el correo no existe o la clave falla: no revela qué correos están registrados.
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
    throw new AuthError("credenciales_invalidas", 401);
  }
  const user = toPublicUser(row);
  return { user, token: issueToken(user.id) };
}

export async function getUser(db: Queryable, id: string): Promise<PublicUser | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? toPublicUser(rows[0]) : null;
}

/** Canjea el código de invitación de la beta. */
export async function redeemInvite(db: Queryable, userId: string, code: string): Promise<PublicUser> {
  if (!validCode(code)) throw new AuthError("codigo_invitacion", 400);
  const { rows } = await db.query<UserRow>(`UPDATE users SET invited = true WHERE id = $1 RETURNING ${USER_COLS}`, [userId]);
  if (!rows[0]) throw new AuthError("sesion_invalida", 401);
  return toPublicUser(rows[0]);
}

/** Lanza invitacion_requerida si el usuario no puede publicar durante la beta. */
export async function assertCanPublishInBeta(db: Queryable, userId: string) {
  if (!invitesRequired()) return;
  const { rows } = await db.query<{ invited: boolean; kind: string }>("SELECT invited, kind FROM users WHERE id = $1", [userId]);
  if (!rows[0] || (!rows[0].invited && rows[0].kind !== "profesional")) throw new AuthError("invitacion_requerida", 403);
}

/** Guarda los datos de vendedor (art. 53, Ley 1480 de 2011). */
export async function saveSellerProfile(db: Queryable, userId: string, p: SellerProfile): Promise<PublicUser> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET seller_doc_type = $2, seller_doc_number = $3, seller_address = $4, seller_city = $5, seller_phone = $6
      WHERE id = $1 RETURNING ${USER_COLS}`,
    [userId, p.docType, p.docNumber, p.address, p.city, p.phone],
  );
  if (!rows[0]) throw new AuthError("sesion_invalida", 401);
  return toPublicUser(rows[0]);
}

/** Lanza datos_vendedor si falta la información que la ley exige a quien publica. */
export async function assertSellerProfile(db: Queryable, userId: string) {
  const { rows } = await db.query<{ ok: boolean }>("SELECT seller_doc_number IS NOT NULL AS ok FROM users WHERE id = $1", [userId]);
  if (!rows[0]?.ok) throw new AuthError("datos_vendedor", 400);
}
