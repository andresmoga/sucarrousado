# Carro Usado (sucarrousado.com)

Marketplace de carros usados con **precio justo**: valor Fasecolda + avisos comparables + estado real del carro.
Eslogan: *Ya probado, a precio justo.* La marca está en un solo archivo (`packages/shared/src/brand.ts`)
porque el nombre aún está pendiente de la validación ante la SIC.

Esta versión es la **fase 1 del roadmap: la capa gratis del sitio**, con la promesa central del plan gratis:
**publicar en menos de 5 minutos con IA, en la comunidad 100 % usado.**

## Publicar con IA (`/publicar`)

1. **Fotos primero.** Se arrastran o se eligen (también desde el inicio). El navegador revisa resolución, luz
   y orientación antes de subir. La cuenta se crea en un cuadro rápido solo cuando la IA va a trabajar.
2. **El servidor procesa cada foto:** la endereza, la reduce a 2000 px, la guarda en JPEG **sin EXIF ni GPS** y
   mide resolución, brillo, nitidez y una huella para detectar fotos repetidas.
3. **La IA reconoce el carro** (marca, línea, años, versión probable, carrocería, color, equipamiento visible)
   y el ángulo y los problemas de cada foto (placa visible, no es un carro, borrosa, oscura).
4. **Confirmación agrupada:** placa (trae la referencia exacta y el valor Fasecolda; se compara con lo que vio
   la IA y se avisa si no coincide), características técnicas, estado, equipamiento y documentos.
5. **Aviso generado y editable conversando:** título, descripción y precio justo sugerido, con vista previa en
   vivo, panel de calidad del aviso (fotos mínimas, problemas, precio frente al rango) y un chat que aplica
   cambios (“hágalo más corto”, “ponga el precio en 85 millones”).
6. **Publicar y compartir:** se genera un **video vertical MP4 (1080×1920)** con las fotos, modelo, precio,
   etiqueta de precio justo y el logo; botones para WhatsApp, Facebook, X, copiar enlace y compartir el video
   directo desde el celular (Instagram, TikTok, WhatsApp). El enlace `/api/share/:id` entrega la vista previa
   con foto y precio a las redes.

Sin `ANTHROPIC_API_KEY` todo funciona en **modo demostración**: los ángulos se asignan por orden, el vendedor
confirma con la placa y el chat entiende pedidos comunes con reglas. Con la clave, el reconocimiento y el chat
usan Claude (modelo configurable con `ANTHROPIC_MODEL`).

El video usa **sharp + resvg + ffmpeg** (plantilla con acercamiento y fundidos; ~10–25 s de proceso, en cola de
uno a la vez). El servidor de producción necesita `ffmpeg` con `libx264`. Las fuentes Barlow (licencia OFL)
están en `apps/api/assets/fonts`.

## Qué incluye

| Página | Ruta | Qué hace |
| --- | --- | --- |
| Inicio | `/` | Buscador, avisos por debajo del precio justo, por qué un usado, marcas con respaldo, recién publicados |
| Resultados | `/carros` | Filtros (precio justo, marca, ciudad, precio, modelo, km, carrocería, combustible, transmisión, vendedor), orden, páginas; filtros en panel lateral en móvil |
| Aviso | `/carros/:id` | Galería, precio justo con explicación, estado por puntos, ficha técnica, equipamiento, preguntas públicas, WhatsApp, favoritos, carros parecidos |
| Publicar | `/publicar` | Publicar con IA en menos de 5 minutos (ver arriba) |
| ¿Cuánto vale? | `/cuanto-vale` | Tasación gratis por placa, sin registro |
| Cuenta | `/ingresar`, `/cuenta` | Registro, ingreso, mis avisos (precio, pausar, vendido, preguntas pendientes) y favoritos |
| Información | `/como-funciona`, `/seguridad` | Cómo se calcula el precio y cómo comprar seguro |

Reglas del plan gratis: 1 aviso activo por particular, 60 días, mínimo 4 fotos. Los concesionarios no tienen límite
(el Plan Profesional se cobra en la fase 2).

## Estructura

```
apps/
  web/   React 18 + TypeScript + Vite + Tailwind + componentes shadcn/ui, React Router, TanStack Query
  api/   Node.js + TypeScript + Fastify + PostgreSQL
    db/migrations/   001 esquema base (subastas, pujas, contratos con arras) · 002 marketplace
    src/seed/        34 avisos de demostración con fotos ilustradas
packages/
  shared/  Esquemas Zod, catálogos, motor de precio justo, marca (lo usan web y api)
```

## Arranque local

Requisitos: Node 20+, pnpm 9+, Docker (o PostgreSQL 16 propio).

```bash
cp .env.example .env
pnpm install
pnpm db:up                         # PostgreSQL en Docker
pnpm db:migrate                    # aplica las migraciones
pnpm --filter @tcu/api seed        # avisos de demostración
pnpm dev                           # api en :4000, web en :5173
```

Usuarios de demostración (clave `demo1234`): `vendedor1@demo.sucarrousado.com` (particular),
`concesionario1@demo.sucarrousado.com`, `vendedor99@demo.sucarrousado.com` (comprador).
Placas de prueba para publicar o tasar: ABC123, BMW320, AUD301, MER250, REN456, TOY789.
Todos los valores de demostración son ilustrativos, **no son de Fasecolda**.

## Producción

Un solo contenedor (`Dockerfile`: web + API + ffmpeg), PostgreSQL y fotos en Cloudflare R2. Despliegue con
`render.yaml` (Render) o `docker-compose.prod.yml` (servidor propio). Pasos y variables: `CLAUDE.md`, sección
"Producción". Plantilla de variables: `.env.production.example`.

## Pruebas

```bash
pnpm test                                                  # motor de precio, sesiones y plantilla de IA
TEST_DATABASE_URL=postgres://... pnpm --filter @tcu/api test  # + integración contra PostgreSQL real
```

La prueba de integración cubre: registro e ingreso, publicación con fotos y tasación, límite del plan gratis,
búsqueda con filtros y facetas, preguntas y respuestas, favoritos, pausar un aviso y rechazo de archivos que no
son imagen. **Borra el esquema de la base que se le indique**: úsela solo con una base desechable.

## API

| Método | Ruta | Sesión |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | No |
| GET | `/api/me`, `/api/me/listings`, `/api/me/favorites` | Sí |
| GET | `/api/listings` (filtros por query), `/api/listings/:id`, `/api/listings/:id/similar` | Opcional |
| POST / PATCH | `/api/listings`, `/api/listings/:id` | Sí |
| POST | `/api/listings/:id/questions`, `/api/questions/:id/answer` | Sí |
| PUT / DELETE | `/api/favorites/:id` | Sí |
| POST | `/api/uploads` (multipart, JPG/PNG/WebP hasta 8 MB, se revisa la firma del archivo) | Sí |
| POST | `/api/vehicles/lookup`, `/api/ai/listing-draft` | Sí |
| POST / GET | `/api/drafts`, `/api/drafts/:id` | Sí |
| PUT | `/api/drafts/:id/photos` (agregar, quitar, corregir ángulos) | Sí |
| POST | `/api/drafts/:id/recognize`, `/confirm`, `/chat`, `/publish`; PATCH `/api/drafts/:id/listing` | Sí |
| GET / POST | `/api/listings/:id/video` (estado / volver a generar) | No / Sí (dueño) |
| GET | `/api/share/:id` (HTML con Open Graph para redes) | No |
| POST | `/api/valuations`, `/api/waitlist` | No |

Límites: 300 solicitudes/minuto por IP en general; 20/minuto en las que consultan Fasecolda/RUNT o la IA;
10/minuto para registro, ingreso y preguntas.

## Seguridad y privacidad

- Contraseñas con scrypt y sal por usuario; sesiones firmadas con HMAC-SHA256 (30 días).
- Placas guardadas como hash con sal (Ley 1581 de 2012); la placa no se muestra en el aviso.
- El WhatsApp del vendedor solo se entrega a usuarios con sesión.
- Fotos: se revisa la firma real del archivo, se reprocesan con sharp y se guardan sin EXIF/GPS. Cada foto queda
  ligada a su dueño: un borrador solo puede usar fotos propias. **Pendiente para producción:** mover a S3/GCS.

## Pendiente para la fase 2 (suscripción + Fasecolda)

1. Proveedor real de Fasecolda/RUNT: `VEHICLE_DATA_PROVIDER=verifik` y ajustar el mapeo marcado con `TODO` en
   `apps/api/src/providers/vehicle-data.ts`.
2. Verificación de identidad del vendedor contra el RUNT.
3. Planes pagos: Verificado, Gangas Verificadas, Venta Segura con arras en custodia y Plan Profesional.
4. Recuperar contraseña por correo y avisos por correo de preguntas nuevas.
