import { MIN_PHOTOS, PHOTO_ISSUES, PHOTO_SLOTS, SUGGESTED_PHOTOS, photoIssuesFromMetrics, type PhotoIssue } from "@tcu/shared";
import { Camera, ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const MAX_PHOTOS = 12;
export const MAX_PHOTO_MB = 12;

export interface LocalPhoto {
  id: string;
  file: File;
  preview: string;
  width: number;
  height: number;
  issues: PhotoIssue[];
}

/** Revisión rápida en el navegador, antes de subir: resolución, orientación y luz. */
export async function checkLocalPhoto(file: File): Promise<LocalPhoto> {
  const preview = URL.createObjectURL(file);
  const img = new Image();
  img.src = preview;
  try {
    await img.decode();
  } catch {
    return { id: crypto.randomUUID(), file, preview, width: 0, height: 0, issues: ["baja_resolucion"] };
  }
  let brightness = 128;
  try {
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 48;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 48, 48);
    const d = ctx.getImageData(0, 0, 48, 48).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    brightness = sum / (d.length / 4);
  } catch {
    /* sin canvas: se omite la medida de luz */
  }
  const issues = photoIssuesFromMetrics({ width: img.naturalWidth, height: img.naturalHeight, brightness, sharpness: 99 });
  return { id: crypto.randomUUID(), file, preview, width: img.naturalWidth, height: img.naturalHeight, issues };
}

const REQUIRED = PHOTO_SLOTS.filter((s) => s.required).map((s) => s.label.toLowerCase());

/** Zona para arrastrar o elegir fotos (desde el celular abre la cámara o la galería). */
export function PhotoDropzone({
  photos,
  onAdd,
  onRemove,
  compact = false,
  dark = false,
}: {
  photos: LocalPhoto[];
  onAdd: (files: File[]) => void;
  onRemove?: (id: string) => void;
  compact?: boolean;
  dark?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (list: FileList | null) => {
    if (!list) return;
    const files = [...list].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (files.length) onAdd(files);
  };

  return (
    <div className="grid gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
          compact ? "py-8" : "py-12",
          dark
            ? over ? "border-plate bg-white/10" : "border-white/40 hover:border-plate"
            : over ? "border-foreground bg-secondary" : "border-input bg-card hover:border-foreground",
        )}
      >
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <span className={cn("flex size-14 items-center justify-center rounded-full", dark ? "bg-plate text-plate-ink" : "bg-foreground text-background")}>
          {photos.length ? <ImagePlus className="size-7" /> : <Camera className="size-7" />}
        </span>
        <span className="text-lg font-semibold">{photos.length ? "Agregar más fotos" : "Suba las fotos de su carro"}</span>
        <span className={cn("max-w-sm text-sm", dark ? "text-white/70" : "text-muted-foreground")}>
          Arrástrelas aquí o tóquelas para elegirlas. Mínimo {MIN_PHOTOS}: {REQUIRED.join(", ")}. Ideal {SUGGESTED_PHOTOS} o más.
        </span>
      </label>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="relative overflow-hidden rounded-lg bg-secondary">
              <img src={p.preview} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                  aria-label={`Quitar foto ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              )}
              {p.issues.length > 0 && (
                <span className="absolute inset-x-1 bottom-1 rounded bg-destructive px-1.5 py-0.5 text-[11px] font-medium leading-tight text-white" title={p.issues.map((x) => PHOTO_ISSUES[x]).join(". ")}>
                  {PHOTO_ISSUES[p.issues[0]!].split(":")[0]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
