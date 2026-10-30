import { formatCOP, formatPct } from "@tcu/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import { FairRangeBar } from "@/components/fair-price";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Valuation } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ValuationResult({ v }: { v: Valuation }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    try {
      await api.joinWaitlist(email, v.id);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <section aria-labelledby="resultado" className="rounded-xl border-2 border-foreground bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="resultado" className="text-lg font-semibold">
          {v.vehicle.brand} {v.vehicle.line} {v.vehicle.modelYear}
        </h2>
        {v.vehicle.fuel && <Badge variant="secondary">{v.vehicle.fuel}</Badge>}
        {v.demo && <Badge variant="outline">Datos de demostración</Badge>}
      </div>
      {v.vehicle.version && <p className="text-sm text-muted-foreground">{v.vehicle.version}</p>}

      <p className="mt-6 text-sm text-muted-foreground">Precio justo para publicar</p>
      <p className="font-plate text-5xl font-bold leading-tight sm:text-6xl">{formatCOP(v.mid)}</p>
      <p className="text-muted-foreground">
        Entre {formatCOP(v.low)} y {formatCOP(v.high)}
      </p>

      <FairRangeBar fair={v} fasecolda={v.fasecoldaValue} className="mt-6" />

      <h3 className="mt-8 font-semibold">Por qué este precio</h3>
      <ul className="mt-3 divide-y divide-border">
        <li className="flex justify-between gap-4 py-2">
          <span>Valor de referencia Fasecolda</span>
          <span className="font-plate font-semibold">{formatCOP(v.fasecoldaValue)}</span>
        </li>
        {v.adjustments.map((a) => (
          <li key={a.key} className="flex justify-between gap-4 py-2">
            <span>{a.label}</span>
            <span className={cn("whitespace-nowrap font-plate font-semibold", a.pct >= 0 ? "text-verdict" : "text-destructive")}>{formatPct(a.pct)}</span>
          </li>
        ))}
        {v.comparables === 0 && <li className="py-2 text-muted-foreground">Aún no hay avisos comparables; el rango se apoya en Fasecolda.</li>}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        Estado declarado: {v.conditionScore}/100. Con fotos verificadas o inspección el rango se vuelve más estrecho.
      </p>

      <div className="mt-8 grid gap-4 border-t border-border pt-6">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link to="/publicar">Publicar mi carro gratis con este precio</Link>
        </Button>
        <form onSubmit={onJoin} className="grid gap-2">
          <Label htmlFor="email">O déjenos su correo y le avisamos si el precio de su carro cambia</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="email" type="email" required placeholder="usted@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" variant="outline" disabled={state === "saving"}>Avisarme</Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {state === "saved" && "Listo, le escribiremos."}
            {state === "error" && "No pudimos guardar el correo. Revise la conexión e inténtelo de nuevo."}
          </p>
        </form>
      </div>
    </section>
  );
}
