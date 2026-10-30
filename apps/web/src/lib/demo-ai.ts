/**
 * IA de la demostración: cuando la página se abre como Artifact de Claude, usa la capacidad `sample`
 * (Claude con la cuenta de quien mira, con permiso) con las mismas instrucciones que el servidor
 * (`ai-prompts.ts` de @tcu/shared). Fuera de Claude, o si la persona no da permiso, devuelve null y la
 * demo sigue con reglas.
 */

interface SampleLimits {
  images?: { maxCount: number };
}
interface SampleFn {
  (input: string, opts?: { images?: Blob[]; modelTier?: "quick" | "default" | "complex"; cache?: boolean }): Promise<{ text: string }>;
  json: (input: string, opts?: { images?: Blob[]; modelTier?: "quick" | "default" | "complex"; cache?: boolean }) => Promise<unknown>;
  limits: () => Promise<SampleLimits>;
}
interface ClaudeRuntime {
  use: (name: string) => Promise<unknown>;
}

let sampleP: Promise<SampleFn | null> | null = null;
let denied = false;

function sample(): Promise<SampleFn | null> {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (!c?.use) return Promise.resolve(null);
  sampleP ??= c.use("sample").then((s) => (s as SampleFn | null) ?? null).catch(() => null);
  return sampleP;
}

/** ¿Puede esta vista pedirle a Claude que mire fotos? (No pregunta nada a la persona.) */
export async function aiAvailable(): Promise<{ text: boolean; images: number }> {
  if (denied) return { text: false, images: 0 };
  const s = await sample();
  if (!s) return { text: false, images: 0 };
  const lim = await s.limits().catch(() => null);
  return { text: true, images: lim?.images?.maxCount ?? 0 };
}

function dataUrlToBlob(url: string): Blob {
  const [head, b64 = ""] = url.split(",");
  const type = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Pide un JSON a Claude. null si no hay IA, la persona no dio permiso o la respuesta no sirve. */
export async function askJson(system: string, prompt: string, opts: { images?: string[]; tier?: "quick" | "default" } = {}): Promise<unknown> {
  if (denied) return null;
  const s = await sample();
  if (!s) return null;
  try {
    return await s.json(`${system}\n\n${prompt}`, {
      images: opts.images?.map(dataUrlToBlob),
      modelTier: opts.tier ?? "default",
      cache: false,
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "not_granted" || code === "sampling_disabled" || code === "not_declared" || code === "capability_disabled") denied = true;
    console.warn("IA de la demostración no disponible:", code);
    return null;
  }
}

/** Guarda un archivo con la capacidad `downloads` del visor de Claude. false si no está disponible. */
export async function saveWithViewer(filename: string, data: Blob): Promise<boolean> {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (!c?.use) return false;
  const d = (await c.use("downloads").catch(() => null)) as { save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null;
  if (!d) return false;
  try {
    await d.save({ filename, data });
  } catch {
    /* la persona no aceptó o no está disponible */
  }
  return true;
}
