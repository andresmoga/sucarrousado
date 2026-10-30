import { FREE_ACTIVE_LISTINGS, formatCOP, type MyListing } from "@tcu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { FairBadge } from "@/components/fair-price";
import { ListingCard } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, assetUrl, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const STATUS: Record<MyListing["status"], string> = {
  activo: "Activo",
  pausado: "Pausado",
  vendido: "Vendido",
  vencido: "Vencido",
  borrador: "Borrador",
};

function MyListingRow({ l }: { l: MyListing }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(l.priceCop));
  const update = useMutation({
    mutationFn: (b: Parameters<typeof api.updateListing>[1]) => api.updateListing(l.id, b),
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["my-listings"] });
      void qc.invalidateQueries({ queryKey: ["listing", l.id] });
    },
  });

  return (
    <li className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-[160px_1fr]">
      <Link to={`/carros/${l.id}`} className="block overflow-hidden rounded-md bg-secondary">
        {l.cover && <img src={assetUrl(l.cover)} alt="" className="aspect-[8/5] w-full object-cover" />}
      </Link>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/carros/${l.id}`} className="font-semibold hover:underline">{l.title}</Link>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", l.status === "activo" ? "bg-verdict/15 text-verdict" : "bg-secondary text-muted-foreground")}>
            {STATUS[l.status]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-plate text-2xl font-bold">{formatCOP(l.priceCop)}</span>
          <FairBadge price={l.priceCop} fair={l.fair} />
        </div>
        <p className="text-sm text-muted-foreground">
          {l.views.toLocaleString("es-CO")} visitas
          {l.pendingQuestions > 0 && (
            <>
              {" "}<span aria-hidden>|</span>{" "}
              <Link to={`/carros/${l.id}#preguntas`} className="font-semibold text-foreground underline">
                {l.pendingQuestions} {l.pendingQuestions === 1 ? "pregunta sin responder" : "preguntas sin responder"}
              </Link>
            </>
          )}
          {l.expiresAt && l.status === "activo" && <> <span aria-hidden>|</span> vence el {new Date(l.expiresAt).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}</>}
        </p>

        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ priceCop: Number(price) });
            }}
          >
            <label htmlFor={`price-${l.id}`} className="sr-only">Nuevo precio</label>
            <Input id={`price-${l.id}`} inputMode="numeric" className="h-9 w-44" value={Number(price).toLocaleString("es-CO")} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 10))} />
            <Button size="sm" type="submit" disabled={update.isPending}>Guardar precio</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>Cancelar</Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Cambiar precio</Button>
            {l.status === "activo" && <Button size="sm" variant="outline" onClick={() => update.mutate({ status: "pausado" })}>Pausar</Button>}
            {l.status === "pausado" && <Button size="sm" variant="outline" onClick={() => update.mutate({ status: "activo" })}>Reactivar</Button>}
            {l.status !== "vendido" && <Button size="sm" variant="outline" onClick={() => update.mutate({ status: "vendido" })}>Marcar como vendido</Button>}
          </div>
        )}
        {update.isError && <p className="text-sm text-destructive">{errorText(update.error)}</p>}
      </div>
    </li>
  );
}

export default function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const mine = useQuery({ queryKey: ["my-listings"], queryFn: api.myListings, enabled: !!user });
  const favs = useQuery({ queryKey: ["favorites"], queryFn: api.myFavorites, enabled: !!user });

  if (loading) return null;
  if (!user) return <Navigate to="/ingresar?volver=/cuenta" replace />;

  const active = mine.data?.filter((l) => l.status === "activo").length ?? 0;

  return (
    <div className="container py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-plate text-4xl font-bold">Hola, {user.name.split(" ")[0]}</h1>
          <p className="text-muted-foreground">
            {user.email}
            {user.kind === "particular" && ` | Plan gratis: ${active} de ${FREE_ACTIVE_LISTINGS} aviso activo`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild><Link to="/publicar">Publicar un carro</Link></Button>
          <Button variant="ghost" onClick={signOut}>Cerrar sesión</Button>
        </div>
      </div>

      <section className="mt-10" aria-labelledby="mis-avisos">
        <h2 id="mis-avisos" className="text-xl font-semibold">Mis avisos</h2>
        {mine.isLoading ? (
          <p className="mt-3 text-muted-foreground">Cargando…</p>
        ) : mine.data?.length ? (
          <ul className="mt-4 grid gap-3">{mine.data.map((l) => <MyListingRow key={l.id} l={l} />)}</ul>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-input p-8 text-center">
            <p className="font-semibold">Todavía no ha publicado ningún carro</p>
            <p className="mt-1 text-muted-foreground">Publicar es gratis y toma unos 10 minutos con las fotos.</p>
            <Button asChild className="mt-4"><Link to="/publicar">Publicar mi carro</Link></Button>
          </div>
        )}
      </section>

      <section className="mt-12" aria-labelledby="favoritos">
        <h2 id="favoritos" className="text-xl font-semibold">Favoritos</h2>
        {favs.data?.length ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{favs.data.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        ) : (
          <p className="mt-3 text-muted-foreground">
            Guarde los carros que le interesen con el botón “Guardar en favoritos” de cada aviso. <Link to="/carros" className="font-semibold text-foreground underline">Ver carros</Link>
          </p>
        )}
      </section>
    </div>
  );
}
