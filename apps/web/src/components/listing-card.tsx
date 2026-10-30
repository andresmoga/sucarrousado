import { formatCOP, type ListingCard as Card } from "@tcu/shared";
import { Link } from "react-router-dom";
import { FairBadge } from "@/components/fair-price";
import { assetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ListingCard({ l, className }: { l: Card; className?: string }) {
  return (
    <Link
      to={`/carros/${l.id}`}
      className={cn("group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md", className)}
    >
      <div className="relative aspect-[8/5] overflow-hidden bg-secondary">
        {l.cover && (
          <img src={assetUrl(l.cover)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        )}
        {l.sellerKind === "profesional" && (
          <span className="absolute left-2 top-2 rounded bg-card/90 px-1.5 py-0.5 text-[11px] font-semibold">Concesionario</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="font-plate text-2xl font-bold leading-none">{formatCOP(l.priceCop)}</p>
        <h3 className="line-clamp-1 font-semibold">
          {l.brand} {l.line}
        </h3>
        <p className="text-sm text-muted-foreground">
          {l.modelYear} <span aria-hidden>|</span> {l.km.toLocaleString("es-CO")} km <span aria-hidden>|</span> {l.city}
        </p>
        <div className="mt-auto pt-2">
          <FairBadge price={l.priceCop} fair={l.fair} />
        </div>
      </div>
    </Link>
  );
}

export function ListingGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="aspect-[8/5] animate-pulse bg-secondary" />
          <div className="space-y-2 p-3">
            <div className="h-6 w-2/3 animate-pulse rounded bg-secondary" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  );
}
