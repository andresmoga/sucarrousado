import { PRICING_CONFIG } from "@tcu/shared";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function HowItWorksPage() {
  const c = PRICING_CONFIG;
  return (
    <article className="container max-w-2xl py-10">
      <h1 className="font-plate text-5xl font-bold leading-none">Cómo calculamos el precio justo</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Un concesionario suele tasar con uno o dos avisos parecidos, casi siempre los más baratos. Nosotros combinamos
        tres fuentes y le mostramos el efecto de cada una.
      </p>
      <div className="mt-10 grid gap-8">
        <section>
          <h2 className="text-xl font-semibold">Partimos del valor Fasecolda</h2>
          <p className="mt-2 text-muted-foreground">
            Fasecolda publica cada mes una guía con el valor comercial promedio de cada referencia. Es la que usan las
            aseguradoras. Es una referencia, no un precio oficial, y puede alejarse del mercado; por eso no la usamos sola.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Lo corregimos con el mercado</h2>
          <p className="mt-2 text-muted-foreground">
            Tomamos los avisos activos de la misma marca y línea, un año arriba o abajo y con kilometraje parecido.
            Quitamos los precios absurdos y usamos la mediana. Con {c.fullMarketComparables} o más avisos, el mercado
            pesa hasta {pct(c.maxMarketWeight)} del precio; con menos, pesa menos.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Lo ajustamos por kilometraje, estado y ciudad</h2>
          <p className="mt-2 text-muted-foreground">
            Esperamos unos {c.expectedKmPerYear.toLocaleString("es-CO")} km por año. Cada {c.kmStep.toLocaleString("es-CO")} km
            por encima resta {pct(c.kmPctPerStep)}, hasta {pct(c.kmCap)}; por debajo, suma. El estado (pintura,
            mecánica, interior, llantas, siniestros y papeles) mueve el precio hasta {pct(c.conditionCap)}.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Le damos un rango, no un número mágico</h2>
          <p className="mt-2 text-muted-foreground">
            El rango se abre cuando hay pocos avisos para comparar o cuando el estado solo lo declara el vendedor. Con
            fotos verificadas o inspección se cierra. Cada venta cerrada en la plataforma mejora el cálculo.
          </p>
        </section>
      </div>
      <Button asChild size="lg" className="mt-10"><Link to="/cuanto-vale">Calcular el precio de mi carro</Link></Button>
    </article>
  );
}

export function SafetyPage() {
  const tips = [
    ["Vea el carro antes de pagar", "No envíe anticipos por transferencia a alguien que no conoce ni por un carro que no ha visto."],
    ["Revise el RUNT con la placa", "Confirme que el vendedor es el propietario y que el carro no tiene prendas, embargos ni limitaciones."],
    ["Consulte multas en el SIMIT", "Las multas pendientes pueden frenar el traspaso."],
    ["Lleve el carro a peritaje", "Un peritaje independiente revisa pintura, chasis, motor y si el carro tuvo choques fuertes."],
    ["Firme una promesa de compraventa", "Si no va a pagar todo de una vez, deje por escrito el precio, las arras y las fechas del traspaso."],
    ["Entregue el carro con el traspaso radicado", "Para el vendedor: no suelte el carro ni la tarjeta de propiedad hasta tener el pago verificado en su cuenta."],
  ];
  return (
    <article className="container max-w-2xl py-10">
      <h1 className="font-plate text-5xl font-bold leading-none">Comprar y vender seguro</h1>
      <p className="mt-4 text-lg text-muted-foreground">Seis pasos que evitan la mayoría de las estafas con carros usados.</p>
      <ol className="mt-8 grid gap-6">
        {tips.map(([t, d], i) => (
          <li key={t} className="grid grid-cols-[40px_1fr] gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-plate font-plate text-xl font-bold text-plate-ink">{i + 1}</span>
            <div>
              <h2 className="text-lg font-semibold">{t}</h2>
              <p className="text-muted-foreground">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-10 rounded-lg border border-border bg-card p-5 text-muted-foreground">
        Muy pronto: <strong className="text-foreground">Venta Segura</strong>, una promesa de compraventa digital con las
        arras en custodia de una entidad vigilada, que solo se liberan cuando el traspaso queda registrado.
      </p>
    </article>
  );
}

export function NotFoundPage() {
  return (
    <div className="container py-20">
      <h1 className="font-plate text-5xl font-bold">Esta página no existe</h1>
      <p className="mt-2 text-muted-foreground">Puede que el enlace esté mal escrito.</p>
      <Button asChild className="mt-6"><Link to="/">Ir al inicio</Link></Button>
    </div>
  );
}
