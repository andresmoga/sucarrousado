import { BODY_TYPES, FUELS, SORTS, TRANSMISSIONS, type Facet, type ListingSearchInput } from "@tcu/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListingCard, ListingGridSkeleton } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";

const KEYS = ["q", "brand", "city", "fuel", "transmission", "bodyType", "seller", "fair", "yearMin", "yearMax", "priceMin", "priceMax", "kmMax", "sort", "page"] as const;
type Key = (typeof KEYS)[number];

const LABELS: Partial<Record<Key, string>> = {
  fair: "Precio justo",
  seller: "Vendedor",
  yearMin: "Desde",
  yearMax: "Hasta",
  priceMin: "Desde $",
  priceMax: "Hasta $",
  kmMax: "Hasta km",
};
const FAIR_TEXT: Record<string, string> = { bajo: "Por debajo del rango", en_rango: "Dentro del rango" };
const SELLER_TEXT: Record<string, string> = { particular: "Dueño directo", profesional: "Concesionario" };
const YEARS = Array.from({ length: 16 }, (_, i) => 2026 - i);
const KMS = [20_000, 40_000, 60_000, 80_000, 100_000, 150_000];
const millions = (v: string) => (v ? `${Number(v) / 1_000_000} M` : "");

function chipText(k: Key, v: string) {
  if (k === "fair") return FAIR_TEXT[v] ?? v;
  if (k === "seller") return SELLER_TEXT[v] ?? v;
  if (k === "priceMin" || k === "priceMax") return `${LABELS[k]}${millions(v)}`;
  if (k === "kmMax") return `${LABELS[k]} ${Number(v).toLocaleString("es-CO")}`;
  if (LABELS[k]) return `${LABELS[k]} ${v}`;
  return k === "q" ? `“${v}”` : v;
}

function Filters({
  params,
  set,
  setMany,
  facets,
}: {
  params: URLSearchParams;
  set: (k: Key, v: string) => void;
  setMany: (values: Partial<Record<Key, string>>) => void;
  facets?: { brand: Facet[]; city: Facet[]; fuel: Facet[] };
}) {
  const v = (k: Key) => params.get(k) ?? "";
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  useEffect(() => {
    setPriceMin(v("priceMin") ? String(Number(v("priceMin")) / 1_000_000) : "");
    setPriceMax(v("priceMax") ? String(Number(v("priceMax")) / 1_000_000) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const facetSelect = (k: "brand" | "city", label: string, all: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${k}`}>{label}</Label>
      <Select id={`f-${k}`} value={v(k)} onChange={(e) => set(k, e.target.value)}>
        <option value="">{all}</option>
        {facets?.[k].map((f) => (
          <option key={f.value} value={f.value}>
            {f.value} ({f.count})
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Precio justo</legend>
        {(["", "bajo", "en_rango"] as const).map((o) => (
          <label key={o} className="flex items-center gap-2 text-[15px]">
            <input type="radio" name="fair" className="size-4 accent-foreground" checked={v("fair") === o} onChange={() => set("fair", o)} />
            {o ? FAIR_TEXT[o] : "Todos los precios"}
          </label>
        ))}
      </fieldset>

      {facetSelect("brand", "Marca", "Todas las marcas")}
      {facetSelect("city", "Ciudad", "Todo el país")}

      <div className="grid gap-1.5">
        <span className="text-sm font-semibold">Precio en millones</span>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMany({
              priceMin: priceMin ? String(Number(priceMin) * 1_000_000) : "",
              priceMax: priceMax ? String(Number(priceMax) * 1_000_000) : "",
            });
          }}
        >
          <Input aria-label="Precio mínimo en millones" inputMode="numeric" placeholder="Mín." value={priceMin} onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, ""))} />
          <Input aria-label="Precio máximo en millones" inputMode="numeric" placeholder="Máx." value={priceMax} onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ""))} />
          <Button type="submit" variant="outline" className="shrink-0 px-3">Aplicar</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="f-ymin">Modelo desde</Label>
          <Select id="f-ymin" value={v("yearMin")} onChange={(e) => set("yearMin", e.target.value)}>
            <option value="">Todos</option>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-ymax">Hasta</Label>
          <Select id="f-ymax" value={v("yearMax")} onChange={(e) => set("yearMax", e.target.value)}>
            <option value="">Todos</option>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="f-km">Kilometraje</Label>
        <Select id="f-km" value={v("kmMax")} onChange={(e) => set("kmMax", e.target.value)}>
          <option value="">Cualquiera</option>
          {KMS.map((k) => <option key={k} value={k}>Hasta {k.toLocaleString("es-CO")} km</option>)}
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="f-body">Carrocería</Label>
        <Select id="f-body" value={v("bodyType")} onChange={(e) => set("bodyType", e.target.value)}>
          <option value="">Todas</option>
          {BODY_TYPES.map((b) => <option key={b}>{b}</option>)}
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="f-fuel">Combustible</Label>
        <Select id="f-fuel" value={v("fuel")} onChange={(e) => set("fuel", e.target.value)}>
          <option value="">Todos</option>
          {FUELS.map((f) => <option key={f}>{f}</option>)}
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="f-tr">Transmisión</Label>
        <Select id="f-tr" value={v("transmission")} onChange={(e) => set("transmission", e.target.value)}>
          <option value="">Todas</option>
          {TRANSMISSIONS.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="f-seller">Quién vende</Label>
        <Select id="f-seller" value={v("seller")} onChange={(e) => set("seller", e.target.value)}>
          <option value="">Todos</option>
          <option value="particular">Dueño directo</option>
          <option value="profesional">Concesionario</option>
        </Select>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query: ListingSearchInput = Object.fromEntries(
    KEYS.map((k) => [k, params.get(k) ?? undefined]).filter(([, v]) => v),
  ) as ListingSearchInput;

  const res = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.search({ ...query, pageSize: 24 }),
    placeholderData: keepPreviousData,
  });

  const setMany = (values: Partial<Record<Key, string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, value] of Object.entries(values)) {
      if (value) next.set(k, value);
      else next.delete(k);
    }
    if (!("page" in values)) next.delete("page");
    setParams(next, { replace: !("page" in values) });
    if ("page" in values) window.scrollTo({ top: 0 });
  };
  const set = (k: Key, value: string) => setMany({ [k]: value });

  const active = KEYS.filter((k) => k !== "sort" && k !== "page" && params.get(k));
  const page = Number(params.get("page") ?? 1);
  const pages = res.data ? Math.max(1, Math.ceil(res.data.total / res.data.pageSize)) : 1;
  const heading = params.get("brand") ? `${params.get("brand")} usados` : params.get("q") ? `Resultados para “${params.get("q")}”` : "Carros usados";

  return (
    <div className="container py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-plate text-4xl font-bold">{heading}</h1>
          <p className="text-muted-foreground" role="status">
            {res.data ? `${res.data.total.toLocaleString("es-CO")} ${res.data.total === 1 ? "carro" : "carros"}` : "Buscando…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="lg:hidden">
                <SlidersHorizontal /> Filtros{active.length ? ` (${active.length})` : ""}
              </Button>
            </SheetTrigger>
            <SheetContent title="Filtros">
              <Filters params={params} set={set} setMany={setMany} facets={res.data?.facets} />
              <SheetClose asChild>
                <Button className="mt-6 w-full">Ver {res.data?.total ?? ""} carros</Button>
              </SheetClose>
            </SheetContent>
          </Sheet>
          <Label htmlFor="sort" className="sr-only">Ordenar por</Label>
          <Select id="sort" className="h-10 w-auto" value={params.get("sort") ?? "recientes"} onChange={(e) => set("sort", e.target.value === "recientes" ? "" : e.target.value)}>
            {Object.entries(SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </div>
      </div>

      {active.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {active.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set(k, "")}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-sm hover:border-foreground"
              aria-label={`Quitar filtro ${chipText(k, params.get(k)!)}`}
            >
              {chipText(k, params.get(k)!)} <X className="size-3.5" />
            </button>
          ))}
          <button type="button" onClick={() => setParams({})} className="text-sm font-semibold underline underline-offset-2">
            Quitar todos
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block" aria-label="Filtros">
          <Filters params={params} set={set} setMany={setMany} facets={res.data?.facets} />
        </aside>
        <div>
          {res.isLoading ? (
            <ListingGridSkeleton n={9} />
          ) : res.isError ? (
            <p className="text-muted-foreground">No pudimos cargar los avisos. Revise su conexión y recargue la página.</p>
          ) : res.data?.items.length ? (
            <>
              <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${res.isFetching ? "opacity-60" : ""}`}>
                {res.data.items.map((l) => <ListingCard key={l.id} l={l} />)}
              </div>
              {pages > 1 && (
                <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Páginas">
                  <Button variant="outline" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Anterior</Button>
                  <span className="text-sm text-muted-foreground">Página {page} de {pages}</span>
                  <Button variant="outline" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Siguiente</Button>
                </nav>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-input p-10 text-center">
              <p className="text-lg font-semibold">Ningún carro coincide con estos filtros</p>
              <p className="mt-1 text-muted-foreground">Quite algún filtro para ver más resultados.</p>
              <Button className="mt-4" variant="outline" onClick={() => setParams({})}>Quitar todos los filtros</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
