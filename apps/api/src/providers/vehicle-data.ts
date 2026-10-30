import { DEMO_VEHICLES, type VehicleInfo } from "@tcu/shared";

/** Fuente de datos del vehículo por placa (Fasecolda + RUNT). */
export interface VehicleDataProvider {
  readonly name: string;
  lookupByPlate(plate: string): Promise<VehicleInfo | null>;
}

/** Datos de prueba para desarrollo y demos (valores ilustrativos de @tcu/shared). */
export class MockVehicleDataProvider implements VehicleDataProvider {
  readonly name = "mock";
  static readonly demoPlates = Object.keys(DEMO_VEHICLES);
  async lookupByPlate(plate: string) {
    return DEMO_VEHICLES[plate] ?? null;
  }
}

/**
 * Verifik — Fasecolda por placa.
 * Endpoint documentado: GET https://api.verifik.co/v2/co/fasecolda/values-by-plate
 * TODO: confirmar con Verifik el nombre exacto de los parámetros y del cuerpo de respuesta;
 * el mapeo de abajo es defensivo y debe ajustarse con una respuesta real.
 */
export class VerifikVehicleDataProvider implements VehicleDataProvider {
  readonly name = "verifik";
  constructor(private readonly token: string) {
    if (!token) throw new Error("VERIFIK_API_TOKEN es obligatorio con VEHICLE_DATA_PROVIDER=verifik");
  }

  async lookupByPlate(plate: string): Promise<VehicleInfo | null> {
    const url = new URL("https://api.verifik.co/v2/co/fasecolda/values-by-plate");
    url.searchParams.set("plate", plate);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Verifik respondió ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const d = body.data ?? {};
    const pick = (...keys: string[]) => keys.map((k) => d[k]).find((v) => v !== undefined && v !== null);
    const value = Number(pick("value", "valor", "commercialValue", "fasecoldaValue"));
    if (!Number.isFinite(value) || value <= 0) return null;
    return {
      brand: String(pick("brand", "marca") ?? ""),
      line: String(pick("line", "linea", "model", "referencia") ?? ""),
      version: pick("version", "referencia2") ? String(pick("version", "referencia2")) : undefined,
      modelYear: Number(pick("year", "modelo", "modelYear")),
      fuel: pick("fuel", "combustible") ? String(pick("fuel", "combustible")) : undefined,
      fasecoldaCode: pick("code", "codigo", "fasecoldaCode") ? String(pick("code", "codigo", "fasecoldaCode")) : undefined,
      fasecoldaValue: Math.round(value),
    };
  }
}

/**
 * Sin proveedor contratado: ninguna placa se encuentra y el vendedor escribe el carro a mano.
 * Es el valor por defecto en producción mientras no haya contrato con Verifik u otro.
 */
export class NoVehicleDataProvider implements VehicleDataProvider {
  readonly name = "none";
  async lookupByPlate() {
    return null;
  }
}

export function createVehicleDataProvider(env: NodeJS.ProcessEnv = process.env): VehicleDataProvider {
  const prod = env.NODE_ENV === "production";
  const kind = env.VEHICLE_DATA_PROVIDER || (prod ? "none" : "mock");
  if (kind === "verifik") return new VerifikVehicleDataProvider(env.VERIFIK_API_TOKEN ?? "");
  if (kind === "none") return new NoVehicleDataProvider();
  if (kind === "mock") {
    // Los valores de prueba no son de Fasecolda: mostrarlos a compradores reales sería engañoso.
    if (prod) throw new Error("VEHICLE_DATA_PROVIDER=mock no se permite en producción. Use none o verifik.");
    return new MockVehicleDataProvider();
  }
  throw new Error(`VEHICLE_DATA_PROVIDER desconocido: ${kind} (use none, mock o verifik)`);
}
