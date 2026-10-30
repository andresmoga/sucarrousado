/**
 * Video vertical para redes hecho en el navegador (demostración): misma plantilla que el del servidor
 * (acercamiento suave sobre cada foto, tarjetas con modelo, precio y precio justo, cierre con el logo),
 * dibujada en un canvas y grabada con MediaRecorder (MP4 si el navegador lo permite, si no WebM).
 */
import { BRAND, fairPosition, formatCOP, logoSvg } from "@tcu/shared";

export interface DemoVideoInput {
  photos: string[];
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

const W = 720;
const H = 1280;
const FPS = 30;
const SEG = 2.4;
const FADE = 0.4;
const OUTRO = 2.8;
const MAX_PHOTOS = 6;

const MIMES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

type Line = { text: string; size: number; weight?: number; family?: string; color?: string };

export async function renderDemoVideo(v: DemoVideoInput): Promise<{ blob: Blob; ext: string }> {
  const mime = MIMES.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("MediaRecorder no disponible");
  await Promise.all([document.fonts.load('700 60px "Barlow Condensed"'), document.fonts.load('600 60px "Barlow Condensed"'), document.fonts.load('500 30px "Barlow"')]);

  const photos = await Promise.all(v.photos.slice(0, MAX_PHOTOS).map(loadImage));
  if (!photos.length) throw new Error("Sin fotos");
  const logo = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(730, { text: false }))}`);

  const pos = v.fair ? fairPosition(v.priceCop, v.fair.low, v.fair.high) : null;
  const badge = pos === "bajo" ? { text: "Por debajo del precio justo", fill: "#1F7A4D", color: "#FFFFFF" }
    : pos === "en_rango" ? { text: "Precio justo", fill: "#F2C200", color: "#22272E" } : null;
  const cards: { lines: Line[]; badge?: typeof badge }[] = [
    { lines: [{ text: `${v.brand} ${v.line}`, size: 76 }, { text: `Modelo ${v.modelYear}`, size: 46, weight: 600, color: "#F2C200" }] },
    { lines: [{ text: formatCOP(v.priceCop), size: 80 }, { text: `${v.km.toLocaleString("es-CO")} km · ${v.city}`, size: 38, weight: 500, family: "Barlow" }], badge },
    {
      lines: [
        { text: v.conditionScore ? `Estado ${v.conditionScore}/100` : "Ya probado", size: 64 },
        { text: v.features.slice(0, 2).join(" · ") || "Precio justo calculado", size: 34, weight: 500, family: "Barlow" },
      ],
    },
  ];

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const drawPhoto = (img: HTMLImageElement, t: number, alpha: number) => {
    const z = 1 + 0.08 * t;
    const s = Math.max(W / img.width, H / img.height) * z;
    const w = img.width * s;
    const h = img.height * s;
    ctx.globalAlpha = alpha;
    // Fondo: la misma foto llenando el cuadro; encima la foto completa, para no cortar el carro.
    ctx.filter = "blur(24px) brightness(0.55)";
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    ctx.filter = "none";
    const fs = (W / img.width) * z;
    const fw = img.width * fs;
    const fh = img.height * fs;
    ctx.drawImage(img, (W - fw) / 2 - 10 * t, H * 0.42 - fh / 2, fw, fh);
    ctx.globalAlpha = 1;
  };

  const drawCard = (i: number, a: number) => {
    const c = cards[i];
    if (!c) return;
    const g = ctx.createLinearGradient(0, H * 0.6, 0, H);
    g.addColorStop(0, "rgba(16,18,22,0)");
    g.addColorStop(1, "rgba(16,18,22,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);
    ctx.globalAlpha = a;
    let y = H - 330 + (1 - a) * 30;
    for (const l of c.lines) {
      y += l.size * 1.08;
      ctx.font = `${l.weight ?? 700} ${l.size}px "${l.family ?? "Barlow Condensed"}"`;
      ctx.fillStyle = l.color ?? "#FFFFFF";
      ctx.fillText(l.text, 48, y);
    }
    if (c.badge) {
      ctx.font = '500 28px "Barlow"';
      const bw = ctx.measureText(c.badge.text).width + 52;
      ctx.fillStyle = c.badge.fill;
      ctx.beginPath();
      ctx.roundRect(48, y + 24, bw, 56, 28);
      ctx.fill();
      ctx.fillStyle = c.badge.color;
      ctx.fillText(c.badge.text, 74, y + 62);
    }
    ctx.globalAlpha = 1;
  };

  const drawLogo = (x: number, y: number, width: number) => {
    const k = width / 730;
    ctx.drawImage(logo, x, y, width, 205 * k);
    ctx.font = `600 ${132 * k}px "Barlow Condensed"`;
    ctx.fillStyle = "#FFFFFF";
    const word = (t: string, tx: number, len: number) => {
      ctx.save();
      ctx.translate(x + tx * k, y + (232 - 60) * k);
      ctx.scale((len * k) / ctx.measureText(t).width, 1);
      ctx.fillText(t, 0, 0);
      ctx.restore();
    };
    word("carr", 40, 196);
    word("usad", 344, 235);
    ctx.fillStyle = "#F2C200";
    ctx.beginPath();
    ctx.arc(x + 300 * k, y + 136 * k, 5 * k, 0, Math.PI * 2);
    ctx.fill();
  };

  const total = photos.length * SEG + OUTRO;
  const frame = (t: number) => {
    ctx.fillStyle = "#101216";
    ctx.fillRect(0, 0, W, H);
    if (t < photos.length * SEG) {
      const i = Math.floor(t / SEG);
      const local = t - i * SEG;
      drawPhoto(photos[i]!, local / SEG, 1);
      if (local > SEG - FADE && photos[i + 1]) drawPhoto(photos[i + 1]!, 0, (local - (SEG - FADE)) / FADE);
      drawCard(i, Math.min(1, local / 0.5));
      drawLogo(36, 40, 250);
    } else {
      const a = Math.min(1, (t - photos.length * SEG) / 0.5);
      ctx.globalAlpha = a;
      drawLogo(60, 470, 600);
      ctx.textAlign = "center";
      ctx.font = '700 64px "Barlow Condensed"';
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(BRAND.slogan, W / 2, 790);
      ctx.font = '500 32px "Barlow"';
      ctx.fillStyle = "#F2C200";
      ctx.fillText(BRAND.domain, W / 2, 850);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  };

  frame(0);
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const id = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) {
        clearInterval(id);
        resolve();
        return;
      }
      frame(t);
    }, 1000 / FPS);
  });
  rec.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await done;
  const type = mime.split(";")[0]!;
  return { blob: new Blob(chunks, { type }), ext: type === "video/mp4" ? "mp4" : "webm" };
}
