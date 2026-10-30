import { conditionBreakdown, templateDraft, type DraftInput, type TextDraft } from "@tcu/shared";

export { buildTitle, templateDraft, type DraftInput } from "@tcu/shared";
export type Draft = TextDraft;

/**
 * Redacción con Claude si hay ANTHROPIC_API_KEY; si falla o no hay clave, usa la plantilla.
 * El modelo se puede cambiar con ANTHROPIC_MODEL.
 */
export async function draftListing(i: DraftInput): Promise<TextDraft> {
  const fallback = templateDraft(i);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback;

  const facts = {
    vehiculo: { marca: i.vehicle.brand, linea: i.vehicle.line, version: i.vehicle.version, modelo: i.vehicle.modelYear, combustible: i.vehicle.fuel },
    kilometraje: i.km,
    ciudad: i.city,
    color: i.color,
    transmision: i.transmission,
    estado_0_a_100: conditionBreakdown(i.condition),
    siniestros: i.condition.claims,
    papeles_al_dia: i.condition.docsUpToDate,
    equipamiento: i.features,
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
        max_tokens: 700,
        system:
          "Redactas avisos de venta de carros usados en Colombia, en primera persona del vendedor y español colombiano. " +
          "Usa SOLO los datos entregados; no inventes equipamiento, historial ni cifras. Sin emojis, sin mayúsculas sostenidas, sin signos de exclamación. " +
          'Responde únicamente un JSON: {"title": string (máximo 90 caracteres: marca, línea, versión y año), "description": string (90 a 160 palabras, 3 o 4 párrafos cortos separados por línea en blanco)}.',
        messages: [{ role: "user", content: JSON.stringify(facts) }],
      }),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((b) => b.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { title?: string; description?: string };
    if (!json.title || !json.description || json.description.length < 40) return fallback;
    return { title: json.title.slice(0, 90), description: json.description.slice(0, 4000), source: "ia" };
  } catch {
    return fallback;
  }
}
