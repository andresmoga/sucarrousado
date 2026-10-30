import { BRAND } from "@tcu/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ListingCard, ListingGridSkeleton } from "@/components/listing-card";
import { PhotoDropzone } from "@/components/photo-dropzone";
import { Timer } from "lucide-react";
import { CitySelect } from "@/components/city-select";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

/** Marcas con red de concesionarios y talleres en Colombia que mostramos como atajo. */
const BACKED_BRANDS = ["Chevrolet", "Renault", "Mazda", "Toyota", "Kia", "Volkswagen", "Ford", "BMW", "Mercedes-Benz", "Audi", "Volvo"];

const PRICE_STEPS = [40, 60, 80, 100, 130, 160, 200];

/**
 * Valor de un carro nuevo con la regla que cita Semana (mayo 2026, Usados Renting Colombia):
 * hasta 20 % al salir del concesionario y cerca de 10 % por año los primeros años.
 */
const NEW_CAR_VALUE = [
  { label: "Nuevo", pct: 100 },
  { label: "Al salir", pct: 80 },
  { label: "Año 1", pct: 72 },
  { label: "Año 2", pct: 65 },
  { label: "Año 3", pct: 58 },
  { label: "Año 4", pct: 52 },
  { label: "Año 5", pct: 47 },
];

function DepreciationBars() {
  return (
    <figure className="rounded-lg border border-border bg-card p-5">
      <div className="flex h-44 items-end gap-2" aria-hidden>
        {NEW_CAR_VALUE.map((p, i) => (
          <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-plate text-sm font-semibold">{p.pct}%</span>
            <div
              className={i >= 3 ? "w-full rounded-t bg-verdict" : "w-full rounded-t bg-foreground/80"}
              style={{ height: `${p.pct * 1.3}px` }}
            />
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">{p.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-4 text-sm text-muted-foreground">
        Valor aproximado de un carro nuevo frente a su precio de compra. Quien compra un usado de 2 o 3 años entra en
        la parte verde: la caída más fuerte ya la pagó el primer dueño.{" "}
        <a
          className="underline underline-offset-2"
          href="https://www.semana.com/vehiculos/articulo/marcas-de-carros-que-menos-se-devaluan-en-el-mercado-colombiano/202640/"
          target="_blank"
          rel="noreferrer"
        >
          Regla citada por Semana, mayo de 2026
        </a>
        .
      </figcaption>
      <p className="sr-only">
        {NEW_CAR_VALUE.map((p) => `${p.label}: ${p.pct} %`).join(". ")}
      </p>
    </figure>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [brand, setBrand] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [city, setCity] = useState("");
  const [plate, setPlate] = useState("");

  const latest = useQuery({ queryKey: ["search", "home-latest"], queryFn: () => api.search({ pageSize: 8 }) });
  const deals = useQuery({ queryKey: ["search", "home-deals"], queryFn: () => api.search({ fair: "bajo", pageSize: 4, sort: "recientes" }) });
  const brands = latest.data?.facets.brand ?? [];
  const brandCount = (b: string) => brands.find((f) => f.value === b)?.count ?? 0;

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (brand) qs.set("brand", brand);
    if (priceMax) qs.set("priceMax", String(Number(priceMax) * 1_000_000));
    if (city) qs.set("city", city);
    nav(`/carros?${qs}`);
  }

  return (
    <>
      {/* ───── Portada ───── */}
      <section className="border-b border-border">
        <div className="container grid gap-8 py-10 md:py-16 lg:grid-cols-[1.15fr_1fr] lg:gap-x-10">
          <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
            <h1 className="font-plate text-[56px] font-bold leading-[0.9] sm:text-[84px]">{BRAND.slogan}</h1>
            <p className="mt-5 max-w-lg text-xl font-medium">La comunidad 100 % de carros usados.</p>
            <p className="mt-1 max-w-lg text-lg text-muted-foreground">
              Los mejores usados del país, de marcas con tradición en Colombia, con el precio calculado sobre Fasecolda,
              el mercado y el estado real de cada carro.
            </p>

          </div>

          <div className="rounded-xl bg-black p-6 text-white sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-plate px-3 py-1 text-sm font-semibold text-plate-ink">
              <Timer className="size-4" /> Menos de 5 minutos
            </p>
            <h2 className="mt-3 font-plate text-4xl font-bold leading-tight">Publique gratis: suba las fotos y la IA hace el resto.</h2>
            <p className="mt-2 text-white/75">
              Reconoce la marca y el modelo, le sugiere el precio justo, redacta el aviso y le arma un video para redes.
            </p>
            <div className="mt-6">
              <PhotoDropzone dark compact photos={[]} onAdd={(files) => nav("/publicar", { state: { files } })} />
            </div>
          </div>
          <form onSubmit={onSearch} className="grid lg:col-start-1 lg:row-start-2 lg:self-start gap-3 rounded-lg border-2 border-foreground bg-card p-4 sm:grid-cols-3 sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="h-brand">Marca</Label>
                <Select id="h-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="">Todas</option>
                  {brands.map((b) => (
                    <option key={b.value} value={b.value}>{b.value}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="h-price">Precio hasta</Label>
                <Select id="h-price" value={priceMax} onChange={(e) => setPriceMax(e.target.value)}>
                  <option value="">Cualquiera</option>
                  {PRICE_STEPS.map((p) => (
                    <option key={p} value={p}>${p} millones</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="h-city">Ciudad</Label>
                <CitySelect id="h-city" anyLabel="Todo el país" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <Button type="submit" size="lg" className="sm:col-span-3">Buscar carros</Button>
            </form>
        </div>
      </section>

      {/* ───── Cómo funciona ───── */}
      <section className="border-b border-border bg-card" aria-labelledby="como-ia">
        <div className="container py-12">
          <h2 id="como-ia" className="font-plate text-3xl font-bold">Así publica en menos de 5 minutos</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Suba las fotos", "Desde el celular. Le decimos cuáles faltan y cuáles salieron oscuras, movidas o con la placa visible."],
              ["La IA reconoce su carro", "Marca, modelo, años, color y equipamiento visible. Usted confirma con la placa y la referencia exacta."],
              ["Ajuste conversando", "El aviso sale redactado con precio justo sugerido. Pida cambios como en un chat: “hágalo más corto”."],
              ["Comparta su video", "Le armamos un video vertical para Reels, TikTok y WhatsApp, y botones para compartir en un toque."],
            ].map(([t, d], i) => (
              <li key={t} className="grid content-start gap-2">
                <span className="flex size-10 items-center justify-center rounded-md bg-plate font-plate text-2xl font-bold text-plate-ink">{i + 1}</span>
                <h3 className="text-lg font-semibold">{t}</h3>
                <p className="text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-6">
            <p className="font-semibold">¿Solo quiere saber cuánto vale su carro?</p>
            <form
              className="flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                nav(`/cuanto-vale${plate ? `?placa=${plate}` : ""}`);
              }}
            >
              <label htmlFor="h-plate" className="sr-only">Placa</label>
              <input
                id="h-plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="ABC123"
                className="h-11 w-36 rounded-md border-2 border-plate-ink bg-plate px-3 text-center font-plate text-2xl font-bold tracking-wider text-plate-ink placeholder:text-plate-ink/35"
              />
              <Button type="submit" variant="outline">Ver cuánto vale</Button>
            </form>
          </div>
        </div>
      </section>

      {/* ───── Por debajo del precio justo ───── */}
      <section className="container py-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-plate text-3xl font-bold">Por debajo del precio justo</h2>
            <p className="text-muted-foreground">Avisos cuyo precio está bajo el rango que calculamos para ese carro.</p>
          </div>
          <Link to="/carros?fair=bajo" className="font-semibold underline underline-offset-4">Ver todos</Link>
        </div>
        {deals.isLoading ? (
          <ListingGridSkeleton n={4} />
        ) : deals.data?.items.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {deals.data.items.map((l) => <ListingCard key={l.id} l={l} />)}
          </div>
        ) : (
          <p className="text-muted-foreground">Hoy no hay avisos por debajo del rango. Mientras tanto, mire los que están en precio justo.</p>
        )}
      </section>

      {/* ───── Por qué un usado ───── */}
      <section className="border-y border-border bg-card">
        <div className="container grid gap-10 py-14 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="font-plate text-4xl font-bold leading-tight">Un carro usado ya demostró lo que vale.</h2>
            <dl className="mt-8 grid gap-7">
              <div>
                <dt className="text-lg font-semibold">La depreciación más fuerte ya pasó</dt>
                <dd className="mt-1 text-muted-foreground">
                  Un carro nuevo puede perder hasta 20 % al salir del concesionario. En un usado de pocos años, esa
                  pérdida la asumió el primer dueño.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold">El mantenimiento ya tiene historia</dt>
                <dd className="mt-1 text-muted-foreground">
                  En un modelo recién llegado, el costo real de mantenerlo y cuánto se devalúa se conoce con los años.
                  En una marca con tradición en el país, eso ya está a la vista: repuestos, talleres y red de
                  concesionarios.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold">Un precio que se puede explicar</dt>
                <dd className="mt-1 text-muted-foreground">
                  Cada aviso muestra el rango de precio justo, el valor Fasecolda de referencia y cómo influyen el
                  kilometraje y el estado. Nada de tasar con el aviso más barato.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold">Un negocio claro para las dos partes</dt>
                <dd className="mt-1 text-muted-foreground">
                  Estado declarado punto por punto, preguntas públicas en cada aviso y, muy pronto, peritaje verificado
                  y Venta Segura con arras en custodia.
                </dd>
              </div>
            </dl>
          </div>
          <div className="lg:pt-16">
            <DepreciationBars />
          </div>
        </div>
      </section>

      {/* ───── Marcas con respaldo ───── */}
      <section className="container py-12">
        <h2 className="font-plate text-3xl font-bold">Marcas con respaldo en Colombia</h2>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Marcas con años de presencia en el país, repuestos fáciles de conseguir y talleres que las conocen.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {BACKED_BRANDS.map((b) => (
            <li key={b}>
              <Link
                to={`/carros?brand=${encodeURIComponent(b)}`}
                className="inline-flex items-baseline gap-2 rounded-md border border-border bg-card px-4 py-2.5 font-semibold hover:border-foreground"
              >
                {b}
                <span className="text-sm font-normal text-muted-foreground">{brandCount(b)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ───── Recién publicados ───── */}
      <section className="container py-6">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-plate text-3xl font-bold">Recién publicados</h2>
          <Link to="/carros" className="font-semibold underline underline-offset-4">Ver todos los carros</Link>
        </div>
        {latest.isLoading ? (
          <ListingGridSkeleton />
        ) : latest.isError ? (
          <p className="text-muted-foreground">No pudimos cargar los avisos. Revise su conexión y recargue la página.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {latest.data?.items.map((l) => <ListingCard key={l.id} l={l} />)}
          </div>
        )}
      </section>

      {/* ───── Vender ───── */}
      <section className="container mt-10">
        <div className="grid gap-6 rounded-xl border-2 border-plate-ink bg-plate p-8 text-plate-ink md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="font-plate text-4xl font-bold leading-tight">Únase a la comunidad 100 % usado</h2>
            <p className="mt-1 max-w-xl text-lg">
              Publique gratis en menos de 5 minutos: suba las fotos y la IA reconoce su carro, le sugiere el precio
              justo y le arma el video para redes. 60 días de publicación.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/publicar">Publicar mi carro</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
