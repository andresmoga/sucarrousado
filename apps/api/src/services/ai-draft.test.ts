import { describe, expect, it } from "vitest";
import { templateDraft } from "./ai-draft";

const base = {
  vehicle: { brand: "BMW", line: "Serie 3", version: "320i", modelYear: 2020, fuel: "Gasolina", fasecoldaValue: 1 },
  km: 85_000,
  city: "Bogotá",
  color: "Negro",
  transmission: "Automática",
  condition: { paint: 5, interior: 4, mechanics: 4, tires: 3, claims: "ninguno" as const, docsUpToDate: true },
  features: [] as string[],
};

describe("plantilla de descripción", () => {
  it("usa los datos dados y no inventa equipamiento", () => {
    const d = templateDraft(base);
    expect(d.title).toBe("BMW Serie 3 320i 2020");
    expect(d.description).toContain("85.000 km");
    expect(d.description).toContain("Sin siniestros");
    expect(d.description).not.toContain("Equipamiento");
  });
  it("menciona siniestros y papeles pendientes", () => {
    const d = templateDraft({ ...base, condition: { ...base.condition, claims: "mayor", docsUpToDate: false }, features: ["Frenos ABS"] });
    expect(d.description).toContain("choque de consideración");
    expect(d.description).toContain("papeles pendientes");
    expect(d.description).toContain("frenos abs");
  });
});
