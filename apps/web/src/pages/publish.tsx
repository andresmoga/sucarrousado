import {
  BRAND,
  BRANDS,
  BODY_TYPES,
  CITIES,
  COLORS,
  FUELS,
  FEATURES,
  MIN_PHOTOS,
  PHOTO_ISSUES,
  PHOTO_SLOTS,
  TRANSMISSIONS,
  fairPosition,
  formatCOP,
  manualVehicleSchema,
  missingRequiredSlots,
  photoIssues,
  slotMismatch,
  type BodyType,
  type ConditionInput,
  type Draft,
  type DraftPhoto,
  type ManualVehicle,
  type Feature,
  type PhotoSlot,
  type Transmission,
} from "@tcu/shared";
import { AlertTriangle, Camera, CheckCircle2, Loader2, RefreshCw, Send, Sparkles, Timer, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CitySelect } from "@/components/city-select";
import { FairRangeBar } from "@/components/fair-price";
import { MAX_PHOTOS, MAX_PHOTO_MB, PhotoDropzone, checkLocalPhoto, type LocalPhoto } from "@/components/photo-dropzone";
import { PlateInput } from "@/components/plate-input";
import { QuickAuth } from "@/components/quick-auth";
import { InviteGate, SellerProfileCard } from "@/components/seller-gates";
import { RATING_OPTIONS, Segmented } from "@/components/rating";
import { ShareButtons, VideoCard } from "@/components/share";
import { Button } from "@/components/ui/button";
import { FieldError, Select, Textarea } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api, assetUrl, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSiteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

const STEPS = ["Fotos", "Confirmar", "Ajustar con IA", "Compartir"] as const;
const STEP_INDEX = { fotos: 0, confirmar: 1, editar: 2, publicado: 3 } as const;
const slotLabel = (k: string | null) => PHOTO_SLOTS.find((s) => s.key === k)?.label ?? "Sin ángulo";
const onlyDigits = (s: string, max = 12) => s.replace(/\D/g, "").slice(0, max);
const thousands = (s: string) => (s ? Number(s).toLocaleString("es-CO") : "");

// ───────────────────────── Piezas ─────────────────────────

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex gap-1.5" aria-label="Pasos para publicar">
      {STEPS.map((s, i) => (
        <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
          <div className={cn("h-1.5 rounded-full", i <= step ? "bg-foreground" : "bg-border")} />
          <span className={cn("mt-1.5 block text-xs sm:text-sm", i === step ? "font-semibold" : "text-muted-foreground")}>
            {i + 1}. {s}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Reloj de la promesa “menos de 5 minutos”. */
function Clock({ since, stopAt }: { since: number; stopAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (stopAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [stopAt]);
  const s = Math.max(0, Math.floor(((stopAt ?? now) - since) / 1000));
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-plate text-lg font-semibold", s > 300 ? "bg-secondary" : "bg-plate text-plate-ink")} aria-label={`Lleva ${mm} minutos y ${ss} segundos`}>
      <Timer className="size-4" /> {mm}:{ss}
    </span>
  );
}

function QualityPanel({ draft }: { draft: Draft }) {
  const q = draft.quality;
  return (
    <section aria-labelledby="calidad" className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="calidad" className="font-semibold">Calidad del aviso</h2>
        <span className={cn("font-plate text-3xl font-bold", q.score >= 80 ? "text-verdict" : q.score >= 60 ? "" : "text-destructive")}>
          {q.score}<span className="text-base text-muted-foreground">/100</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", q.score >= 80 ? "bg-verdict" : q.score >= 60 ? "bg-plate" : "bg-destructive")} style={{ width: `${q.score}%` }} />
      </div>
      <ul className="mt-4 grid gap-2.5 text-sm">
        {q.items.map((it) => (
          <li key={it.text} className="flex gap-2">
            {it.level === "bien" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verdict" />
            ) : (
              <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", it.level === "importante" ? "text-destructive" : "text-muted-foreground")} />
            )}
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────── Paso 2: confirmar ─────────────────────────

function ConfirmStep({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const rec = draft.data.recognition;
  const [plate, setPlate] = useState(draft.data.plate ?? "");
  const [km, setKm] = useState(draft.data.km ? String(draft.data.km) : "");
  const [city, setCity] = useState<(typeof CITIES)[number]>(draft.data.city ?? "Bogotá");
  const [color, setColor] = useState<(typeof COLORS)[number]>(draft.data.details?.color ?? rec?.color ?? "Blanco");
  const [bodyType, setBodyType] = useState<BodyType>(draft.data.details?.bodyType ?? rec?.bodyType ?? "Sedán");
  const [transmission, setTransmission] = useState<Transmission>(draft.data.details?.transmission ?? "Automática");
  const [doors, setDoors] = useState(draft.data.details?.doors ?? (bodyType === "Sedán" ? 4 : 5));
  const [armored, setArmored] = useState(draft.data.details?.armored ?? false);
  const [features, setFeatures] = useState<Feature[]>(draft.data.details?.features ?? rec?.features ?? []);
  const [cond, setCond] = useState<ConditionInput>(draft.data.details?.condition ?? { paint: 4, interior: 4, mechanics: 4, tires: 3, claims: "ninguno", docsUpToDate: true });
  const [busy, setBusy] = useState<null | "fotos" | "confirmar">(null);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const config = useSiteConfig();
  // Sin proveedor de Fasecolda/RUNT contratado: el vendedor escribe el carro desde el comienzo.
  const noProvider = config?.provider === "none";
  const [plateNotFound, setPlateNotFound] = useState(draft.data.vehicle?.source === "manual" || noProvider);
  const [manual, setManual] = useState({
    brand: draft.data.vehicle?.brand ?? rec?.brand ?? "",
    line: draft.data.vehicle?.line ?? rec?.line ?? "",
    version: draft.data.vehicle?.version ?? rec?.versionGuess ?? "",
    modelYear: draft.data.vehicle?.modelYear ? String(draft.data.vehicle.modelYear) : rec?.yearFrom && rec.yearFrom === rec.yearTo ? String(rec.yearFrom) : "",
    fuel: draft.data.vehicle?.fuel ?? "Gasolina",
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<{ replace?: string; slot?: PhotoSlot } | null>(null);
  const aiSeen = new Set(rec?.features ?? []);
  const set = <K extends keyof ConditionInput>(k: K) => (v: ConditionInput[K]) => setCond((c) => ({ ...c, [k]: v }));
  const refs = (p: DraftPhoto) => ({ url: p.url, slot: p.slot, slotConfirmed: p.slotConfirmed });

  async function updatePhotos(photos: { url: string; slot: PhotoSlot | null; slotConfirmed?: boolean }[]) {
    setBusy("fotos");
    try {
      setDraft(await api.setDraftPhotos(draft.id, photos));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function addPhotos(files: File[], slot: PhotoSlot | null = null) {
    setBusy("fotos");
    try {
      const room = MAX_PHOTOS - draft.data.photos.length;
      const urls: string[] = [];
      for (const f of files.slice(0, Math.max(1, room))) urls.push((await api.upload(f)).url);
      await updatePhotos([...draft.data.photos.map(refs), ...urls.map((url, i) => ({ url, slot: i === 0 ? slot : null }))]);
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }
  /** Cambia una foto por otra nueva en el mismo lugar y con el mismo ángulo; la IA la vuelve a revisar. */
  async function replacePhoto(oldUrl: string, file: File) {
    setBusy("fotos");
    try {
      const { url } = await api.upload(file);
      await updatePhotos(draft.data.photos.map((x) => (x.url === oldUrl ? { url, slot: x.slot } : refs(x))));
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }
  function pick(t: { replace?: string; slot?: PhotoSlot }) {
    setTarget(t);
    fileInput.current?.click();
  }

  const plateOk = /^[A-Z]{3}\d{3}$/.test(plate);
  const manualCheck = manualVehicleSchema.safeParse({ ...manual, modelYear: manual.modelYear ? Number(manual.modelYear) : undefined });
  const manualErrors = manualCheck.success ? {} : Object.fromEntries(manualCheck.error.issues.map((i) => [String(i.path[0]), i.message]));
  const missing = missingRequiredSlots(draft.data.photos);
  const errors: Record<string, string> = {
    ...(missing.length ? { fotos: `Falta una foto válida de: ${missing.map((k) => slotLabel(k).toLowerCase()).join(", ")}.` } : {}),
    ...(!plateOk ? { plate: plate ? "La placa tiene 3 letras y 3 números (ej. ABC 123)." : "Escriba la placa." } : {}),
    ...(!(Number(km) > 0) ? { km: "Escriba el kilometraje." } : {}),
    ...(!city ? { city: "Elija la ciudad." } : {}),
    ...(plateNotFound ? Object.fromEntries(Object.entries(manualErrors).map(([k, v]) => [`m-${k}`, v])) : {}),
  };
  const show = (k: string) => (tried ? errors[k] : undefined);

  async function submit() {
    setError("");
    setTried(true);
    const first = Object.keys(errors)[0];
    if (first) {
      const id = first === "fotos" ? "c-fotos" : first === "plate" ? "c-plate" : `c-${first}`;
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy("confirmar");
    try {
      const vehicle: ManualVehicle | undefined = plateNotFound && manualCheck.success ? manualCheck.data : undefined;
      setDraft(await api.confirmDraft(draft.id, { plate, km: Number(km), city, vehicle, details: { color, transmission, bodyType, doors, armored, features, condition: cond } }));
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.code === "placa_no_encontrada") {
        setPlateNotFound(true);
        setTimeout(() => document.getElementById("c-manual")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } else {
        setError(e instanceof ApiError && e.issues?.length ? e.issues.map((i) => i.message).join(" ") : errorText(e));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-10">
      {/* Lo que vio la IA */}
      <section className={cn("rounded-xl p-5", rec?.source === "ia" && rec.brand ? "border-2 border-verdict bg-verdict/5" : "border border-border bg-card")}>
        <div className="flex items-start gap-3">
          <Sparkles className={cn("mt-1 size-5 shrink-0", rec?.source === "ia" ? "text-verdict" : "text-muted-foreground")} />
          <div>
            {rec?.source === "ia" && rec.brand ? (
              <>
                <p className="text-lg font-semibold">
                  Reconocimos un {rec.brand} {rec.line}
                  {rec.yearFrom ? `, ${rec.yearFrom === rec.yearTo || !rec.yearTo ? rec.yearFrom : `${rec.yearFrom} a ${rec.yearTo}`}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {rec.versionGuess ? `Versión probable: ${rec.versionGuess}. ` : ""}Confianza {Math.round(rec.confidence * 100)} %. Confirme con la placa para traer la referencia exacta de Fasecolda.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">Confirme su carro con la placa</p>
                <p className="text-sm text-muted-foreground">{rec?.notes ?? "No pudimos reconocer el carro en las fotos."}</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Fotos con su ángulo */}
      <section aria-labelledby="c-fotos" className="grid gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !target) return;
            if (target.replace) void replacePhoto(target.replace, f);
            else void addPhotos([f], target.slot ?? null);
          }}
        />
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="c-fotos" className={cn("text-xl font-semibold", show("fotos") && "text-destructive")}>Sus fotos<span className="text-destructive" aria-hidden>*</span></h2>
            <p className="text-sm text-muted-foreground">
              {draft.data.photos.some((p) => p.aiChecked)
                ? "La IA revisó el ángulo de cada foto. Las marcadas en rojo no corresponden: reemplácelas o corrija el ángulo."
                : "Revise que cada foto tenga el ángulo correcto."}
            </p>
          </div>
          {busy === "fotos" && <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" /> Revisando fotos…</span>}
        </div>

        {/* Ángulos obligatorios */}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Fotos obligatorias">
          {PHOTO_SLOTS.filter((s) => s.required).map((s) => {
            const ok = !missing.includes(s.key);
            const bad = draft.data.photos.find((p) => p.slot === s.key && slotMismatch(p));
            return (
              <li key={s.key} className={cn("flex flex-col gap-1.5 rounded-md border px-3 py-2 text-sm", ok ? "border-verdict/40 bg-verdict/5" : "border-destructive bg-destructive/5")}>
                <span className={cn("flex items-center gap-1.5 font-semibold", ok ? "text-verdict" : "text-destructive")}>
                  {ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />} {s.label}
                </span>
                {!ok && (
                  <button type="button" className="flex items-center gap-1 text-left text-xs font-semibold underline underline-offset-2" onClick={() => (bad ? pick({ replace: bad.url }) : pick({ slot: s.key }))} disabled={busy !== null}>
                    <Camera className="size-3.5" /> {bad ? "Reemplazar foto" : "Subir esta foto"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {show("fotos") && <FieldError>{errors.fotos}</FieldError>}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {draft.data.photos.map((p, i) => {
            const issues = photoIssues(p);
            const wrong = slotMismatch(p);
            const notCar = p.aiIssues.includes("no_es_carro");
            const red = wrong || notCar;
            return (
              <li key={p.url} className={cn("overflow-hidden rounded-lg border bg-card", red ? "border-2 border-destructive" : "border-border")}>
                <div className="relative">
                  <img src={assetUrl(p.url)} alt={slotLabel(p.slot)} className={cn("aspect-[4/3] w-full object-cover", red && "opacity-80")} />
                  {red && <span className="absolute left-1.5 top-1.5 rounded bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white">Revisar</span>}
                  <button
                    type="button"
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1.5 text-white"
                    aria-label={`Quitar foto ${i + 1}`}
                    onClick={() => void updatePhotos(draft.data.photos.filter((x) => x.url !== p.url).map(refs))}
                    disabled={draft.data.photos.length <= 1 || busy !== null}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid gap-1.5 p-2">
                  <label className="sr-only" htmlFor={`slot-${i}`}>Ángulo de la foto {i + 1}</label>
                  <Select
                    id={`slot-${i}`}
                    className="h-9 text-sm"
                    aria-invalid={wrong || undefined}
                    value={p.slot ?? ""}
                    onChange={(e) => void updatePhotos(draft.data.photos.map((x) => (x.url === p.url ? { url: x.url, slot: (e.target.value || null) as PhotoSlot | null } : refs(x))))}
                    disabled={busy !== null}
                  >
                    <option value="">Sin ángulo</option>
                    {PHOTO_SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </Select>
                  {wrong && (
                    <p className="text-xs font-medium leading-snug text-destructive">
                      La IA ve {p.aiSlot ? `“${slotLabel(p.aiSlot).toLowerCase()}”` : "otra cosa"}, no “{slotLabel(p.slot).toLowerCase()}”.
                    </p>
                  )}
                  {issues.filter((x) => x !== "angulo_incorrecto").length > 0 ? (
                    <p className="text-xs leading-snug text-destructive">{issues.filter((x) => x !== "angulo_incorrecto").map((x) => PHOTO_ISSUES[x]).join(". ")}</p>
                  ) : !wrong ? (
                    <p className="flex items-center gap-1 text-xs text-verdict">
                      <CheckCircle2 className="size-3.5" /> {p.aiChecked && p.slot ? "Ángulo verificado" : "Buena calidad"}
                    </p>
                  ) : null}
                  {!p.aiChecked && <p className="text-xs text-muted-foreground">Ángulo sin verificar por la IA.</p>}
                  {red && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <Button type="button" size="sm" variant="outline" className="h-8 border-destructive text-destructive" onClick={() => pick({ replace: p.url })} disabled={busy !== null}>
                        <RefreshCw className="size-3.5" /> Reemplazar
                      </Button>
                      {wrong && p.aiSlot && (
                        <Button type="button" size="sm" variant="ghost" className="h-8" disabled={busy !== null}
                          onClick={() => void updatePhotos(draft.data.photos.map((x) => (x.url === p.url ? { url: x.url, slot: p.aiSlot! } : x.slot === p.aiSlot ? { url: x.url, slot: null } : refs(x))))}>
                          Usar como {slotLabel(p.aiSlot).toLowerCase()}
                        </Button>
                      )}
                      {wrong && (
                        <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={busy !== null}
                          onClick={() => void updatePhotos(draft.data.photos.map((x) => (x.url === p.url ? { url: x.url, slot: x.slot, slotConfirmed: true } : refs(x))))}>
                          Sí es correcta
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {draft.data.photos.length < MAX_PHOTOS && <PhotoDropzone compact photos={[]} onAdd={(f) => void addPhotos(f)} />}
      </section>

      {/* Identificación */}
      <section aria-labelledby="c-id" className="grid gap-4">
        <div>
          <h2 id="c-id" className="text-xl font-semibold">Identificación</h2>
          <p className="text-muted-foreground">
            {noProvider
              ? "La placa no se muestra en el aviso; la usamos para evitar avisos repetidos del mismo carro."
              : "Con la placa traemos la referencia exacta y el valor Fasecolda. La placa no se muestra en el aviso."}
          </p>
        </div>
        <div id="c-plate" className="grid gap-1.5">
          <Label invalid={!!show("plate")} required>Placa</Label>
          <PlateInput value={plate} onChange={(v) => { setPlate(v); setPlateNotFound(noProvider); }} city={city} invalid={!!show("plate")} />
          <FieldError>{show("plate")}</FieldError>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="c-km" required invalid={!!show("km")}>Kilometraje</Label>
            <Input id="c-km" inputMode="numeric" placeholder="45.000" value={thousands(km)} onChange={(e) => setKm(onlyDigits(e.target.value, 7))} aria-invalid={!!show("km") || undefined} aria-describedby={show("km") ? "c-km-err" : undefined} />
            <FieldError id="c-km-err">{show("km")}</FieldError>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-city" required invalid={!!show("city")}>Municipio donde está el carro</Label>
            <CitySelect id="c-city" value={city} onChange={(e) => setCity(e.target.value as typeof city)} aria-invalid={!!show("city") || undefined} />
            <FieldError>{show("city")}</FieldError>
          </div>
        </div>

        {plateNotFound && (
          <div id="c-manual" className="grid gap-4 rounded-lg border-2 border-plate-ink/70 bg-plate/15 p-4">
            <div>
              <p className="font-semibold">{noProvider ? "Datos del carro" : `No encontramos la placa ${plate.slice(0, 3)} ${plate.slice(3)} en Fasecolda`}</p>
              <p className="text-sm text-muted-foreground">
                Escriba los datos del carro tal como aparecen en la tarjeta de propiedad. Sin el valor Fasecolda, el precio justo sale solo de avisos parecidos.
              </p>
            </div>
            <datalist id="brands">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["brand", "Marca", { list: "brands", placeholder: "Ej.: Chevrolet", autoComplete: "off" }],
                ["line", "Línea", { placeholder: "Ej.: Onix" }],
                ["modelYear", "Año modelo", { inputMode: "numeric", placeholder: "2019", maxLength: 4 }],
              ] as const).map(([k, label, props]) => (
                <div key={k} className="grid gap-1.5">
                  <Label htmlFor={`c-m-${k}`} required invalid={!!show(`m-${k}`)}>{label}</Label>
                  <Input
                    id={`c-m-${k}`}
                    {...props}
                    value={manual[k]}
                    onChange={(e) => setManual((m) => ({ ...m, [k]: k === "modelYear" ? onlyDigits(e.target.value, 4) : e.target.value }))}
                    aria-invalid={!!show(`m-${k}`) || undefined}
                  />
                  <FieldError>{show(`m-${k}`)}</FieldError>
                </div>
              ))}
              <div className="grid gap-1.5">
                <Label htmlFor="c-m-fuel">Combustible</Label>
                <Select id="c-m-fuel" value={manual.fuel} onChange={(e) => setManual((m) => ({ ...m, fuel: e.target.value }))}>
                  {FUELS.map((f) => <option key={f}>{f}</option>)}
                </Select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="c-m-version">Versión <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="c-m-version" placeholder="Ej.: LT 1.4 Turbo" value={manual.version} onChange={(e) => setManual((m) => ({ ...m, version: e.target.value }))} />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Técnicas */}
      <section aria-labelledby="c-tec" className="grid gap-4">
        <h2 id="c-tec" className="text-xl font-semibold">Características técnicas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="c-tr">Transmisión</Label>
            <Select id="c-tr" value={transmission} onChange={(e) => setTransmission(e.target.value as Transmission)}>{TRANSMISSIONS.map((t) => <option key={t}>{t}</option>)}</Select></div>
          <div className="grid gap-1.5"><Label htmlFor="c-body">Carrocería {rec?.bodyType && <span className="font-normal text-muted-foreground">(vista por la IA)</span>}</Label>
            <Select id="c-body" value={bodyType} onChange={(e) => setBodyType(e.target.value as BodyType)}>{BODY_TYPES.map((b) => <option key={b}>{b}</option>)}</Select></div>
          <div className="grid gap-1.5"><Label htmlFor="c-color">Color {rec?.color && <span className="font-normal text-muted-foreground">(visto por la IA)</span>}</Label>
            <Select id="c-color" value={color} onChange={(e) => setColor(e.target.value as typeof color)}>{COLORS.map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div className="grid gap-1.5"><Label htmlFor="c-doors">Puertas</Label>
            <Select id="c-doors" value={doors} onChange={(e) => setDoors(Number(e.target.value))}>{[2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</Select></div>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-4 accent-foreground" checked={armored} onChange={(e) => setArmored(e.target.checked)} /> Es blindado
        </label>
      </section>

      {/* Estado */}
      <section aria-labelledby="c-estado" className="grid gap-4">
        <div>
          <h2 id="c-estado" className="text-xl font-semibold">Estado y detalle</h2>
          <p className="text-muted-foreground">Sea honesto: el puntaje se muestra en el aviso y el comprador lo va a revisar.</p>
        </div>
        <Segmented name="paint" legend="Pintura" options={RATING_OPTIONS} value={cond.paint} onChange={set("paint")} hint="Rayones, golpes, partes repintadas" />
        <Segmented name="interior" legend="Cojinería e interior" options={RATING_OPTIONS} value={cond.interior} onChange={set("interior")} />
        <Segmented name="mechanics" legend="Mecánica" options={RATING_OPTIONS} value={cond.mechanics} onChange={set("mechanics")} hint="Motor, caja, suspensión, mantenimientos al día" />
        <Segmented name="tires" legend="Llantas" options={RATING_OPTIONS} value={cond.tires} onChange={set("tires")} />
        <Segmented name="claims" legend="Siniestros" options={[{ value: "ninguno", label: "Ninguno" }, { value: "menor", label: "Choque menor" }, { value: "mayor", label: "Choque mayor" }]} value={cond.claims} onChange={set("claims")} />
      </section>

      {/* Equipamiento */}
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-xl font-semibold">Equipamiento</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <label key={f} className="flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="size-4 accent-foreground" checked={features.includes(f)} onChange={(e) => setFeatures((fs) => (e.target.checked ? [...fs, f] : fs.filter((x) => x !== f)))} />
              {f}
              {aiSeen.has(f) && <span className="rounded bg-verdict/15 px-1.5 text-xs font-medium text-verdict">visto por la IA</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Documentos */}
      <section aria-labelledby="c-docs" className="grid gap-3">
        <h2 id="c-docs" className="text-xl font-semibold">Documentos</h2>
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" className="size-4 accent-foreground" checked={cond.docsUpToDate} onChange={(e) => set("docsUpToDate")(e.target.checked)} />
          SOAT, revisión técnico-mecánica e impuestos al día
        </label>
      </section>

      <div className="grid gap-2 border-t border-border pt-5">
        {tried && Object.keys(errors).length > 0 && (
          <div role="alert" className="rounded-md border border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <p className="font-semibold">Complete los campos marcados en rojo:</p>
            <ul className="mt-1 list-disc pl-5">{Object.values(errors).map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        <FieldError>{error}</FieldError>
        <div className="flex justify-end">
          <Button size="lg" onClick={() => void submit()} disabled={busy !== null}>
            {busy === "confirmar" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy === "confirmar" ? "Calculando precio y redactando…" : "Generar mi aviso"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Paso 3: ajustar con IA ─────────────────────────

const SUGGESTIONS = [
  "Use el precio justo sugerido",
  "Hágalo más corto",
  "Agregue que tiene todos los mantenimientos en concesionario",
  "Ponga el precio en 2 millones menos",
];

function ChatPanel({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [draft.data.chat.length]);

  async function send(text: string) {
    let message = text.trim();
    if (!message || sending) return;
    // Atajo: “2 millones menos” se resuelve con el precio actual.
    const less = message.match(/(\d+(?:[.,]\d+)?)\s*millones?\s*menos/i);
    if (less && draft.data.listing) {
      const v = draft.data.listing.priceCop - Math.round(Number(less[1]!.replace(",", ".")) * 1_000_000);
      message = `Ponga el precio en ${v.toLocaleString("es-CO")}`;
    }
    setSending(true);
    setError("");
    setMsg("");
    try {
      setDraft(await api.chat(draft.id, message));
    } catch (e) {
      setError(errorText(e));
      setMsg(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="chat" className="flex flex-col rounded-lg border-2 border-foreground bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="size-4" />
        <h2 id="chat" className="font-semibold">Ajuste su aviso conversando</h2>
        {!draft.aiEnabled && <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-xs">modo demostración</span>}
      </div>
      <div className="flex max-h-[360px] min-h-[200px] flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {draft.data.chat.map((m, i) => (
          <p
            key={i}
            className={cn(
              "max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
              m.role === "user" ? "self-end rounded-br-sm bg-foreground text-background" : "self-start rounded-bl-sm bg-secondary",
            )}
          >
            {m.text}
          </p>
        ))}
        {sending && <p className="flex items-center gap-2 self-start text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Ajustando…</p>}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-border px-4 pt-3">
        {SUGGESTIONS.filter((s) => draft.data.valuation || !s.includes("precio justo")).map((s) => (
          <button key={s} type="button" onClick={() => void send(s)} disabled={sending} className="rounded-full border border-input px-3 py-1 text-sm hover:border-foreground disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(msg);
        }}
      >
        <label htmlFor="chat-msg" className="sr-only">Escriba qué quiere cambiar</label>
        <Input id="chat-msg" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ej.: cuente que tiene un solo dueño" maxLength={600} />
        <Button type="submit" aria-label="Enviar" disabled={!msg.trim() || sending}><Send /></Button>
      </form>
      {error && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

function EditStep({ draft, setDraft, onPublished }: { draft: Draft; setDraft: (d: Draft) => void; onPublished: (d: Draft) => void }) {
  const { user } = useAuth();
  const l = draft.data.listing!;
  const val = draft.data.valuation;
  const [title, setTitle] = useState(l.title);
  const [price, setPrice] = useState(l.priceCop ? String(l.priceCop) : "");
  const [description, setDescription] = useState(l.description);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  // Cuando el chat cambia el aviso, los campos se ponen al día.
  useEffect(() => {
    setTitle(l.title);
    setPrice(l.priceCop ? String(l.priceCop) : "");
    setDescription(l.description);
  }, [l.title, l.priceCop, l.description]);

  async function save(patch: { title?: string; description?: string; priceCop?: number }) {
    const changed = Object.entries(patch).some(([k, v]) => v !== (l as Record<string, unknown>)[k]);
    if (!changed) return;
    try {
      setDraft(await api.patchDraftListing(draft.id, patch));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError && e.code === "datos_invalidos" ? "Revise el texto: título de 10 a 90 caracteres, descripción de al menos 40 y precio desde $5.000.000." : errorText(e));
    }
  }

  async function publish() {
    if (bad.title || bad.price || bad.description) {
      setError("Complete los campos marcados en rojo antes de publicar.");
      return;
    }
    setPublishing(true);
    setError("");
    try {
      const r = await api.publishDraft(draft.id);
      onPublished(r.draft);
    } catch (e) {
      setError(e instanceof ApiError && e.issues?.length ? e.issues.map((i) => i.message).join(" ") : errorText(e));
    } finally {
      setPublishing(false);
    }
  }

  const cover = [...draft.data.photos].sort((a, b) => (a.slot === "tres_cuartos" ? -1 : b.slot === "tres_cuartos" ? 1 : 0));
  const pos = val ? fairPosition(Number(price), val.low, val.high) : null;
  const bad = {
    title: title.trim().length < 10 ? "El título necesita al menos 10 caracteres." : "",
    price: Number(price) < 5_000_000 ? "Escriba el precio (desde $5.000.000)." : "",
    description: description.trim().length < 40 ? "Cuente un poco más (mínimo 40 caracteres)." : "",
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      {/* Vista previa editable */}
      <section aria-labelledby="preview" className="min-w-0 rounded-xl border border-border bg-card">
        <h2 id="preview" className="sr-only">Vista previa del aviso</h2>
        <img src={assetUrl(cover[0]?.url)} alt="" className="aspect-[8/5] w-full rounded-t-xl object-cover" />
        <div className="flex gap-1.5 overflow-x-auto p-2">
          {cover.slice(1, 8).map((p) => <img key={p.url} src={assetUrl(p.url)} alt="" className="aspect-[4/3] h-14 rounded object-cover" />)}
        </div>
        <div className="grid gap-4 p-5 pt-2">
          {draft.data.match === "diferente" && (
            <p className="flex gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> La placa dice {draft.data.vehicle?.brand} {draft.data.vehicle?.line}, pero en las fotos se ve otro carro. Revíselo antes de publicar.
            </p>
          )}
          <div className="grid gap-1">
            <Label htmlFor="e-title" className="text-muted-foreground" required invalid={!!bad.title}>Título</Label>
            <input id="e-title" value={title} maxLength={90} onChange={(e) => setTitle(e.target.value)} onBlur={() => void save({ title })} aria-invalid={!!bad.title || undefined} className="w-full rounded-md border border-transparent bg-transparent px-1 text-2xl font-semibold leading-snug hover:border-input focus:border-input aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive/5" />
            <FieldError>{bad.title}</FieldError>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="e-price" className="text-muted-foreground" required invalid={!!bad.price}>Precio</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 font-plate text-4xl font-bold">$</span>
              <input
                id="e-price"
                inputMode="numeric"
                value={thousands(price)}
                onChange={(e) => setPrice(onlyDigits(e.target.value, 10))}
                onBlur={() => Number(price) >= 5_000_000 && void save({ priceCop: Number(price) })}
                placeholder="0"
                aria-invalid={!!bad.price || undefined}
                className="w-full rounded-md border border-transparent bg-transparent py-1 pl-7 font-plate text-5xl font-bold leading-none hover:border-input focus:border-input aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive/5"
              />
            </div>
            <FieldError>{bad.price}</FieldError>
            {!val && <p className="text-sm text-muted-foreground">Sin valor Fasecolda y con pocos avisos parecidos no hay rango sugerido. Ponga el precio que pide.</p>}
            {pos === "bajo" && <p className="text-sm text-verdict">Por debajo del rango justo: aparecerá entre las mejores ofertas.</p>}
            {pos === "en_rango" && <p className="text-sm text-verdict">Dentro del rango justo.</p>}
            {pos === "alto" && <p className="text-sm text-muted-foreground">Por encima del rango justo.</p>}
          </div>
          {val && (
            <div className="rounded-lg bg-secondary/60 p-4">
              <p className="text-sm font-semibold">Precio justo sugerido: {formatCOP(val.low)} a {formatCOP(val.high)}</p>
              <FairRangeBar fair={val} fasecolda={val.fasecoldaValue} price={Number(price) || undefined} className="mt-2" />
            </div>
          )}
          <div className="grid gap-1">
            <Label htmlFor="e-desc" className="text-muted-foreground" required invalid={!!bad.description}>Descripción</Label>
            <Textarea id="e-desc" className="min-h-[220px] text-[15px]" value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} onBlur={() => void save({ description })} aria-invalid={!!bad.description || undefined} />
            <FieldError>{bad.description}</FieldError>
          </div>
          {draft.data.details?.features.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {draft.data.details.features.map((f) => <li key={f} className="rounded-full bg-secondary px-2.5 py-0.5 text-sm">{f}</li>)}
            </ul>
          ) : null}
        </div>
      </section>

      <div className="grid content-start gap-5">
        <ChatPanel draft={draft} setDraft={setDraft} />
        <QualityPanel draft={draft} />
        {user && !user.sellerProfileComplete && <SellerProfileCard onSaved={() => setError("")} />}
        <div className="grid gap-2 rounded-lg border-2 border-plate-ink bg-plate p-5 text-plate-ink">
          <p className="font-semibold">
            {user && !user.sellerProfileComplete ? "Guarde sus datos de vendedor y publique." : "Todo listo. Al publicar le hacemos un video para redes."}
          </p>
          <FieldError>{error}</FieldError>
          <Button size="lg" onClick={() => void publish()} disabled={publishing || (!!user && !user.sellerProfileComplete)}>
            {publishing && <Loader2 className="animate-spin" />} Publicar gratis
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Página ─────────────────────────

export default function PublishPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<LocalPhoto[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<null | "subiendo" | "reconociendo">(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState("");
  const [localStart] = useState(() => Date.now());
  const pending = useRef(false);

  async function addFiles(files: File[]) {
    setError("");
    const room = MAX_PHOTOS - local.length;
    const tooBig = files.filter((f) => f.size > MAX_PHOTO_MB * 1024 * 1024);
    if (tooBig.length) setError(`${tooBig.length} foto(s) pesan más de ${MAX_PHOTO_MB} MB y no se agregaron.`);
    const checked = await Promise.all(files.filter((f) => f.size <= MAX_PHOTO_MB * 1024 * 1024).slice(0, room).map(checkLocalPhoto));
    setLocal((l) => [...l, ...checked]);
  }

  // Fotos elegidas desde el inicio del sitio.
  useEffect(() => {
    const files = (location.state as { files?: File[] } | null)?.files;
    if (files?.length) {
      void addFiles(files);
      nav(location.pathname + location.search, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retomar un borrador (?borrador=id).
  useEffect(() => {
    const id = params.get("borrador");
    if (id && user && !draft) api.getDraft(id).then(setDraft).catch(() => setParams({}, { replace: true }));
  }, [params, user, draft, setParams]);

  async function start(signedIn = false) {
    if (!user && !signedIn) {
      pending.current = true;
      setAuthOpen(true);
      return;
    }
    setError("");
    setBusy("subiendo");
    setProgress({ done: 0, total: local.length });
    try {
      const urls: string[] = new Array(local.length);
      let next = 0;
      const worker = async () => {
        while (next < local.length) {
          const i = next++;
          urls[i] = (await api.upload(local[i]!.file)).url;
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const created = await api.createDraft(urls);
      setParams({ borrador: created.id }, { replace: true });
      setDraft(created);
      setBusy("reconociendo");
      setDraft(await api.recognize(created.id));
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const step = draft ? STEP_INDEX[draft.data.step] : 0;
  // El reloj cuenta desde que eligió la primera foto (o desde que se creó el borrador, si lo retoma).
  const since = draft ? Math.min(localStart, Date.parse(draft.data.startedAt)) : localStart;
  const done = draft?.data.step === "publicado";

  if (loading) return null;

  return (
    <div className="container max-w-5xl py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-plate text-4xl font-bold sm:text-5xl">Publique su carro en menos de 5 minutos</h1>
          <p className="mt-1 text-muted-foreground">Gratis. Usted sube las fotos; la IA reconoce el carro, sugiere el precio y redacta el aviso.</p>
        </div>
        {(local.length > 0 || draft) && <Clock since={since} stopAt={done && draft ? Date.parse(draft.updatedAt) : undefined} />}
      </div>
      <div className="mt-6"><Stepper step={step} /></div>

      <div className="mt-8">
        {!draft && (
          <section className="grid gap-6">
            {user && !user.canPublish && <InviteGate />}
            <PhotoDropzone photos={local} onAdd={(f) => void addFiles(f)} onRemove={(id) => setLocal((l) => l.filter((p) => p.id !== id))} />
            <FieldError>{error}</FieldError>
            {busy ? (
              <div className="flex items-center gap-3 rounded-lg bg-foreground p-5 text-background" role="status">
                <Loader2 className="size-6 animate-spin" />
                <div>
                  <p className="font-semibold">{busy === "subiendo" ? `Subiendo fotos ${progress.done} de ${progress.total}…` : "La IA está mirando sus fotos…"}</p>
                  <p className="text-sm opacity-75">{busy === "subiendo" ? "Las optimizamos y les quitamos la ubicación GPS." : "Marca, modelo, años, color, equipamiento visible y calidad de cada foto."}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {local.length < MIN_PHOTOS ? `Suba al menos ${MIN_PHOTOS} fotos para seguir (lleva ${local.length}).` : `${local.length} fotos listas.`}
                </p>
                <Button size="lg" onClick={() => void start()} disabled={local.length < MIN_PHOTOS || (!!user && !user.canPublish)}>
                  <Sparkles /> Reconocer mi carro con IA
                </Button>
              </div>
            )}
          </section>
        )}

        {draft?.data.step === "fotos" && (
          <div className="flex items-center gap-3"><Loader2 className="animate-spin" /> Retomando su borrador…</div>
        )}
        {draft?.data.step === "confirmar" && <ConfirmStep draft={draft} setDraft={setDraft} />}
        {draft?.data.step === "editar" && <EditStep draft={draft} setDraft={setDraft} onPublished={setDraft} />}
        {done && draft?.data.listingId && draft.data.listing && (
          <section className="grid gap-6">
            <div className="rounded-xl bg-foreground p-6 text-background">
              <p className="flex items-center gap-2 text-sm font-medium text-plate"><CheckCircle2 className="size-4" /> Publicado</p>
              <h2 className="mt-1 font-plate text-4xl font-bold">Su carro ya está en {BRAND.domain}</h2>
              <p className="mt-1 opacity-80">Ahora compártalo: los avisos compartidos el primer día reciben muchos más contactos.</p>
              <Button asChild variant="accent" className="mt-4">
                <Link to={`/carros/${draft.data.listingId}`}>Ver mi aviso</Link>
              </Button>
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
              <section aria-labelledby="compartir" className="grid content-start gap-3 rounded-lg border border-border bg-card p-5">
                <h2 id="compartir" className="font-semibold">Compartir en redes</h2>
                <ShareButtons listingId={draft.data.listingId} title={draft.data.listing.title} priceCop={draft.data.listing.priceCop} />
                <p className="text-xs text-muted-foreground">El enlace muestra la foto, el modelo y el precio en WhatsApp, Facebook y X.</p>
              </section>
              <VideoCard listingId={draft.data.listingId} title={draft.data.listing.title} isOwner />
            </div>
          </section>
        )}
      </div>

      <QuickAuth
        open={authOpen}
        onOpenChange={setAuthOpen}
        onDone={() => {
          if (pending.current) {
            pending.current = false;
            // Espera a que la sesión quede guardada y sigue con las mismas fotos.
            setTimeout(() => void start(true), 0);
          }
        }}
      />
    </div>
  );
}
