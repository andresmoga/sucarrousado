/**
 * Configuración del sitio a partir de las variables de entorno, y revisión de lo obligatorio en producción.
 * Si falta algo en producción, el servidor no arranca y dice qué falta (mejor que publicar a medias).
 */
import { LEGAL_VERSION, type LegalInfo, type SiteConfig } from "@tcu/shared";

const PENDING = "[pendiente]";

export function legalFromEnv(env: NodeJS.ProcessEnv = process.env): LegalInfo {
  return {
    name: env.LEGAL_NAME || PENDING,
    id: env.LEGAL_ID || PENDING,
    email: env.LEGAL_EMAIL || PENDING,
    address: env.LEGAL_ADDRESS || PENDING,
    city: env.LEGAL_CITY || PENDING,
    phone: env.LEGAL_PHONE || null,
  };
}

/** Problemas que impiden arrancar en producción. Lista vacía = todo bien. */
export function productionProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const p: string[] = [];
  const need = (k: string, why: string) => !env[k] && p.push(`${k}: ${why}`);
  need("DATABASE_URL", "conexión a PostgreSQL");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) p.push("AUTH_SECRET: cadena aleatoria de al menos 32 caracteres (openssl rand -hex 32)");
  if (!env.PLATE_HASH_SALT || env.PLATE_HASH_SALT.length < 16) p.push("PLATE_HASH_SALT: cadena aleatoria de al menos 16 caracteres; no la cambie después");
  if (!env.PUBLIC_URL?.startsWith("https://")) p.push("PUBLIC_URL: dirección pública con https, ej. https://sucarrousado.com");
  need("LEGAL_NAME", "razón social o nombre del responsable de los datos (política de datos)");
  need("LEGAL_ID", "NIT o cédula del responsable");
  need("LEGAL_EMAIL", "correo para consultas y reclamos de datos personales");
  need("LEGAL_ADDRESS", "dirección física del responsable");
  need("LEGAL_CITY", "ciudad del responsable");
  if ((env.STORAGE_DRIVER ?? "local") !== "s3" && env.ALLOW_LOCAL_STORAGE !== "1") {
    p.push("STORAGE_DRIVER=s3 (Cloudflare R2 o S3): el disco del servidor se borra en cada despliegue. Con un disco persistente propio, ALLOW_LOCAL_STORAGE=1");
  }
  return p;
}

export function siteConfig(env: NodeJS.ProcessEnv, extra: { ai: boolean; provider: string; demoPlates: string[] }): SiteConfig {
  return {
    beta: (env.SITE_MODE ?? "beta") === "beta",
    invitesRequired: !!env.BETA_INVITE_CODE,
    ai: extra.ai,
    provider: extra.provider,
    demoPlates: extra.demoPlates,
    legal: legalFromEnv(env),
    legalVersion: LEGAL_VERSION,
    publicUrl: env.PUBLIC_URL ?? "http://localhost:5173",
  };
}
