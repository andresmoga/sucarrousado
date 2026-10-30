import { BRAND } from "@tcu/shared";
import { Menu, Search } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo, LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DEMO } from "@/lib/api";
import { useSiteConfig } from "@/lib/site";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/carros", label: "Comprar" },
  { to: "/publicar", label: "Vender" },
  { to: "/cuanto-vale", label: "¿Cuánto vale su carro?" },
];

function HeaderSearch({ className }: { className?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        nav(q.trim() ? `/carros?q=${encodeURIComponent(q.trim())}` : "/carros");
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <label htmlFor="header-q" className="sr-only">
        Buscar carros
      </label>
      <input
        id="header-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Marca, línea o versión"
        className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-[15px] placeholder:text-muted-foreground"
      />
    </form>
  );
}

export function Layout() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const config = useSiteConfig();

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById("contenido")?.focus(); }} className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">
        Saltar al contenido
      </a>
      {DEMO ? (
        <p className="bg-foreground px-4 py-1.5 text-center text-xs text-background">
          Demostración: todo corre en su navegador y se guarda solo aquí. Placas de prueba: {config?.demoPlates.join(", ")}.
        </p>
      ) : config?.beta ? (
        <p className="bg-foreground px-4 py-1.5 text-center text-xs text-background">
          <span className="mr-2 rounded-sm bg-plate px-1.5 py-px font-semibold text-plate-ink">BETA</span>
          Estamos abriendo el sitio con los primeros vendedores. Cuéntenos qué mejorar: {config.legal.email}
        </p>
      ) : null}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center gap-4">
          <Logo />
          <HeaderSearch className="hidden max-w-sm flex-1 md:block" />
          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn("rounded-md px-3 py-2 text-[15px] font-medium hover:bg-secondary", isActive && "bg-secondary")
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            {user ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/cuenta">Mi cuenta</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link to={`/ingresar?volver=${encodeURIComponent(pathname)}`}>Ingresar</Link>
              </Button>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="lg:hidden" aria-label="Abrir menú">
                  <Menu className="!size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent title="Menú" side="right">
                <HeaderSearch className="mb-4 md:hidden" />
                <nav className="grid gap-1" aria-label="Móvil">
                  {NAV.map((n) => (
                    <SheetClose asChild key={n.to}>
                      <Link to={n.to} className="rounded-md px-3 py-3 text-lg font-medium hover:bg-secondary">
                        {n.label}
                      </Link>
                    </SheetClose>
                  ))}
                  {user && (
                    <SheetClose asChild>
                      <button type="button" onClick={signOut} className="rounded-md px-3 py-3 text-left text-lg text-muted-foreground hover:bg-secondary">
                        Cerrar sesión
                      </button>
                    </SheetClose>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>

      <footer className="mt-20 bg-black text-white">
        <div className="container grid gap-8 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link to="/" aria-label={`${BRAND.name}, inicio`} className="inline-block rounded-sm">
              <LogoMark variant="luz" glow className="h-20 w-auto" />
            </Link>
            <p className="mt-3 max-w-xs text-lg font-medium">{BRAND.slogan}</p>
            <p className="text-sm text-white/65">{BRAND.tagline}</p>
          </div>
          <nav aria-label="Comprar y vender" className="grid content-start gap-2 text-[15px]">
            <Link to="/carros" className="hover:underline">Carros usados</Link>
            <Link to="/carros?fair=bajo" className="hover:underline">Por debajo del precio justo</Link>
            <Link to="/publicar" className="hover:underline">Publicar gratis</Link>
            <Link to="/cuanto-vale" className="hover:underline">¿Cuánto vale su carro?</Link>
          </nav>
          <nav aria-label="Ayuda" className="grid content-start gap-2 text-[15px]">
            <Link to="/como-funciona" className="hover:underline">Cómo calculamos el precio</Link>
            <Link to="/seguridad" className="hover:underline">Comprar y vender seguro</Link>
            <Link to="/terminos" className="hover:underline">Términos y condiciones</Link>
            <Link to="/privacidad" className="hover:underline">Política de datos personales</Link>
          </nav>
        </div>
        <div className="container border-t border-white/15 py-4 text-sm text-white/65">
          <p>Los valores de Fasecolda son una referencia, no un precio oficial. {BRAND.domain}</p>
          {config && !DEMO && (
            <p className="mt-1">
              Responsable: {config.legal.name}, {config.legal.id}. {config.legal.city}. {config.legal.email}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
