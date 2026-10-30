/**
 * Integración con Claude (API de Anthropic). Sin ANTHROPIC_API_KEY todo sigue funcionando
 * en "modo demostración": reglas simples y el vendedor confirma a mano.
 */
import {
  CHAT_SYSTEM,
  CLASSIFY_SYSTEM,
  RECOGNIZE_SYSTEM,
  chatPrompt,
  classifyPrompt,
  demoRecognition,
  extractJson,
  parseChat,
  parseClassification,
  parseRecognition,
  recognizePrompt,
  type DraftData,
  type PhotoCheck,
  type PhotoSlot,
  type RecognitionResult,
} from "@tcu/shared";
import sharp from "sharp";
import { ruleChat, type ChatResult } from "@tcu/shared";

export { demoRecognition, ruleChat, type ChatResult, type RecognitionResult };
import { z } from "zod";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } };

/** Llama a Claude y devuelve el texto de la respuesta, o null si falla o no hay clave. */
export async function callClaude(opts: {
  system: string;
  content: Block[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: opts.maxTokens ?? 900,
        system: opts.system,
        messages: [{ role: "user", content: opts.content }],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return body.content?.find((b) => b.type === "text")?.text ?? null;
  } catch {
    return null;
  }
}

/** Saca el primer objeto JSON del texto y lo valida. */
export function parseJson<T>(text: string | null, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const r = schema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

async function imageBlock(photo: Buffer): Promise<Block> {
  const data = await sharp(photo).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") } };
}

// ───────────────────────── Reconocer el carro y revisar fotos ─────────────────────────

async function photoContent(paths: Buffer[], prompt: string): Promise<Block[]> {
  const content: Block[] = [];
  for (const [i, p] of paths.entries()) {
    content.push({ type: "text", text: `Foto ${i + 1}:` });
    content.push(await imageBlock(p));
  }
  content.push({ type: "text", text: prompt });
  return content;
}

export async function recognizeVehicle(photoPaths: Buffer[]): Promise<RecognitionResult> {
  if (!aiEnabled()) return demoRecognition(photoPaths.length);
  const paths = photoPaths.slice(0, 12);
  const text = await callClaude({ system: RECOGNIZE_SYSTEM, content: await photoContent(paths, recognizePrompt(paths.length)), maxTokens: 1500 });
  const r = parseRecognition(extractJson(text), photoPaths.length);
  return r ?? demoRecognition(photoPaths.length, "No pudimos revisar las fotos con la IA esta vez: confirme los datos con la placa y revise el ángulo de cada foto.");
}

/** Revisa fotos nuevas (agregadas o reemplazadas). Sin IA, o si falla, quedan sin verificar. */
export async function classifyPhotos(photoPaths: Buffer[], taken: Set<PhotoSlot>): Promise<PhotoCheck[] | null> {
  if (!aiEnabled() || !photoPaths.length) return null;
  const text = await callClaude({ system: CLASSIFY_SYSTEM, content: await photoContent(photoPaths, classifyPrompt(photoPaths.length)), maxTokens: 600 });
  return parseClassification(extractJson(text), photoPaths.length, taken);
}

// ───────────────────────── Editar el aviso conversando ─────────────────────────

export async function chatEdit(d: DraftData, message: string): Promise<ChatResult> {
  if (!aiEnabled() || !d.listing) return ruleChat(d, message);
  const text = await callClaude({ system: CHAT_SYSTEM, content: [{ type: "text", text: chatPrompt(d, message) }], maxTokens: 1500 });
  return parseChat(extractJson(text)) ?? ruleChat(d, message);
}
