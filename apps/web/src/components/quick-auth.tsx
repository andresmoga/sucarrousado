import * as Dialog from "@radix-ui/react-dialog";
import { loginSchema, registerSchema, type PublicUser } from "@tcu/shared";
import { useMutation } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { legalHref } from "@/lib/legal-links";
import { useSiteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Registro rápido en medio del flujo: la persona empieza subiendo fotos y solo crea la cuenta
 * cuando va a usar la IA. Sus fotos siguen en pantalla.
 */
export function QuickAuth({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: (u: PublicUser) => void }) {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<"registro" | "ingresar">("registro");
  const [form, setForm] = useState({ name: "", email: "", password: "", whatsapp: "", inviteCode: "" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const config = useSiteConfig();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const termsHref = legalHref("terminos");
  const privacyHref = legalHref("privacidad");
  const submit = useMutation({
    mutationFn: async () =>
      mode === "ingresar"
        ? api.login(form.email, form.password)
        : api.register(registerSchema.parse({ ...form, whatsapp: form.whatsapp || undefined, acceptTerms })),
    onSuccess: ({ token, user }) => {
      signIn(token, user);
      onOpenChange(false);
      onDone(user);
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = (mode === "ingresar" ? loginSchema : registerSchema).safeParse({ ...form, whatsapp: form.whatsapp || undefined, acceptTerms });
    if (!r.success) return setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    submit.mutate();
  }

  const field = (k: keyof typeof form, label: string, props: React.ComponentProps<"input"> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`qa-${k}`} required={k !== "whatsapp" && k !== "inviteCode"} invalid={!!errors[k]}>{label}</Label>
      <Input id={`qa-${k}`} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} aria-invalid={!!errors[k] || undefined} {...props} />
      {errors[k] && <p className="text-sm text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-background p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-plate text-3xl font-bold leading-tight">
                {mode === "registro" ? "Cree su cuenta para seguir" : "Ingrese para seguir"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-muted-foreground">
                Sus fotos siguen aquí. Con la cuenta la IA reconoce su carro y le guardamos el aviso.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1.5 hover:bg-secondary" aria-label="Cerrar">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-md border border-input bg-card p-1">
            {(["registro", "ingresar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => { setMode(m); setErrors({}); submit.reset(); }}
                className={cn("rounded py-1.5 text-sm font-semibold", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}
              >
                {m === "registro" ? "Soy nuevo" : "Ya tengo cuenta"}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="mt-4 grid gap-3" noValidate>
            {mode === "registro" && field("name", "Nombre", { autoComplete: "name" })}
            {field("email", "Correo", { type: "email", autoComplete: "email" })}
            {field("password", "Contraseña", { type: "password", autoComplete: mode === "ingresar" ? "current-password" : "new-password" })}
            {mode === "registro" && field("whatsapp", "WhatsApp para que le escriban", { inputMode: "tel", autoComplete: "tel", placeholder: "300 123 4567" })}
            {mode === "registro" && config?.invitesRequired && field("inviteCode", "Código de invitación (para publicar en la beta)", { autoComplete: "off" })}
            {mode === "registro" && (
              <div className="grid gap-1">
                <label className={cn("flex items-start gap-2.5 text-sm", errors.acceptTerms && "text-destructive")}>
                  <input
                    type="checkbox"
                    id="qa-terms"
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
              {mode === "registro" ? "Crear cuenta y seguir" : "Ingresar y seguir"}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
