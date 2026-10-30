import { type ConditionInput } from "@tcu/shared";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlateInput } from "@/components/plate-input";
import { RATING_OPTIONS, Segmented } from "@/components/rating";
import { CitySelect } from "@/components/city-select";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ValuationResult } from "@/components/valuation-result";
import { PlateNotFoundError, api, errorText, requestValuation, type Valuation } from "@/lib/api";
import { useSiteConfig } from "@/lib/site";

const PLATE_RE = /^[A-Z]{3}\d{3}$/;

export default function ValuationPage() {
  const [params] = useSearchParams();
  const [plate, setPlate] = useState((params.get("placa") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
  const [km, setKm] = useState("");
  const [city, setCity] = useState<string>("Bogotá");
  const [cond, setCond] = useState<ConditionInput>({ paint: 4, interior: 4, mechanics: 4, tires: 3, claims: "ninguno", docsUpToDate: true });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Valuation | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const config = useSiteConfig();
  const DEMO_PLATES = config?.demoPlates ?? [];
  const set = <K extends keyof ConditionInput>(k: K) => (v: ConditionInput[K]) => setCond((c) => ({ ...c, [k]: v }));

  const [tried, setTried] = useState(false);
  const kmError = tried && !(Number(km) > 0) ? "Escriba el kilometraje." : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!(Number(km) > 0)) {
      document.getElementById("km")?.focus();
      return;
    }
    setStatus("loading");
    setError("");
    try {
      setResult(await requestValuation({ plate, km: Number(km), city, condition: cond }, config?.provider === "mock"));
      setStatus("idle");
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setStatus("error");
      setError(err instanceof PlateNotFoundError ? `No encontramos la placa ${plate}. Revise que esté bien escrita.` : errorText(err));
    }
  }

  return (
    <div className="container pb-10">
      <section className="max-w-2xl pt-8 sm:pt-14">
        <h1 className="font-plate text-5xl font-bold leading-[0.95] sm:text-7xl">¿Cuánto vale su carro usado hoy?</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Escriba la placa. Cruzamos el valor Fasecolda con avisos de carros como el suyo y con su estado real, y le
          mostramos el precio y la razón de cada ajuste. Gratis y sin registrarse.
        </p>
      </section>

      {config?.provider === "none" ? <ComingSoon /> : (
      <form onSubmit={onSubmit} className="mt-10 grid max-w-2xl gap-10" noValidate>
        <div>
          <PlateInput value={plate} onChange={setPlate} city={city} />
          {DEMO_PLATES.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
              Placas de prueba:{" "}
              {DEMO_PLATES.map((p, i) => (
                <span key={p}>
                  <button type="button" className="font-plate font-semibold underline underline-offset-2" onClick={() => setPlate(p)}>{p}</button>
                  {i < DEMO_PLATES.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          )}
        </div>

        {PLATE_RE.test(plate) && (
          <div className="grid gap-8 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="km" required invalid={!!kmError}>Kilometraje</Label>
                <Input id="km" inputMode="numeric" placeholder="45000" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, "").slice(0, 7))} aria-invalid={!!kmError || undefined} />
                {kmError && <p className="text-sm font-medium text-destructive">{kmError}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="city" required>Municipio</Label>
                <CitySelect id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4">
              <h2 className="text-lg font-semibold">¿En qué estado está?</h2>
              <Segmented name="paint" legend="Pintura" options={RATING_OPTIONS} value={cond.paint} onChange={set("paint")} hint="Rayones, golpes, partes repintadas" />
              <Segmented name="interior" legend="Cojinería e interior" options={RATING_OPTIONS} value={cond.interior} onChange={set("interior")} />
              <Segmented name="mechanics" legend="Mecánica" options={RATING_OPTIONS} value={cond.mechanics} onChange={set("mechanics")} hint="Motor, caja, suspensión, mantenimientos al día" />
              <Segmented name="tires" legend="Llantas" options={RATING_OPTIONS} value={cond.tires} onChange={set("tires")} />
              <Segmented name="claims" legend="Siniestros" options={[{ value: "ninguno", label: "Ninguno" }, { value: "menor", label: "Choque menor" }, { value: "mayor", label: "Choque mayor" }]} value={cond.claims} onChange={set("claims")} />
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="size-4 accent-foreground" checked={cond.docsUpToDate} onChange={(e) => set("docsUpToDate")(e.target.checked)} />
                SOAT, revisión técnico-mecánica e impuestos al día
              </label>
            </div>

            <div>
              <Button type="submit" variant="accent" size="lg" disabled={status === "loading"} className="border-2 border-plate-ink">
                {status === "loading" && <Loader2 className="animate-spin" />}
                Calcular precio justo
              </Button>
              {status === "error" && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p>}
            </div>
          </div>
        )}
      </form>
      )}

      <div ref={resultRef} className="mt-12 max-w-2xl scroll-mt-20" aria-live="polite">
        {result && <ValuationResult v={result} />}
      </div>

      <p className="mt-16 max-w-2xl text-muted-foreground">
        ¿Quiere saber cómo lo calculamos? <Link to="/como-funciona" className="font-semibold text-foreground underline underline-offset-2">Así funciona el precio justo</Link>.
      </p>
    </div>
  );
}

/** Sin proveedor de Fasecolda contratado todavía: lista de espera en vez de una tasación incompleta. */
function ComingSoon() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  return (
    <div className="mt-10 grid max-w-2xl gap-4 rounded-xl border-2 border-plate-ink bg-plate/20 p-6">
      <h2 className="text-xl font-semibold">La tasación por placa llega pronto</h2>
      <p className="text-muted-foreground">
        Estamos conectando los valores de referencia de Fasecolda. Déjenos su correo y le avisamos cuando pueda calcular el precio justo de su carro.
      </p>
      {state === "ok" ? (
        <p className="font-semibold text-verdict">Listo. Le escribiremos a {email}.</p>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            api.joinWaitlist(email).then(() => setState("ok"), () => setState("error"));
          }}
        >
          <label htmlFor="w-email" className="sr-only">Correo</label>
          <Input id="w-email" type="email" required placeholder="su@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
          <Button type="submit">Avisarme</Button>
        </form>
      )}
      {state === "error" && <p className="text-sm text-destructive">Revise el correo e inténtelo de nuevo.</p>}
    </div>
  );
}
