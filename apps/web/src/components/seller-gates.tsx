import { DOC_TYPES, sellerProfileSchema, type PublicUser } from "@tcu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { CitySelect } from "@/components/city-select";
import { Button } from "@/components/ui/button";
import { FieldError, Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorText } from "@/lib/api";

/** Actualiza el usuario en sesión sin volver a pedirlo. */
function useSetMe() {
  const qc = useQueryClient();
  return (u: PublicUser) => qc.setQueryData(["me"], u);
}

/** Beta con invitación: canjear el código para poder publicar. */
export function InviteGate() {
  const setMe = useSetMe();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="grid gap-3 rounded-xl border-2 border-plate-ink bg-plate/20 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim()) return setError("Escriba su código de invitación.");
        setBusy(true);
        setError("");
        try {
          setMe(await api.redeemInvite(code));
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <p className="font-semibold">Durante la beta publican vendedores invitados</p>
        <p className="text-sm text-muted-foreground">Escriba el código que le dio el equipo de Carro Usado. Puede seguir buscando carros sin código.</p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="grid gap-1">
          <Label htmlFor="inv-code" className="sr-only">Código de invitación</Label>
          <Input id="inv-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" className="w-48 uppercase" aria-invalid={!!error || undefined} />
        </div>
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Usar código</Button>
      </div>
      <FieldError>{error}</FieldError>
    </form>
  );
}

/**
 * Datos del vendedor que exige el artículo 53 de la Ley 1480 de 2011 a los portales de contacto.
 * Se piden una sola vez, al publicar el primer aviso, y no se muestran en el aviso.
 */
export function SellerProfileCard({ onSaved }: { onSaved?: () => void }) {
  const setMe = useSetMe();
  const [f, setF] = useState({ docType: "CC", docNumber: "", address: "", city: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = sellerProfileSchema.safeParse(f);
    if (!r.success) return setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    setBusy(true);
    setError("");
    try {
      setMe(await api.saveSellerProfile(r.data));
      onSaved?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k];
  return (
    <form id="datos-vendedor" onSubmit={save} className="grid gap-4 rounded-lg border-2 border-foreground bg-card p-5" noValidate>
      <div className="flex gap-2">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-semibold">Sus datos de vendedor</h2>
          <p className="text-sm text-muted-foreground">
            La ley de protección al consumidor (art. 53, Ley 1480 de 2011) nos pide estos datos de quien publica. No se muestran en el aviso. Se piden una sola vez.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="s-doctype" required>Documento</Label>
          <Select id="s-doctype" value={f.docType} onChange={set("docType")}>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-docnumber" required invalid={!!err("docNumber")}>Número</Label>
          <Input id="s-docnumber" inputMode="numeric" value={f.docNumber} onChange={set("docNumber")} aria-invalid={!!err("docNumber") || undefined} />
          <FieldError>{err("docNumber")}</FieldError>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="s-address" required invalid={!!err("address")}>Dirección</Label>
        <Input id="s-address" autoComplete="street-address" placeholder="Ej.: Cra 7 # 12-34, apto 501" value={f.address} onChange={set("address")} aria-invalid={!!err("address") || undefined} />
        <FieldError>{err("address")}</FieldError>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="s-city" required invalid={!!err("city")}>Municipio</Label>
          <CitySelect id="s-city" anyLabel="Elija…" value={f.city} onChange={set("city")} aria-invalid={!!err("city") || undefined} />
          <FieldError>{err("city")}</FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="s-phone" required invalid={!!err("phone")}>Teléfono</Label>
          <Input id="s-phone" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" value={f.phone} onChange={set("phone")} aria-invalid={!!err("phone") || undefined} />
          <FieldError>{err("phone")}</FieldError>
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" variant="outline" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Guardar mis datos</Button>
    </form>
  );
}
