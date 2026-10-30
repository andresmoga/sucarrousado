import { describe, expect, it } from "vitest";
import { computeFairPrice, conditionScore, median, removeOutliers } from "./pricing";

const base = {
  fasecoldaValue: 100_000_000,
  km: 45_000,
  modelYear: 2023,
  city: "Bogotá",
  conditionScore: 75,
  evidence: "fotos_ia" as const,
  currentYear: 2026,
};

describe("median y atípicos", () => {
  it("calcula la mediana", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("quita un precio absurdo", () => {
    const v = removeOutliers([90, 92, 95, 96, 98, 10]);
    expect(v).not.toContain(10);
  });
});

describe("conditionScore", () => {
  it("todo excelente = 100", () => {
    expect(
      conditionScore({ paint: 5, interior: 5, mechanics: 5, tires: 5, claims: "ninguno", docsUpToDate: true }),
    ).toBe(100);
  });
  it("siniestro mayor baja el puntaje", () => {
    const a = conditionScore({ paint: 4, interior: 4, mechanics: 4, tires: 4, claims: "ninguno", docsUpToDate: true });
    const b = conditionScore({ paint: 4, interior: 4, mechanics: 4, tires: 4, claims: "mayor", docsUpToDate: true });
    expect(b).toBeLessThan(a);
  });
});

describe("computeFairPrice", () => {
  it("sin mercado y todo neutro ≈ Fasecolda", () => {
    const r = computeFairPrice({ ...base, marketPrices: [] });
    expect(r.mid).toBe(100_000_000);
    expect(r.comparables).toBe(0);
    expect(r.low).toBeLessThan(r.mid);
    expect(r.high).toBeGreaterThan(r.mid);
  });

  it("8 comparables más baratos bajan el precio con peso 60 %", () => {
    const r = computeFairPrice({ ...base, marketPrices: Array(8).fill(80_000_000) });
    // 0,4·100 + 0,6·80 = 88 M
    expect(r.mid).toBe(88_000_000);
  });

  it("kilometraje alto resta, con tope de 8 %", () => {
    const r = computeFairPrice({ ...base, km: 400_000, marketPrices: [] });
    expect(r.mid).toBe(92_000_000);
  });

  it("buena condición suma", () => {
    const r = computeFairPrice({ ...base, conditionScore: 100, marketPrices: [] });
    expect(r.mid).toBe(105_000_000);
  });

  it("rango más ancho si solo es declarado", () => {
    const a = computeFairPrice({ ...base, marketPrices: Array(8).fill(100_000_000) });
    const b = computeFairPrice({ ...base, evidence: "declarado", marketPrices: Array(8).fill(100_000_000) });
    expect(b.high - b.low).toBeGreaterThan(a.high - a.low);
  });
});
