import type { SiteConfig } from "@tcu/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/** Configuración pública del sitio (beta, invitaciones, responsable de los datos, placas de prueba). */
export function useSiteConfig(): SiteConfig | undefined {
  return useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 5 * 60_000, retry: 1 }).data;
}

/** Cambia {{LEGAL_NAME}}, {{LEGAL_EMAIL}}… por los datos del responsable. */
export function fillLegal(text: string, c: SiteConfig | undefined): string {
  const host = (() => {
    try {
      return new URL(c?.publicUrl ?? "https://sucarrousado.com").host;
    } catch {
      return "sucarrousado.com";
    }
  })();
  const values: Record<string, string> = {
    LEGAL_NAME: c?.legal.name ?? "…",
    LEGAL_ID: c?.legal.id ?? "…",
    LEGAL_EMAIL: c?.legal.email ?? "…",
    LEGAL_ADDRESS: c?.legal.address ?? "…",
    LEGAL_CITY: c?.legal.city ?? "…",
    LEGAL_PHONE: c?.legal.phone ?? "no disponible; escríbanos al correo",
    LEGAL_VERSION: c?.legalVersion ?? "",
    DOMAIN: host,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => values[k] ?? m);
}
