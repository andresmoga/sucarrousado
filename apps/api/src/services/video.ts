/**
 * Video vertical (1080×1920, ~16 s) para Reels, TikTok, Shorts y estados de WhatsApp, armado a partir
 * de las fotos del aviso: acercamiento suave sobre cada foto, tarjetas con modelo, precio y precio justo,
 * y cierre con el logo. Se genera en el servidor con sharp + resvg (gráficos) y ffmpeg (H.264).
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BRAND, PHOTO_SLOTS, fairPosition, formatCOP, logoSvg } from "@tcu/shared";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import type { Queryable } from "../db";
import { readUpload, storage } from "./storage";

const W = 1080;
const H = 1920;
const SEG = 2.6; // segundos por foto
const FADE = 0.4;
const OUTRO = 2.8;

/** Fuentes Barlow (licencia OFL) en apps/api/assets/fonts; los scripts corren con apps/api como directorio. */
const FONT_DIR = resolve(process.env.FONT_DIR ?? join("assets", "fonts"));
const FONTS = ["BarlowCondensed-Bold.ttf", "BarlowCondensed-SemiBold.ttf", "Barlow-Medium.ttf"].map((f) => join(FONT_DIR, f));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function svgToPng(svg: string): Buffer {
  return new Resvg(svg, {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Barlow" },
    fitTo: { mode: "original" },
  })
    .render()
    .asPng();
}

export { logoSvg } from "@tcu/shared";

export interface VideoInput {
  photos: (string | Buffer)[]; // rutas en disco o contenido, en orden de galería
  brand: string;
  line: string;
  modelYear: number;
  km: number;
  city: string;
  priceCop: number;
  fair: { low: number; high: number } | null;
  features: string[];
  conditionScore: number | null;
}

/** Tarjeta inferior en SVG para cada escena. */
function card(lines: { text: string; size: number; weight?: number; family?: string; color?: string }[], badge?: { text: string; fill: string; color: string }): string {
  const pad = 64;
  let y = 0;
  const body = lines
    .map((l) => {
      y += l.size * 1.08;
      return `<text x="${pad}" y="${y}" font-family="${l.family ?? "Barlow Condensed"}" font-weight="${l.weight ?? 700}" font-size="${l.size}" fill="${l.color ?? "#FFFFFF"}">${esc(l.text)}</text>`;
    })
    .join("");
  const badgeH = 78;
  const badgeSvg = badge
    ? `<g transform="translate(${pad} ${y + 30})"><rect width="${badge.text.length * 22 + 72}" height="${badgeH}" rx="39" fill="${badge.fill}"/><text x="36" y="52" font-family="Barlow" font-weight="500" font-size="40" fill="${badge.color}">${esc(badge.text)}</text></g>`
    : "";
  const total = y + (badge ? badgeH + 40 : 0) + 56;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}" viewBox="0 -24 ${W} ${total}">
  <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.35" stop-color="#000" stop-opacity="0.72"/><stop offset="1" stop-color="#000" stop-opacity="0.9"/></linearGradient></defs>
  <rect x="0" y="-24" width="${W}" height="${total}" fill="url(#f)"/>${body}${badgeSvg}</svg>`;
}

/** Escena con la foto encima de su propia versión desenfocada (formato vertical sin recortar el carro). */
async function scene(photo: string | Buffer, overlay: string, out: string) {
  const src = sharp(photo).rotate();
  const bg = await src.clone().resize(W, H, { fit: "cover" }).blur(40).modulate({ brightness: 0.55 }).toBuffer();
  const fg = await src.clone().resize(W - 40, 1100, { fit: "inside" }).toBuffer();
  const fgMeta = await sharp(fg).metadata();
  const ov = svgToPng(overlay);
  const ovMeta = await sharp(ov).metadata();
  const top = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="200"><defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="${W}" height="200" fill="url(#t)"/></svg>`));
  await sharp(bg)
    .composite([
      { input: fg, left: Math.round((W - (fgMeta.width ?? W)) / 2), top: Math.round(860 - (fgMeta.height ?? 0) / 2) },
      { input: await top.png().toBuffer(), left: 0, top: 0 },
      { input: svgToPng(logoSvg(360)), left: 56, top: 48 },
      { input: ov, left: 0, top: H - (ovMeta.height ?? 0) },
    ])
    .jpeg({ quality: 90 })
    .toFile(out);
}

async function outro(out: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#000"/>
  <text x="${W / 2}" y="1220" text-anchor="middle" font-family="Barlow" font-weight="500" font-size="54" fill="#FFFFFF">${esc(BRAND.slogan)}</text>
  <text x="${W / 2}" y="1330" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="64" fill="#F2C200">${esc(BRAND.domain)}</text>
  <text x="${W / 2}" y="1420" text-anchor="middle" font-family="Barlow" font-weight="500" font-size="38" fill="#B8BCC2">Publique gratis en menos de 5 minutos</text>
</svg>`;
  await sharp(svgToPng(svg))
    .composite([{ input: svgToPng(logoSvg(900)), left: 90, top: 640 }])
    .jpeg({ quality: 92 })
    .toFile(out);
}

function run(cmd: string, args: string[], timeoutMs = 180_000): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (c) => (err = (err + c).slice(-4000)));
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("close", (code) => {
      clearTimeout(t);
      code === 0 ? ok() : fail(new Error(`${cmd} terminó con código ${code}: ${err.slice(-600)}`));
    });
    p.on("error", fail);
  });
}

export async function renderVideo(v: VideoInput, outMp4: string, outPoster: string) {
  const tmp = await mkdtemp(join(tmpdir(), "cu-video-"));
  try {
    const photos = v.photos.slice(0, 5);
    const pos = v.fair ? fairPosition(v.priceCop, v.fair.low, v.fair.high) : null;
    const fairBadge =
      pos === "bajo" ? { text: "Por debajo del precio justo", fill: "#2FD38A", color: "#04140C" }
      : pos === "en_rango" ? { text: "En precio justo", fill: "#2FD38A", color: "#04140C" }
      : undefined;
    const cards = [
      card([{ text: `${v.brand} ${v.line}`, size: 104 }, { text: `Modelo ${v.modelYear}`, size: 64, weight: 600, color: "#F2C200" }]),
      card([{ text: formatCOP(v.priceCop), size: 120 }], fairBadge),
      card([
        { text: `${v.km.toLocaleString("es-CO")} km`, size: 96 },
        { text: v.conditionScore !== null ? `${v.city}  |  Estado ${v.conditionScore}/100` : v.city, size: 52, weight: 500, family: "Barlow", color: "#E5E7EA" },
      ]),
      card(
        v.features.length
          ? v.features.slice(0, 3).map((f, i) => ({ text: f, size: i === 0 ? 64 : 52, weight: 500, family: "Barlow" }))
          : [{ text: "Listo para su próximo paseo", size: 72 }],
      ),
      card([{ text: "Precio calculado con Fasecolda,", size: 60, weight: 600 }, { text: "el mercado y el estado real", size: 60, weight: 600 }]),
    ];

    const frames: string[] = [];
    for (const [i, p] of photos.entries()) {
      const f = join(tmp, `s${i}.jpg`);
      await scene(p, cards[i] ?? cards[0]!, f);
      frames.push(f);
    }
    const end = join(tmp, "outro.jpg");
    await outro(end);
    frames.push(end);

    // ffmpeg: acercamiento lento en cada escena y fundidos entre escenas.
    const args: string[] = ["-y", "-loglevel", "error"];
    const durs = frames.map((_, i) => (i === frames.length - 1 ? OUTRO : SEG));
    frames.forEach((f, i) => args.push("-loop", "1", "-framerate", "30", "-t", String(durs[i]), "-i", f));
    const parts: string[] = [];
    frames.forEach((_, i) => {
      const last = i === frames.length - 1;
      const frames30 = Math.round(durs[i]! * 30);
      parts.push(
        last
          ? `[${i}:v]scale=${W}:${H},setsar=1,format=yuv420p[v${i}]`
          : `[${i}:v]scale=${W * 1.25}:${H * 1.25},zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30,trim=end_frame=${frames30},setsar=1,format=yuv420p[v${i}]`,
      );
    });
    let prev = "v0";
    let offset = 0;
    for (let i = 1; i < frames.length; i++) {
      offset += durs[i - 1]! - FADE;
      const out = i === frames.length - 1 ? "vout" : `x${i}`;
      parts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[${out}]`);
      prev = out;
    }
    args.push(
      "-filter_complex", parts.join(";"),
      "-map", frames.length > 1 ? "[vout]" : "[v0]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "30",
      outMp4,
    );
    await mkdir(dirname(outMp4), { recursive: true });
    await run("ffmpeg", args);
    await sharp(frames[0]!).resize(540, 960).jpeg({ quality: 80 }).toFile(outPoster);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// ───────────────────────── Cola y estado ─────────────────────────

let chain: Promise<unknown> = Promise.resolve();

/** Encola el video del aviso (uno a la vez para no saturar el servidor). */
export async function queueVideo(db: Queryable, listingId: string, log?: (e: unknown) => void, opts: { auto?: boolean } = {}) {
  // VIDEO_AUTO=0 desactiva el video automático al publicar (pruebas o servidores sin ffmpeg).
  if (opts.auto && process.env.VIDEO_AUTO === "0") return;
  await db.query(
    `INSERT INTO listing_videos (listing_id, status) VALUES ($1, 'en_proceso')
     ON CONFLICT (listing_id) DO UPDATE SET status = 'en_proceso', error = NULL, updated_at = now()`,
    [listingId],
  );
  const job = chain.then(async () => {
    try {
      const { rows } = await db.query<{
        brand: string; line: string; model_year: number; km: number; city: string; price_cop: string;
        features: string[]; condition_score: number | null; low: string | null; high: string | null;
      }>(
        `SELECT ve.brand, ve.line, ve.model_year, l.km, l.city, l.price_cop, l.features, l.condition_score, pe.low, pe.high
           FROM listings l JOIN vehicles ve ON ve.id = l.vehicle_id LEFT JOIN price_estimates pe ON pe.id = l.estimate_id
          WHERE l.id = $1`,
        [listingId],
      );
      const r = rows[0];
      if (!r) throw new Error("aviso no encontrado");
      const photos = await db.query<{ url: string; slot: string }>("SELECT url, slot FROM listing_photos WHERE listing_id = $1 ORDER BY position", [listingId]);
      // Primero las fotos de exterior, que son las que venden en redes.
      const exterior = new Set(PHOTO_SLOTS.slice(0, 4).map((s) => s.key as string));
      const ordered = [...photos.rows.filter((p) => exterior.has(p.slot)), ...photos.rows.filter((p) => !exterior.has(p.slot))];
      const stamp = Date.now();
      const mp4Rel = `videos/${listingId}-${stamp}.mp4`;
      const posterRel = `videos/${listingId}-${stamp}.jpg`;
      const work = await mkdtemp(join(tmpdir(), "cu-out-"));
      const outMp4 = join(work, "video.mp4");
      const outPoster = join(work, "poster.jpg");
      await renderVideo(
        {
          photos: await Promise.all(ordered.slice(0, 5).map((p) => readUpload(p.url))),
          brand: r.brand, line: r.line, modelYear: r.model_year, km: r.km, city: r.city, priceCop: Number(r.price_cop),
          fair: r.low ? { low: Number(r.low), high: Number(r.high) } : null, features: r.features, conditionScore: r.condition_score,
        },
        outMp4,
        outPoster,
      );
      await storage().put(mp4Rel, await readFile(outMp4), "video/mp4");
      await storage().put(posterRel, await readFile(outPoster), "image/jpeg");
      await rm(work, { recursive: true, force: true });
      await db.query("UPDATE listing_videos SET status = 'listo', url = $2, poster_url = $3, updated_at = now() WHERE listing_id = $1", [
        listingId, `/uploads/${mp4Rel}`, `/uploads/${posterRel}`,
      ]);
    } catch (err) {
      log?.(err);
      await db.query("UPDATE listing_videos SET status = 'error', error = $2, updated_at = now() WHERE listing_id = $1", [
        listingId, String(err).slice(0, 500),
      ]);
    }
  });
  chain = job.catch(() => undefined);
  return job;
}

export async function videoStatus(db: Queryable, listingId: string) {
  const { rows } = await db.query<{ status: string; url: string | null; poster_url: string | null }>(
    "SELECT status, url, poster_url FROM listing_videos WHERE listing_id = $1",
    [listingId],
  );
  const r = rows[0];
  return r ? { status: r.status as "en_proceso" | "listo" | "error", url: r.url, posterUrl: r.poster_url } : { status: "sin_video" as const, url: null, posterUrl: null };
}
