/**
 * Dónde viven las fotos y los videos.
 * - `local` (desarrollo): carpeta UPLOAD_DIR, servida por la API en /uploads/.
 * - `s3` (producción): cualquier almacenamiento compatible con S3 (Cloudflare R2, AWS S3, Backblaze B2…).
 *   La API redirige /uploads/<clave> a S3_PUBLIC_URL/<clave>.
 * En la base y en el navegador las fotos siempre se nombran como "/uploads/<clave>".
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface Storage {
  readonly kind: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Dirección pública del archivo (null en local: lo sirve la API). */
  publicUrl(key: string): string | null;
}

/** Clave segura a partir de "/uploads/…" (sin salir de la carpeta). */
export function keyOf(url: string): string {
  const key = url.replace(/^\/uploads\//, "");
  if (!/^[\w./-]+$/.test(key) || key.split("/").some((p) => p === ".." || p === "")) throw new Error("clave de archivo inválida");
  return key;
}

export class LocalStorage implements Storage {
  readonly kind = "local" as const;
  constructor(readonly root: string) {}
  private path(key: string) {
    const abs = resolve(this.root, key);
    if (!abs.startsWith(this.root + sep)) throw new Error("clave de archivo inválida");
    return abs;
  }
  async put(key: string, body: Buffer, _contentType?: string) {
    const abs = this.path(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body);
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  publicUrl() {
    return null;
  }
}

export interface S3Config {
  bucket: string;
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  forcePathStyle?: boolean;
}

export class S3Storage implements Storage {
  readonly kind = "s3" as const;
  private readonly client: S3Client;
  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint || undefined,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Las claves llevan un id único: el archivo nunca cambia.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  publicUrl(key: string) {
    return `${this.cfg.publicUrl.replace(/\/$/, "")}/${key}`;
  }
}

export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): Storage {
  if ((env.STORAGE_DRIVER ?? "local") === "s3") {
    const need = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"] as const;
    const missing = need.filter((k) => !env[k]);
    if (missing.length) throw new Error(`STORAGE_DRIVER=s3 necesita: ${missing.join(", ")}`);
    return new S3Storage({
      bucket: env.S3_BUCKET!,
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? "auto",
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      publicUrl: env.S3_PUBLIC_URL!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "1",
    });
  }
  return new LocalStorage(resolve(env.UPLOAD_DIR ?? "uploads"));
}

let current: Storage | null = null;
/** Almacenamiento del proceso (se crea con las variables de entorno la primera vez). */
export function storage(): Storage {
  current ??= storageFromEnv();
  return current;
}
/** Solo para pruebas. */
export function setStorage(s: Storage | null) {
  current = s;
}

export const readUpload = (url: string) => storage().get(keyOf(url));

