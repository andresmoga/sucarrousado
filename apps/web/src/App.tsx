import { BRAND } from "@tcu/shared";
import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";

const SearchPage = lazy(() => import("@/pages/search"));
const ListingPage = lazy(() => import("@/pages/listing"));
const PublishPage = lazy(() => import("@/pages/publish"));
const ValuationPage = lazy(() => import("@/pages/valuation"));
const LoginPage = lazy(() => import("@/pages/login"));
const AccountPage = lazy(() => import("@/pages/account"));
const HowItWorksPage = lazy(() => import("@/pages/info").then((m) => ({ default: m.HowItWorksPage })));
const SafetyPage = lazy(() => import("@/pages/info").then((m) => ({ default: m.SafetyPage })));
const PrivacyPage = lazy(() => import("@/pages/legal").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("@/pages/legal").then((m) => ({ default: m.TermsPage })));
const NotFoundPage = lazy(() => import("@/pages/info").then((m) => ({ default: m.NotFoundPage })));

const TITLES: [RegExp, string][] = [
  [/^\/carros\/.+/, "Aviso"],
  [/^\/carros/, "Carros usados"],
  [/^\/publicar/, "Publicar mi carro"],
  [/^\/cuanto-vale/, "¿Cuánto vale su carro?"],
  [/^\/ingresar/, "Ingresar"],
  [/^\/cuenta/, "Mi cuenta"],
  [/^\/privacidad/, "Política de datos"],
  [/^\/terminos/, "Términos y condiciones"],
];

/** Sube al inicio al cambiar de página y actualiza el título de la pestaña. */
function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const t = TITLES.find(([re]) => re.test(pathname))?.[1];
    document.title = t ? `${t} | Carro Usado` : `${BRAND.name}: ${BRAND.slogan.replace(/\.$/, "").toLowerCase()}`;
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <RouteEffects />
      <Suspense fallback={<div className="container py-10 text-muted-foreground">Cargando…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="carros" element={<SearchPage />} />
            <Route path="carros/:id" element={<ListingPage />} />
            <Route path="publicar" element={<PublishPage />} />
            <Route path="cuanto-vale" element={<ValuationPage />} />
            <Route path="ingresar" element={<LoginPage />} />
            <Route path="cuenta" element={<AccountPage />} />
            <Route path="como-funciona" element={<HowItWorksPage />} />
            <Route path="seguridad" element={<SafetyPage />} />
            <Route path="privacidad" element={<PrivacyPage />} />
            <Route path="terminos" element={<TermsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
