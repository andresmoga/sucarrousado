/**
 * Asistente sin IA: texto del aviso armado con los datos del vendedor y edición por chat con reglas.
 * Es el respaldo cuando no hay clave de IA y el motor de la demostración en el navegador.
 */
import type { ConditionInput, VehicleInfo } from "./schemas";

/** Lo que el texto necesita del carro (sirve el de la placa o el escrito a mano). */
export type VehicleBasics = Pick<VehicleInfo, "brand" | "line" | "version" | "modelYear" | "fuel">;
import type { DraftData } from "./draft";


export interface DraftInput {
  vehicle: VehicleBasics;
  km: number;
  city: string;
  color?: string;
  transmission?: string;
  condition: ConditionInput;
  features: string[];
}

export interface TextDraft {
  title: string;
  description: string;
  source: "ia" | "plantilla";
}

const QUALITY = ["en mal estado", "con detalles", "en buen estado", "en muy buen estado", "en excelente estado"];
const q = (rating: number) => QUALITY[rating - 1] ?? "en buen estado";
const km = (n: number) => n.toLocaleString("es-CO");

export function buildTitle(v: VehicleBasics): string {
  return [v.brand, v.line, v.version, String(v.modelYear)].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 90);
}

/** Texto armado solo con los datos que dio el vendedor: nunca inventa. */
export function templateDraft(i: DraftInput): TextDraft {
  const v = i.vehicle;
  const c = i.condition;
  const parts: string[] = [];

  const basics = [
    `Vendo ${v.brand} ${v.line}${v.version ? ` ${v.version}` : ""} modelo ${v.modelYear}`,
    `con ${km(i.km)} km`,
    i.color ? `color ${i.color.toLowerCase()}` : null,
    i.transmission ? `transmisión ${i.transmission.toLowerCase()}` : null,
    v.fuel ? `motor a ${v.fuel.toLowerCase()}` : null,
  ].filter(Boolean);
  parts.push(`${basics.join(", ")}.`);

  parts.push(
    `Pintura ${q(c.paint)}, interior y cojinería ${q(c.interior)}, mecánica ${q(c.mechanics)} y llantas ${q(c.tires)}.`,
  );

  const history =
    c.claims === "ninguno"
      ? "Sin siniestros reportados."
      : c.claims === "menor"
        ? "Tuvo un choque menor, ya reparado."
        : "Tuvo un choque de consideración, reparado; pregunte por los detalles.";
  parts.push(`${history} ${c.docsUpToDate ? "SOAT, revisión técnico-mecánica e impuestos al día." : "Tiene papeles pendientes por actualizar."}`);

  if (i.features.length) parts.push(`Equipamiento: ${i.features.map((f) => f.toLowerCase()).join(", ")}.`);
  parts.push(`Se puede ver en ${i.city}. Escríbame por el chat o por WhatsApp para coordinar la visita.`);

  return { title: buildTitle(v), description: parts.join("\n\n"), source: "plantilla" };
}


export interface ChatResult {
  reply: string;
  patch: { title?: string; description?: string; priceCop?: number };
}

const cop = (n: number) => `$${n.toLocaleString("es-CO")}`;

/** Respaldo sin IA: entiende pedidos comunes sobre el precio y el texto. */
export function ruleChat(d: DraftData, message: string): ChatResult {
  const m = message.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const listing = d.listing;
  if (!listing) return { reply: "Primero confirme los datos del carro para generar el aviso.", patch: {} };

  if (/precio|vale|cobr|millon|\$/.test(m)) {
    if (/medio|justo|sugerid|recomend/.test(m) && d.valuation) {
      return { reply: `Listo, dejé el precio en el punto medio del rango justo: ${cop(d.valuation.mid)}.`, patch: { priceCop: d.valuation.mid } };
    }
    const num = m.match(/(\d[\d.,]*)\s*(millones|millon|mill|m\b)?/);
    if (num) {
      let value = Number(num[1]!.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
      if (num[2] || value < 10_000) value = Math.round(value * 1_000_000);
      if (value >= 5_000_000) {
        const note = d.valuation && (value > d.valuation.high ? " Queda por encima del rango justo." : value < d.valuation.low ? " Queda por debajo del rango justo: aparecerá entre las mejores ofertas." : "");
        return { reply: `Listo, el precio quedó en ${cop(value)}.${note ?? ""}`, patch: { priceCop: value } };
      }
    }
  }
  if (/corto|resum|breve|reduc/.test(m)) {
    const short = listing.description.split(/\n\s*\n/).slice(0, 2).join("\n\n");
    if (short.length >= 40 && short !== listing.description) return { reply: "Listo, dejé la descripción más corta.", patch: { description: short } };
  }
  const add = message.match(/(?:agrega|agregue|añade|añada|menciona|mencione|incluye|incluya|pon|ponga)\s+(?:que\s+)?(.+)/i);
  if (add) {
    let s = add[1]!.trim().replace(/\.$/, "");
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return { reply: "Listo, lo agregué a la descripción.", patch: { description: `${listing.description}\n\n${s}.`.slice(0, 4000) } };
  }
  const title = message.match(/t[ií]tulo\s*(?:a|:|por|=)?\s*["“]?(.{10,90}?)["”]?$/i);
  if (title) return { reply: "Listo, cambié el título.", patch: { title: title[1]!.trim() } };

  return {
    reply:
      "En modo demostración entiendo pedidos como “ponga el precio en 85 millones”, “use el precio justo”, “hágalo más corto” o “agregue que tiene llantas nuevas”. También puede editar el texto directamente.",
    patch: {},
  };
}

/** Primer mensaje del asistente cuando el aviso queda armado. */
export function firstMessage(d: DraftData): string {
  const v = d.valuation;
  if (v) {
    return (
      `Armé su aviso con un precio sugerido de ${cop(v.mid)} (rango justo de ${cop(v.low)} a ${cop(v.high)}). ` +
      "Dígame qué quiere cambiar: el precio, el tono, o algo que quiera contar del carro."
    );
  }
  return (
    "Armé su aviso. Como la placa no apareció en Fasecolda y hay pocos avisos parecidos, no puedo sugerirle un rango de precio: " +
    "escriba el precio o dígamelo aquí (por ejemplo “ponga el precio en 45 millones”)."
  );
}
