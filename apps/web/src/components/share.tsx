import { BRAND, formatCOP } from "@tcu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, Loader2, RefreshCw, Send, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEMO, api, assetUrl, shareUrl } from "@/lib/api";

interface Props {
  listingId: string;
  title: string;
  priceCop: number;
}

/** Botones para compartir el aviso: WhatsApp, Facebook, X, copiar enlace y el menú nativo del celular. */
export function ShareButtons({ listingId, title, priceCop }: Props) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(listingId);
  const text = `${title} por ${formatCOP(priceCop)} en ${BRAND.name}. ${BRAND.slogan}`;
  const enc = encodeURIComponent;
  const links = [
    { name: "WhatsApp", href: `https://wa.me/?text=${enc(`${text} ${url}`)}`, cls: "bg-[#1F8F4E] text-white hover:bg-[#1a7a43]" },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, cls: "bg-[#1B4F9C] text-white hover:bg-[#174386]" },
    { name: "X", href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`, cls: "bg-black text-white hover:bg-black/85" },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie el enlace:", url);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* la persona canceló */
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.name} href={l.href} target="_blank" rel="noreferrer" className={`inline-flex h-10 items-center gap-2 rounded-md px-3.5 text-sm font-semibold ${l.cls}`}>
            <Send className="size-4" aria-hidden /> {l.name}
          </a>
        ))}
        <Button variant="outline" className="h-10" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Enlace copiado" : "Copiar enlace"}
        </Button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <Button variant="outline" className="h-10" onClick={nativeShare}>
            <Share2 /> Más opciones
          </Button>
        )}
      </div>
    </div>
  );
}

/** Video vertical del aviso: vista previa, descargar y compartir directo desde el celular. */
export function VideoCard({ listingId, title, isOwner }: { listingId: string; title: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const v = useQuery({
    queryKey: ["video", listingId],
    queryFn: () => api.video(listingId),
    refetchInterval: (q) => (q.state.data?.status === "en_proceso" ? 3000 : false),
  });
  const regen = useMutation({
    mutationFn: () => api.regenerateVideo(listingId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["video", listingId] }),
  });
  const [sharing, setSharing] = useState(false);

  async function shareVideo(url: string) {
    setSharing(true);
    try {
      const blob = await (await fetch(url)).blob();
      const ext = v.data?.ext ?? "mp4";
      const file = new File([blob], `carro-usado-${listingId.slice(0, 8)}.${ext}`, { type: blob.type || "video/mp4" });
      if (DEMO && (await import("@/lib/demo-ai").then((m) => m.saveWithViewer(file.name, blob)))) return;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${title}. ${BRAND.slogan}` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
      }
    } catch {
      /* cancelado */
    } finally {
      setSharing(false);
    }
  }

  const d = v.data;
  if (!d || (d.status === "sin_video" && !isOwner)) return null;

  return (
    <section aria-labelledby="video-redes" className="rounded-lg border border-border bg-card p-5">
      <h2 id="video-redes" className="font-semibold">Video para redes</h2>
      <p className="text-sm text-muted-foreground">Vertical, listo para Reels, TikTok, Shorts o estados de WhatsApp.</p>
      {d.status === "listo" && d.url ? (
        <div className="mt-3 grid gap-3">
          <video
            src={assetUrl(d.url)}
            poster={assetUrl(d.posterUrl)}
            controls
            muted
            playsInline
            loop
            className="mx-auto aspect-[9/16] max-h-[440px] rounded-lg bg-black"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void shareVideo(assetUrl(d.url))} disabled={sharing}>
              {sharing ? <Loader2 className="animate-spin" /> : <Share2 />} Compartir video
            </Button>
            <Button asChild variant="outline">
              <a
                href={assetUrl(d.url)}
                download={`carro-usado-${listingId.slice(0, 8)}.${d.ext ?? "mp4"}`}
                onClick={(e) => {
                  if (!DEMO) return;
                  e.preventDefault();
                  void shareVideo(assetUrl(d.url));
                }}
              >
                <Download /> Descargar
              </a>
            </Button>
            {isOwner && (
              <Button variant="ghost" onClick={() => regen.mutate()} disabled={regen.isPending}>
                <RefreshCw /> Hacer de nuevo
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            En el celular, “Compartir video” lo envía directo a Instagram, TikTok o WhatsApp. En el computador se descarga.
          </p>
        </div>
      ) : d.status === "en_proceso" ? (
        <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Preparando su video, toma menos de un minuto…</p>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">{d.status === "error" ? "No pudimos hacer el video." : "Este aviso aún no tiene video."}</p>
          {isOwner && (
            <Button className="mt-2" variant="outline" onClick={() => regen.mutate()} disabled={regen.isPending}>
              <RefreshCw /> Hacer el video
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
