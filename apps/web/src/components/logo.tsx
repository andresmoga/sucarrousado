import { BRAND } from "@tcu/shared";
import { useId } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Logo oficial (opciones G y H del lienzo de marca): la vía dibuja el carro, las ruedas son las O
 * de "carrO" y "usadO", y la rueda delantera es un tacómetro en la zona verde del precio justo.
 *
 * - variant "luz" (G): carro en blanco, vía amarilla, tacómetro verde. Para fondos oscuros.
 * - variant "mono" (H): una sola tinta (currentColor). Sirve en fondo claro u oscuro, bordado, vinilo.
 */
export function LogoMark({
  variant = "mono",
  glow = false,
  bold = false,
  className,
}: {
  variant?: "luz" | "mono";
  glow?: boolean;
  /** Trazos más gruesos para tamaños pequeños (encabezado, ícono). */
  bold?: boolean;
  className?: string;
}) {
  const line = bold ? 10 : 6;
  const ring = bold ? 16 : 13;
  const weight = bold ? 700 : 600;
  const id = useId().replace(/:/g, "");
  const ink = variant === "luz" ? "#FFFFFF" : "currentColor";
  const road = variant === "luz" ? "#F2C200" : "currentColor";
  const fair = variant === "luz" ? "#2FD38A" : "currentColor";
  const needle = variant === "luz" ? "#F2C200" : "currentColor";

  return (
    <svg viewBox="0 60 730 205" className={className} role="img" aria-label={BRAND.name}>
      {glow && (
        <defs>
          <filter id={`g${id}`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <g filter={glow ? `url(#g${id})` : undefined}>
        <path d="M10 238 H240" stroke={road} strokeWidth={line} strokeLinecap="round" />
        <path d="M702 238 H720" stroke={road} strokeWidth={line} strokeLinecap="round" />
        <path d="M240 238 H702" stroke={variant === "luz" ? road : "currentColor"} strokeWidth={line} strokeLinecap="round" />
        <g fill={road} opacity={variant === "luz" ? 0.6 : 0.45}>
          <rect x="10" y="254" width="34" height="5" rx="2.5" />
          <rect x="64" y="254" width="34" height="5" rx="2.5" />
          <rect x="118" y="254" width="34" height="5" rx="2.5" />
          <rect x="172" y="254" width="34" height="5" rx="2.5" />
        </g>
        <path
          d="M240 236 Q246 212 250 194 C254 172 264 158 282 148 L312 130 C340 96 370 80 410 76 L508 74 C540 74 562 86 580 106 L614 138 C652 144 684 152 692 176 L696 200 Q698 218 702 236"
          fill="none"
          stroke={ink}
          strokeWidth={line}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="300" cy="196" r="28" fill="none" stroke={ink} strokeWidth={ring} />
        <g transform="translate(623 196)">
          <circle r="28" fill="none" stroke={ink} strokeWidth={ring} />
          <path d="M 3 -17 A 17 17 0 0 1 15 -8" fill="none" stroke={fair} strokeWidth="4" />
          <path d="M0 0 L10 -11" stroke={needle} strokeWidth="4" strokeLinecap="round" />
          <circle r="4" fill={needle} />
        </g>
      </g>
      <text x="40" y="232" textLength="196" lengthAdjust="spacingAndGlyphs" fontFamily="'Barlow Condensed', sans-serif" fontWeight={weight} fontSize="132" fill={ink}>
        carr
      </text>
      <text x="344" y="232" textLength="235" lengthAdjust="spacingAndGlyphs" fontFamily="'Barlow Condensed', sans-serif" fontWeight={weight} fontSize="132" fill={ink}>
        usad
      </text>
      <circle cx="300" cy="196" r="5" fill={needle} />
    </svg>
  );
}

/** Logo enlazado al inicio. En fondo claro va en una sola tinta (H); en oscuro, con luz (G). */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <Link to="/" className={cn("inline-flex shrink-0 rounded-sm", className)} aria-label={`${BRAND.name}, inicio`}>
      <LogoMark variant={onDark ? "luz" : "mono"} glow={onDark} bold className="h-11 w-auto sm:h-[52px]" />
    </Link>
  );
}
