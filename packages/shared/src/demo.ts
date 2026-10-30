import type { VehicleInfo } from "./schemas";

/**
 * Vehículos de demostración (valores ilustrativos, NO son de Fasecolda).
 * Los usa el proveedor mock de la API y el modo demo de la web.
 */
export const DEMO_VEHICLES: Record<string, VehicleInfo> = {
  ABC123: { brand: "Mazda", line: "3", version: "Grand Touring LX 2.5 AT", modelYear: 2021, fuel: "Gasolina", fasecoldaCode: "DEMO-0001", fasecoldaValue: 86_500_000 },
  BMW320: { brand: "BMW", line: "Serie 3", version: "320i Sport Line", modelYear: 2020, fuel: "Gasolina", fasecoldaCode: "DEMO-0002", fasecoldaValue: 128_000_000 },
  AUD301: { brand: "Audi", line: "Q3", version: "35 TFSI Advanced", modelYear: 2021, fuel: "Gasolina", fasecoldaCode: "DEMO-0003", fasecoldaValue: 139_000_000 },
  MER250: { brand: "Mercedes-Benz", line: "GLA", version: "GLA 200 Progressive", modelYear: 2022, fuel: "Gasolina", fasecoldaCode: "DEMO-0004", fasecoldaValue: 158_000_000 },
  REN456: { brand: "Renault", line: "Duster", version: "Intens 1.3T CVT", modelYear: 2022, fuel: "Gasolina", fasecoldaCode: "DEMO-0005", fasecoldaValue: 74_000_000 },
  TOY789: { brand: "Toyota", line: "Corolla Cross", version: "1.8 HEV XEI", modelYear: 2023, fuel: "Híbrido", fasecoldaCode: "DEMO-0006", fasecoldaValue: 118_000_000 },
};

/** Precios de avisos comparables de demostración, por placa. */
export const DEMO_MARKET: Record<string, number[]> = {
  ABC123: [79_900_000, 82_000_000, 84_500_000, 81_000_000, 78_000_000, 86_000_000, 83_500_000, 80_500_000, 79_000_000],
  BMW320: [112_000_000, 118_000_000, 109_900_000, 115_000_000, 121_000_000],
  AUD301: [125_000_000, 129_900_000, 119_000_000, 132_000_000, 127_500_000, 124_000_000],
  MER250: [149_000_000, 152_000_000, 145_900_000],
  REN456: [71_000_000, 72_500_000, 69_900_000, 74_000_000, 70_500_000, 73_000_000, 71_900_000, 72_000_000, 68_000_000, 75_000_000],
  TOY789: [121_000_000, 119_500_000, 123_900_000, 118_000_000, 122_000_000, 120_000_000, 124_500_000, 117_900_000],
};
