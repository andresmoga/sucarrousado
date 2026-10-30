import { DEMO } from "./api";

/** Enlace a una página legal que abre en otra pestaña sin perder el formulario (con # en la demostración). */
export function legalHref(page: "terminos" | "privacidad"): string {
  return DEMO ? `${window.location.href.split("#")[0]}#/${page}` : `/${page}`;
}
