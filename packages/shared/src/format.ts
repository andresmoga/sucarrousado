const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** $ 85.400.000 */
export const formatCOP = (n: number) => cop.format(n);

/** 85,4 M */
export const formatMillions = (n: number) =>
  `${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;

/** +3,2 % / −4,0 % */
export const formatPct = (p: number) =>
  `${p >= 0 ? "+" : "−"}${Math.abs(p * 100).toLocaleString("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
