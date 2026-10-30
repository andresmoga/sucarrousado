/** Configuración pública del sitio (GET /api/config), igual en la web y la API. */

/** Versión de la política de datos y los términos. Cámbiela cuando cambie el texto: queda en cada cuenta. */
export const LEGAL_VERSION = "2026-10-27";

export interface LegalInfo {
  /** Razón social o nombre de la persona natural responsable del tratamiento de datos. */
  name: string;
  /** NIT o cédula. */
  id: string;
  email: string;
  address: string;
  city: string;
  phone: string | null;
}

export interface SiteConfig {
  /** Sitio en beta: se muestra la etiqueta y el aviso de lanzamiento. */
  beta: boolean;
  /** Con código de invitación: solo publican quienes lo tengan. */
  invitesRequired: boolean;
  ai: boolean;
  provider: string;
  /** Placas de prueba (solo con el proveedor de prueba, nunca en producción). */
  demoPlates: string[];
  legal: LegalInfo;
  legalVersion: string;
  publicUrl: string;
}
