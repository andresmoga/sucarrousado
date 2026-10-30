import { BRAND, PHOTO_SLOTS, formatCOP, formatPct, type ListingDetail } from "@tcu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Heart, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { FairBadge, FairRangeBar } from "@/components/fair-price";
import { ListingCard } from "@/components/listing-card";
import { ShareButtons, VideoCard } from "@/components/share";
import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { ApiError, api, assetUrl, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const slotLabel = (k: string) => PHOTO_SLOTS.find((s) => s.key === k)?.label ?? "Foto";
const sinceYear = (iso: string) => new Date(iso).getFullYear();
const EVIDENCE = { declarado: "declarado por el vendedor", fotos_ia: "revisado con fotos", inspeccion: "inspección física" };
const CONDITION_ROWS: [keyof NonNullable<ListingDetail["condition"]>, string][] = [
  ["paint", "Pintura y carrocería"],
  ["mechanics", "Mecánica"],
  ["interior", "Interior y cojinería"],
  ["tires", "Llantas"],
  ["history", "Historial de siniestros"],
  ["docs", "Papeles al día"],
];

function Gallery({ photos, title }: { photos: ListingDetail["photos"]; title: string }) {
  const [i, setI] = useState(0);
  if (!photos.length) return <div className="aspect-[8/5] rounded-lg bg-secondary" />;
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  const p = photos[i]!;
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg bg-secondary">
        <img src={assetUrl(p.url)} alt={`${title}: ${slotLabel(p.slot)}`} className="aspect-[8/5] w-full object-cover" />
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-card/90 p-2 shadow" aria-label="Foto anterior">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-card/90 p-2 shadow" aria-label="Foto siguiente">
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
        <span className="absolute bottom-2 left-2 rounded bg-card/90 px-2 py-0.5 text-xs font-medium">
          {slotLabel(p.slot)} <span className="text-muted-foreground">{i + 1} de {photos.length}</span>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-6 gap-2">
        {photos.slice(0, 12).map((ph, k) => (
          <button
            key={ph.url}
            type="button"
            onClick={() => setI(k)}
            className={cn("overflow-hidden rounded-md ring-offset-2", k === i ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100")}
            aria-label={`Ver ${slotLabel(ph.slot)}`}
            aria-current={k === i}
          >
            <img src={assetUrl(ph.url)} alt="" className="aspect-[8/5] w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Questions({ l }: { l: ListingDetail }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const [body, setBody] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const ask = useMutation({
    mutationFn: () => api.ask(l.id, body),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["listing", l.id] });
    },
  });
  const answer = useMutation({
    mutationFn: (qid: string) => api.answer(qid, answers[qid] ?? ""),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["listing", l.id] }),
  });

  return (
    <section aria-labelledby="preguntas" className="mt-10">
      <h2 id="preguntas" className="text-xl font-semibold">Preguntas al vendedor</h2>
      {!l.isOwner &&
        (user ? (
          <form
            className="mt-4 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask.mutate();
            }}
          >
            <Label htmlFor="q-body" className="sr-only">Su pregunta</Label>
            <Textarea id="q-body" className="min-h-[80px]" placeholder="Por ejemplo: ¿tiene los mantenimientos en concesionario?" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} />
            <FieldError>{ask.isError ? errorText(ask.error) : null}</FieldError>
            <div>
              <Button type="submit" disabled={body.trim().length < 5 || ask.isPending}>Preguntar</Button>
            </div>
          </form>
        ) : (
          <p className="mt-3 text-muted-foreground">
            <Link to={`/ingresar?volver=${encodeURIComponent(pathname)}`} className="font-semibold text-foreground underline underline-offset-2">Inicie sesión</Link>{" "}
            para hacer una pregunta.
          </p>
        ))}
      <ul className="mt-6 grid gap-5">
        {l.questions.length === 0 && <li className="text-muted-foreground">Nadie ha preguntado todavía.</li>}
        {l.questions.map((q) => (
          <li key={q.id} className="grid gap-1">
            <p className="font-medium">{q.body}</p>
            {q.answer ? (
              <p className="border-l-2 border-verdict pl-3 text-muted-foreground">{q.answer}</p>
            ) : l.isOwner ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  answer.mutate(q.id);
                }}
              >
                <input
                  aria-label="Su respuesta"
                  className="h-10 flex-1 rounded-md border border-input bg-card px-3"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
                <Button type="submit" size="sm" className="h-10">Responder</Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Sin respuesta todavía.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContactBox({ l }: { l: ListingDetail }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const fav = useMutation({
    mutationFn: () => api.favorite(l.id, !l.isFavorite),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["listing", l.id] });
      void qc.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
  const message = encodeURIComponent(`Hola, vi su ${l.brand} ${l.line} ${l.modelYear} en ${BRAND.domain}. ¿Sigue disponible?`);

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-5">
      <div>
        <p className="font-semibold">{l.seller.name}</p>
        <p className="text-sm text-muted-foreground">
          {l.seller.kind === "profesional" ? "Concesionario" : "Dueño directo"}, en {BRAND.name} desde {sinceYear(l.seller.since)}
        </p>
      </div>
      {l.isOwner ? (
        <Button asChild variant="outline"><Link to="/cuenta">Administrar mi aviso</Link></Button>
      ) : user ? (
        l.seller.whatsapp ? (
          <Button asChild size="lg">
            <a href={`https://wa.me/57${l.seller.whatsapp}?text=${message}`} target="_blank" rel="noreferrer">
              <MessageCircle /> Escribir por WhatsApp
            </a>
          </Button>
        ) : (
          <Button asChild size="lg"><a href="#preguntas" onClick={(e) => { e.preventDefault(); document.getElementById("preguntas")?.scrollIntoView({ behavior: "smooth" }); }}>Hacer una pregunta</a></Button>
        )
      ) : (
        <Button asChild size="lg">
          <Link to={`/ingresar?volver=${encodeURIComponent(pathname)}`}>Ingresar para contactar</Link>
        </Button>
      )}
      {!l.isOwner && user && (
        <Button variant="outline" onClick={() => fav.mutate()} disabled={fav.isPending} aria-pressed={l.isFavorite}>
          <Heart className={l.isFavorite ? "fill-destructive text-destructive" : ""} />
          {l.isFavorite ? "Guardado en favoritos" : "Guardar en favoritos"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Nunca pague anticipos por transferencia antes de ver el carro y revisar sus papeles en el RUNT.{" "}
        <Link to="/seguridad" className="underline">Cómo comprar seguro</Link>
      </p>
    </div>
  );
}

export default function ListingPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["listing", id], queryFn: () => api.listing(id), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });
  const similar = useQuery({ queryKey: ["similar", id], queryFn: () => api.similar(id), enabled: q.isSuccess });

  if (q.isLoading) return <div className="container py-10"><div className="aspect-[8/5] max-w-3xl animate-pulse rounded-lg bg-secondary" /></div>;
  if (q.isError || !q.data)
    return (
      <div className="container py-16">
        <h1 className="font-plate text-4xl font-bold">Este aviso ya no está disponible</h1>
        <p className="mt-2 text-muted-foreground">Puede que se haya vendido o que el vendedor lo haya pausado.</p>
        <Button asChild className="mt-6"><Link to="/carros">Ver otros carros</Link></Button>
      </div>
    );

  const l = q.data;
  const specs: [string, string | number | null][] = [
    ["Marca", l.brand], ["Línea", l.line], ["Versión", l.version], ["Modelo", l.modelYear],
    ["Kilometraje", `${l.km.toLocaleString("es-CO")} km`], ["Combustible", l.fuel], ["Transmisión", l.transmission],
    ["Carrocería", l.bodyType], ["Puertas", l.doors], ["Color", l.color], ["Blindado", l.armored ? "Sí" : "No"], ["Ciudad", l.city],
  ];

  return (
    <div className="container py-6">
      <nav aria-label="Ruta" className="mb-4 text-sm text-muted-foreground">
        <Link to="/carros" className="hover:underline">Carros</Link> <span aria-hidden>/</span>{" "}
        <Link to={`/carros?brand=${encodeURIComponent(l.brand)}`} className="hover:underline">{l.brand}</Link> <span aria-hidden>/</span>{" "}
        <span>{l.line}</span>
      </nav>

      {l.status !== "activo" && (
        <p className="mb-4 rounded-md border border-border bg-secondary px-4 py-2 text-sm">
          Este aviso está <strong>{l.status}</strong>; solo usted puede verlo.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Gallery photos={l.photos} title={l.title} />
        </div>

        <aside className="grid content-start gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:sticky lg:top-20">
          <div>
            <h1 className="text-2xl font-semibold leading-snug">{l.title}</h1>
            <p className="mt-1 text-muted-foreground">
              {l.modelYear} <span aria-hidden>|</span> {l.km.toLocaleString("es-CO")} km <span aria-hidden>|</span> {l.city}
            </p>
            <p className="mt-4 font-plate text-5xl font-bold leading-none">{formatCOP(l.priceCop)}</p>
            <FairBadge price={l.priceCop} fair={l.fair} className="mt-3" />
          </div>

          {l.estimate && (
            <section aria-labelledby="pj" className="rounded-lg border-2 border-foreground bg-card p-5">
              <h2 id="pj" className="font-semibold">Precio justo para este carro</h2>
              <p className="font-plate text-2xl font-bold">
                {formatCOP(l.estimate.low)} a {formatCOP(l.estimate.high)}
              </p>
              <FairRangeBar fair={l.estimate} fasecolda={l.estimate.fasecoldaValue} price={l.priceCop} className="mt-4" />
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block size-3 rotate-45 border border-plate-ink bg-plate" aria-hidden /> Precio pedido
              </p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold">Cómo se calculó</summary>
                <ul className="mt-2 divide-y divide-border">
                  {l.estimate.fasecoldaValue !== null ? (
                    <li className="flex justify-between gap-3 py-1.5"><span>Valor Fasecolda de referencia</span><span className="font-plate font-semibold">{formatCOP(l.estimate.fasecoldaValue)}</span></li>
                  ) : (
                    <li className="py-1.5 text-muted-foreground">La placa no apareció en Fasecolda: el rango se calculó solo con avisos comparables.</li>
                  )}
                  {l.estimate.adjustments.map((a) => (
                    <li key={a.key} className="flex justify-between gap-3 py-1.5">
                      <span>{a.label}</span>
                      <span className={cn("whitespace-nowrap font-plate font-semibold", a.pct >= 0 ? "text-verdict" : "text-destructive")}>{formatPct(a.pct)}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/como-funciona" className="mt-2 inline-block underline underline-offset-2">Más sobre el precio justo</Link>
              </details>
            </section>
          )}

          {l.condition && (
            <section aria-labelledby="estado" className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-baseline justify-between">
                <h2 id="estado" className="font-semibold">Estado del carro</h2>
                <span className="font-plate text-3xl font-bold">{l.condition.score}<span className="text-base text-muted-foreground">/100</span></span>
              </div>
              <p className="text-sm text-muted-foreground">Puntaje {EVIDENCE[l.condition.evidence]}.</p>
              <ul className="mt-3 grid gap-2">
                {CONDITION_ROWS.map(([k, label]) => {
                  const v = l.condition![k] as number;
                  return (
                    <li key={k} className="grid grid-cols-[1fr_88px] items-center gap-3 text-sm">
                      <span>{label}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${v} de 100`}>
                        <span className={cn("block h-full rounded-full", v >= 75 ? "bg-verdict" : v >= 50 ? "bg-plate" : "bg-destructive")} style={{ width: `${v}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <ContactBox l={l} />

          <section aria-labelledby="compartir" className="grid gap-3 rounded-lg border border-border bg-card p-5">
            <h2 id="compartir" className="font-semibold">Compartir este carro</h2>
            <ShareButtons listingId={l.id} title={l.title} priceCop={l.priceCop} />
          </section>

          <VideoCard listingId={l.id} title={l.title} isOwner={l.isOwner} />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <section aria-labelledby="ficha">
            <h2 id="ficha" className="text-xl font-semibold">Ficha técnica</h2>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2">
              {specs.filter(([, v]) => v !== null && v !== "").map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border py-2 sm:mr-6">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {l.features.length > 0 && (
            <section aria-labelledby="equipo" className="mt-10">
              <h2 id="equipo" className="text-xl font-semibold">Equipamiento</h2>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {l.features.map((f) => (
                  <li key={f} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-verdict" aria-hidden />{f}</li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="descripcion" className="mt-10">
            <h2 id="descripcion" className="text-xl font-semibold">Descripción</h2>
            <div className="mt-3 max-w-prose whitespace-pre-line leading-relaxed">{l.description}</div>
          </section>

          <Questions l={l} />
        </div>

      </div>

      {similar.data && similar.data.length > 0 && (
        <section className="mt-14">
          <h2 className="font-plate text-3xl font-bold">Carros parecidos</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.data.map((s) => <ListingCard key={s.id} l={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}
