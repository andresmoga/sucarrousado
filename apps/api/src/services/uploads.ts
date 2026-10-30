import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { photoIssuesFromMetrics, type PhotoQuality } from "@tcu/shared";
import sharp, { type Sharp } from "sharp";
import type { Queryable } from "../db";
import { storage } from "./storage";

/** Carpeta de fotos; por defecto apps/api/uploads (los scripts corren con ese directorio de trabajo). */
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? "uploads");

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
/** Lado mayor con el que se guarda la foto. */
const STORE_MAX_SIDE = 2000;

/** Revisa la firma real del archivo, no solo el tipo que declara el navegador. */
export function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString() === "ftyp" && /hei[cf]|mif1|msf1/.test(buf.subarray(8, 12).toString())) return "image/heic";
  return null;
}

export class UploadError extends Error {
  constructor(readonly code: "formato_no_soportado" | "archivo_muy_grande" | "sin_archivo" | "imagen_danada") {
    super(code);
  }
}

/**
 * Huella perceptual de 64 bits por diferencias (dHash): compara cada píxel con su vecino en una miniatura
 * de 9×8 en grises. Distingue mejor que el promedio entre dos ángulos distintos del mismo carro.
 */
async function differenceHash(img: Sharp): Promise<string> {
  const px = await img.clone().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hex = "";
  for (let row = 0; row < 8; row++) {
    for (let half = 0; half < 2; half++) {
      let nib = 0;
      for (let j = 0; j < 4; j++) {
        const col = half * 4 + j;
        nib = (nib << 1) | (px[row * 9 + col]! > px[row * 9 + col + 1]! ? 1 : 0);
      }
      hex += nib.toString(16);
    }
  }
  return hex;
}

/** Mide resolución, brillo y nitidez de una imagen ya orientada. */
export async function measureQuality(buf: Buffer): Promise<PhotoQuality> {
  const img = sharp(buf);
  const { width = 0, height = 0 } = await img.metadata();
  const small = img.clone().greyscale().resize({ width: 512, height: 512, fit: "inside" });
  const lum = await small.clone().stats();
  // Laplaciano con desplazamiento 128: la dispersión mide cuántos bordes nítidos hay.
  const lap = await small
    .clone()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .stats();
  const metrics = {
    width,
    height,
    brightness: Math.round(lum.channels[0]!.mean),
    sharpness: Math.round(lap.channels[0]!.stdev * 10) / 10,
  };
  return { ...metrics, hash: await differenceHash(img), issues: photoIssuesFromMetrics(metrics) };
}

/**
 * Procesa y guarda la foto: corrige la orientación, la reduce a 2000 px como máximo, la guarda en JPEG
 * y descarta los metadatos (EXIF, GPS, datos de la cámara). Registra sus medidas de calidad.
 * Se guarda en el almacenamiento configurado (disco local o S3/R2, ver storage.ts).
 */
export async function savePhoto(db: Queryable, userId: string, buf: Buffer): Promise<{ url: string; quality: PhotoQuality }> {
  if (!sniffImage(buf)) throw new UploadError("formato_no_soportado");
  let out: Buffer;
  try {
    out = await sharp(buf, { failOn: "error" })
      .rotate()
      .resize({ width: STORE_MAX_SIDE, height: STORE_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    // HEIC sin soporte en esta instalación de libvips, o archivo dañado.
    throw new UploadError(sniffImage(buf) === "image/heic" ? "formato_no_soportado" : "imagen_danada");
  }
  // Las medidas se toman sobre el original orientado (la resolución real de la cámara).
  const quality = await measureQuality(await sharp(buf).rotate().toBuffer());

  const key = `u/${userId}/${randomUUID()}.jpg`;
  await storage().put(key, out, "image/jpeg");
  const url = `/uploads/${key}`;
  await db.query("INSERT INTO uploads (user_id, url, width, height, quality) VALUES ($1,$2,$3,$4,$5)", [
    userId, url, quality.width, quality.height, JSON.stringify(quality),
  ]);
  return { url, quality };
}
