import { loginSchema, registerSchema } from "@tcu/shared";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { legalHref } from "@/lib/legal-links";
import { useSiteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Solo rutas internas, para no redirigir a sitios externos. */
const safeBack = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/cuenta");

export default function LoginPage() {
  const [params] = useSearchParams();
  const back = safeBack(params.get("volver"));
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"ingresar" | "registro">(params.get("modo") === "registro" ? "registro" : "ingresar");
  const [form, setForm] = useState({ name: "", email: "", password: "", whatsapp: "", inviteCode: "" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const config = useSiteConfig();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const termsHref = legalHref("terminos");
  const privacyHref = legalHref("privacidad");
  const submit = useMutation({
    mutationFn: async () => {
      if (mode === "ingresar") {
        const v = loginSchema.parse(form);
        return api.login(v.email, v.password);
      }
      return api.register(registerSchema.parse({ ...form, whatsapp: form.whatsapp || undefined, acceptTerms }));
    },
    onSuccess: ({ token, user: u }) => {
      signIn(token, u);
      nav(back, { replace: true });
    },
  });

  if (user) return <Navigate to={back} replace />;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schema = mode === "ingresar" ? loginSchema : registerSchema;
    const r = schema.safeParse({ ...form, whatsapp: form.whatsapp || undefined, acceptTerms });
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    submit.mutate();
  }

  const field = (k: keyof typeof form, label: string, props: React.ComponentProps<"input"> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`a-${k}`} required={k !== "whatsapp" && k !== "inviteCode"} invalid={!!errors[k]}>{label}</Label>
      <Input
        id={`a-${k}`}
        value={form[k]}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
        aria-invalid={!!errors[k] || undefined}
        aria-describedby={errors[k] ? `a-${k}-err` : undefined}
        {...props}
      />
      {errors[k] && <p id={`a-${k}-err`} className="text-sm text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="container max-w-md py-12">
      <div className="mb-6 grid grid-cols-2 rounded-md border border-input bg-card p-1" role="tablist">
        {(["ingresar", "registro"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setErrors({}); submit.reset(); }}
            className={cn("rounded py-2 font-semibold", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}
          >
            {m === "ingresar" ? "Ingresar" : "Crear cuenta"}
          </button>
        ))}
      </div>

      <h1 className="font-plate text-4xl font-bold">{mode === "ingresar" ? "Ingrese a su cuenta" : "Cree su cuenta gratis"}</h1>
      <p className="mt-1 text-muted-foreground">
        {mode === "ingresar" ? "Para publicar, guardar favoritos y contactar vendedores." : "Con su cuenta puede publicar un carro gratis y contactar vendedores."}
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        {mode === "registro" && field("name", "Nombre", { autoComplete: "name" })}
        {field("email", "Correo", { type: "email", autoComplete: "email" })}
        {field("password", "Contraseña", { type: "password", autoComplete: mode === "ingresar" ? "current-password" : "new-password" })}
        {mode === "registro" && field("whatsapp", "WhatsApp (opcional, para que los compradores le escriban)", { inputMode: "tel", autoComplete: "tel", placeholder: "300 123 4567" })}
        {mode === "registro" && config?.invitesRequired && field("inviteCode", "Código de invitación (para publicar en la beta)", { autoComplete: "off" })}
        {mode === "registro" && (
          <div className="grid gap-1">
            <label className={cn("flex items-start gap-2.5 text-sm", errors.acceptTerms && "text-destructive")}>
              <input
                type="checkbox"
                id="a-terms"
                className="mt-0.5 size-4 shrink-0 accent-foreground"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                aria-invalid={!!errors.acceptTerms || undefined}
              />
              <span>
                Acepto los <a href={termsHref} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">términos y condiciones</a> y autorizo el
                tratamiento de mis datos según la <a href={privacyHref} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">política de datos personales</a>.
                <span className="text-destructive" aria-hidden>*</span>
              </span>
            </label>
            {errors.acceptTerms && <p className="text-sm text-destructive">{errors.acceptTerms}</p>}
          </div>
        )}
        <FieldError>{submit.isError ? errorText(submit.error) : null}</FieldError>
        <Button type="submit" size="lg" disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="animate-spin" />}
          {mode === "ingresar" ? "Ingresar" : "Crear cuenta"}
        </Button>
      </form>
    </div>
  );
}
