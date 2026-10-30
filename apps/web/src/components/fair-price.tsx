import { fairPosition, formatMillions, type FairRange } from "@tcu/shared";
import { cn } from "@/lib/utils";

const LABEL = {
  bajo: "Por debajo del precio justo",
  en_rango: "En precio justo",
  alto: "Por encima del precio justo",
} as const;

/** Etiqueta de dónde cae el precio frente al rango sugerido. */
export function FairBadge({ price, fair, className }: { price: number; fair: FairRange | null; className?: string }) {
  if (!fair) return null;
  const pos = fairPosition(price, fair.low, fair.high);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        pos === "bajo" && "bg-verdict text-white",
        pos === "en_rango" && "bg-verdict/15 text-verdict",
        pos === "alto" && "bg-secondary text-muted-foreground",
        className,
      )}
    >
      {LABEL[pos]}
    </span>
  );
}

/**
 * Barra del rango: banda verde = precio justo; raya verde = punto medio;
 * raya negra = valor Fasecolda; rombo amarillo = precio pedido.
 */
export function FairRangeBar({
  fair,
  fasecolda,
  price,
  className,
}: {
  fair: FairRange;
  fasecolda?: number | null;
  price?: number;
  className?: string;
}) {
  const pts = [fair.low, fair.high, fasecolda, price].filter((n): n is number => typeof n === "number");
  const lo = Math.min(...pts) * 0.94;
  const hi = Math.max(...pts) * 1.06;
  const x = (n: number) => `${((n - lo) / (hi - lo)) * 100}%`;
  return (
    <div className={cn("select-none", className)} aria-hidden>
      <div className="relative h-16">
        <div className="absolute inset-x-0 top-8 h-2 rounded-full bg-secondary" />
        <div
          className="absolute top-6 h-6 rounded-md bg-verdict/20 ring-2 ring-verdict"
          style={{ left: x(fair.low), width: `calc(${x(fair.high)} - ${x(fair.low)})` }}
        />
        <div className="absolute top-4 h-10 w-[3px] -translate-x-1/2 rounded bg-verdict" style={{ left: x(fair.mid) }} />
        {typeof fasecolda === "number" && (
          <>
            <div className="absolute top-5 h-8 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: x(fasecolda) }} />
            <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground" style={{ left: x(fasecolda) }}>
              Fasecolda {formatMillions(fasecolda)}
            </span>
          </>
        )}
        {price !== undefined && (
          <div
            className="absolute top-[26px] size-4 -translate-x-1/2 rotate-45 border-2 border-plate-ink bg-plate"
            style={{ left: x(price) }}
          />
        )}
      </div>
      {/* Cifras bajo los bordes de la franja verde (no en los extremos de la barra). */}
      <div className="relative h-5 font-plate text-sm text-verdict">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(fair.low) }}>{formatMillions(fair.low)}</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(fair.high) }}>{formatMillions(fair.high)}</span>
      </div>
    </div>
  );
}
