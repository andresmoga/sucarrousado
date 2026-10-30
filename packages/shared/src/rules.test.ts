import { describe, expect, it } from "vitest";
import { parseClassification, parseRecognition } from "./ai-prompts";
import { CITIES, departmentOf } from "./catalog";
import { missingRequiredSlots, photoIssues, slotMismatch, type DraftPhoto } from "./draft";
import { computeFairPrice } from "./pricing";

const q = { width: 2000, height: 1500, brightness: 120, sharpness: 20, hash: "0".repeat(16), issues: [] };
const photo = (slot: DraftPhoto["slot"], aiSlot: DraftPhoto["aiSlot"], extra: Partial<DraftPhoto> = {}): DraftPhoto => ({
  url: `/uploads/${Math.random()}.jpg`, slot, aiSlot, aiChecked: true, quality: q, aiIssues: [], ...extra,
});

describe("municipios", () => {
  it("incluye Chía y la ubica en Cundinamarca", () => {
    expect(CITIES).toContain("Chía");
    expect(departmentOf("Chía")).toBe("Cundinamarca");
    expect(new Set(CITIES).size).toBe(CITIES.length);
  });
  it("aplica el ajuste regional por departamento", () => {
    const base = { fasecoldaValue: 80_000_000, marketPrices: [], km: 40_000, modelYear: 2021, conditionScore: 75, evidence: "declarado" as const, currentYear: 2024 };
    const envigado = computeFairPrice({ ...base, city: "Envigado" });
    expect(envigado.adjustments.find((a) => a.key === "region")?.pct).toBe(0.01);
    expect(computeFairPrice({ ...base, city: "Chía" }).adjustments.some((a) => a.key === "region")).toBe(false);
  });
});

describe("precio sin Fasecolda", () => {
  const base = { fasecoldaValue: null, km: 40_000, modelYear: 2021, city: "Chía", conditionScore: 75, evidence: "declarado" as const, currentYear: 2024 };
  it("no da rango con menos de 3 comparables", () => {
    expect(computeFairPrice({ ...base, marketPrices: [50_000_000, 52_000_000] })).toBeNull();
  });
  it("usa la mediana del mercado con 3 o más", () => {
    const r = computeFairPrice({ ...base, marketPrices: [50_000_000, 52_000_000, 54_000_000] })!;
    expect(Math.abs(r.mid - 52_000_000)).toBeLessThan(52_000_000 * 0.02); // mediana con el ajuste por km
    expect(r.high - r.low).toBeGreaterThan(0.2 * r.mid);
  });
});

describe("ángulo de las fotos", () => {
  it("marca la foto cuando la IA ve otro ángulo", () => {
    const p = photo("frente", "lateral");
    expect(slotMismatch(p)).toBe(true);
    expect(photoIssues(p)).toContain("angulo_incorrecto");
    expect(slotMismatch({ ...p, slotConfirmed: true })).toBe(false);
    expect(slotMismatch(photo("detalle_1", "motor"))).toBe(false);
    expect(slotMismatch(photo("frente", "lateral", { aiChecked: false }))).toBe(false);
  });
  it("una obligatoria con el ángulo equivocado cuenta como faltante", () => {
    const photos = [photo("tres_cuartos", "tres_cuartos"), photo("frente", "frente"), photo("lateral", "trasera"), photo("trasera", "trasera")];
    expect(missingRequiredSlots(photos)).toEqual(["lateral"]);
  });
  it("interpreta la respuesta de la IA sin repetir ángulos", () => {
    const r = parseRecognition(
      { marca: "Mazda", linea: "3", confianza: 0.8, fotos: [{ n: 1, angulo: "frente" }, { n: 2, angulo: "frente" }, { n: 3, angulo: "volante", problemas: ["placa_visible", "x"] }] },
      3,
    )!;
    expect(r.photos.map((p) => p.slot)).toEqual(["frente", null, null]);
    expect(r.photos[1]!.aiSlot).toBe("frente");
    expect(r.photos[2]!.aiIssues).toEqual(["placa_visible"]);
    const c = parseClassification({ fotos: [{ n: 1, angulo: "lateral" }] }, 1, new Set(["lateral"]))!;
    expect(c[0]).toMatchObject({ slot: null, aiSlot: "lateral", aiChecked: true });
  });
});
