# Carro Usado (sucarrousado.com)

Marketplace de carros usados en Colombia. Promesa: **publicar gratis en menos de 5 minutos con IA**, precio
justo calculado con Fasecolda + mercado + estado real. Eslogan: "Le queda mucha carretera."

## Estructura

- `packages/shared` — esquemas Zod, catálogos, motor de precio justo (`pricing.ts`), borradores y reporte de
  calidad (`draft.ts`), marca (`brand.ts`). Lo usan la web y la API: **cualquier regla de negocio va aquí**.
- `apps/api` — Node 20 + TypeScript + Fastify + PostgreSQL (`pg`, SQL a mano, sin ORM).
  - `db/migrations/NNN_*.sql` — migraciones numeradas; nunca editar una ya aplicada, crear la siguiente.
  - `src/services/` — lógica: `listings`, `drafts` (publicar con IA), `ai` (Claude), `video` (ffmpeg),
    `uploads` (sharp), `valuation`, `auth`.
  - `src/providers/vehicle-data.ts` — Fasecolda/RUNT por placa (`mock` o `verifik`).
- `apps/web` — React 18 + Vite + Tailwind + componentes estilo shadcn/ui, React Router 6, TanStack Query.
  Textos legales en `src/content/*.md` (con `{{LEGAL_NAME}}`…, que se llenan con `/api/config`).
- `apps/api/src/services/storage.ts` — fotos y videos en disco (desarrollo) o S3/R2 (producción); en la base
  siempre se guardan como `/uploads/<clave>`.

## Comandos

```bash
pnpm install
pnpm db:up && pnpm db:migrate          # PostgreSQL en Docker + migraciones
pnpm --filter @tcu/api seed            # 34 avisos de demostración (clave demo1234)
pnpm dev                               # api :4000, web :5173 (Vite reenvía /api y /uploads)
pnpm typecheck
pnpm test                              # unitarias
TEST_DATABASE_URL=postgres://... pnpm --filter @tcu/api test   # integración (BORRA esa base)
pnpm build
pnpm --filter @tcu/web build:demo     # demo sin servidor: un solo HTML en apps/web/dist-demo
docker build -t carro-usado .          # imagen de producción (web + API + ffmpeg)
S3_TEST_ENDPOINT=http://127.0.0.1:9555 pnpm --filter @tcu/api test   # incluye R2/S3 (moto_server -p 9555)
```

Antes de dar una tarea por terminada: `pnpm typecheck` y las pruebas de la API con `TEST_DATABASE_URL`.

## Reglas del proyecto

- **Textos en español de Colombia, tratando de "usted"**, frases cortas, sin signos de exclamación ni emojis.
  Los mensajes de error dicen qué pasó y cómo arreglarlo (ver `ERROR_TEXT` en `apps/web/src/lib/api.ts`).
- La API responde errores como `{ error: "codigo_en_snake_case" }`; la web los traduce en `ERROR_TEXT`.
- Validar toda entrada con Zod en `packages/shared` y reutilizar el mismo esquema en la web.
- **La IA nunca inventa datos del carro**: solo usa lo que el vendedor confirma o lo que se ve en las fotos.
  Todo lo de IA debe tener respaldo sin `ANTHROPIC_API_KEY` (modo demostración).
- Marca y eslogan solo en `packages/shared/src/brand.ts`; el logo en `apps/web/src/components/logo.tsx`
  (versión G para fondo oscuro, H en una tinta) y en `apps/api/src/services/video.ts` (`logoSvg`).
- Colores: amarillo placa `#F2C200`, asfalto `#22272E`, gris vía `#ECEEEC`, verde precio justo `#1F7A4D`.
  Tipografía Barlow / Barlow Condensed. No usar logos de otras marcas (incluidos íconos de redes sociales).
- Privacidad (Ley 1581 de 2012): placas como hash con sal, fotos sin EXIF/GPS, WhatsApp del vendedor solo
  para usuarios con sesión. Un borrador solo puede usar fotos subidas por su dueño.
- Valores de demostración (`DEMO_VEHICLES`, semilla) **no son de Fasecolda**; no presentarlos como reales.

## Demostración en el navegador

`VITE_DEMO=1` cambia la API por `apps/web/src/lib/demo-api.ts` (mismas rutas y reglas de `@tcu/shared`, estado en
localStorage), usa HashRouter y hace el video con canvas + MediaRecorder (`demo-video.ts`). Los avisos salen de
`src/demo/data.json`; se regeneran con la API corriendo: `node scripts/export-demo-data.mjs` (desde `apps/web`).
Si cambia una ruta de la API, actualice también `demo-api.ts`. Publicada como Artifact de Claude, la demo usa
la IA real con la capacidad `sample` (`demo-ai.ts`, mismas instrucciones de `packages/shared/src/ai-prompts.ts`);
fuera de Claude cae a reglas.

## Fotos, placas y municipios

- La IA dice el ángulo real de cada foto (`aiSlot`); si no coincide con el elegido es `angulo_incorrecto`
  (`slotMismatch` en `draft.ts`). No se publica sin las 4 obligatorias válidas (`missingRequiredSlots`, error
  `fotos_obligatorias`). El vendedor puede reemplazar la foto o confirmar que sí es (`slotConfirmed`).
- Placa que no aparece en el RUNT/Fasecolda: el vendedor escribe el carro (`manualVehicleSchema`); el rango sale
  solo del mercado con 3 o más comparables, si no, el aviso sale sin rango y el vendedor pone el precio.
- Municipios en `CITY_GROUPS` (catalog.ts); el ajuste regional va por departamento (`PRICING_CONFIG.regionPct`).
- Campos obligatorios: `Label required`, `aria-invalid` en el campo (se pinta en rojo) y mensaje con `FieldError`.

## Detalles que ya causaron errores

- En efectos de React no devolver el resultado de `scrollIntoView`/`scrollTo` (los navegadores nuevos
  devuelven una promesa y React la toma como función de limpieza). Usar cuerpo con llaves.
- `sharp` rechaza imágenes dañadas (`failOn: "error"`); en pruebas generar las imágenes con sharp.
- El video se genera en cola (uno a la vez). En pruebas `VIDEO_AUTO=0` salvo cuando se prueba el video.
- Los scripts de la API corren con `apps/api` como directorio de trabajo (`uploads/`, `assets/fonts/`).
- `pnpm deploy` falla en pnpm 10.0 sin `inject-workspace-packages`: el Dockerfile usa
  `pnpm install --prod --filter @tcu/api` y copia `node_modules` de la raíz y de `apps/api`.
- `node --env-file` corta el valor en `#` si no va entre comillas (direcciones como "Cra 7 # 12-34").
- Detrás del proxy del hosting, sin `trustProxy` todos los visitantes comparten IP y chocan con el límite.

## Producción (salir al aire en sucarrousado.com)

Arquitectura: **un solo contenedor Docker** (`Dockerfile`) con la API que también sirve la web compilada
(`WEB_DIST`), PostgreSQL administrado, y fotos/videos en **Cloudflare R2** (compatible con S3). Al arrancar aplica
las migraciones. Si falta una variable obligatoria, el servidor se detiene y lista cuáles (`src/config.ts`).

### Pasos (hágalos en orden; los marcados con [persona] los hace el dueño en su navegador)

1. **Repositorio**: subir este proyecto a GitHub (repositorio privado). `git init`, primer commit, `gh repo create`.
2. **[persona] Cloudflare R2**: crear el bucket `carrousado-fotos`; en *Settings > Public access* conectar un
   dominio propio (`fotos.sucarrousado.com`, recomendado) o activar `r2.dev`; crear un *API token* de R2 con
   permiso *Object Read & Write* solo para ese bucket. Anotar: Account ID, Access Key ID, Secret Access Key.
3. **[persona] Anthropic**: crear una clave en console.anthropic.com y ponerle un límite de gasto mensual.
4. **[persona] Render** (render.com): *New > Blueprint*, elegir el repositorio. `render.yaml` crea la base y el
   servicio. Llenar en el panel las variables marcadas `sync: false` (tabla de abajo). Verificar en la
   documentación de Render que los planes y la región de `render.yaml` sigan vigentes.
5. **Primer despliegue**: revisar los registros. Debe verse `✔ 00X_...sql` y luego el servidor escuchando.
   Abrir `https://<servicio>.onrender.com/health` → `{"ok":true,"provider":"none","ai":true,"storage":"s3"}`.
6. **[persona] Dominio**: en Render, *Settings > Custom domains* agregar `sucarrousado.com` y `www`; en el
   registrador del dominio crear los registros DNS que indica Render. HTTPS lo saca Render.
7. **Prueba de humo en el dominio**: crear una cuenta (con el código de invitación), publicar un carro con fotos
   reales, revisar que la foto cargue desde R2, que salga el video y que `/api/share/<id>` muestre la vista previa
   en WhatsApp. Revisar `/privacidad` y `/terminos` con los datos reales del responsable.
8. **Copias de seguridad**: confirmar en Render que la base tiene backups diarios (según el plan).

Alternativa sin Render: un VPS con Docker y `docker-compose.prod.yml` (incluye PostgreSQL y Caddy para HTTPS).

### Variables

| Variable | Obligatoria | Qué es |
| --- | --- | --- |
| `DATABASE_URL` | Sí | PostgreSQL (Render la llena) |
| `AUTH_SECRET` | Sí (≥32) | Firma de sesiones (`openssl rand -hex 32`; Render la genera) |
| `PLATE_HASH_SALT` | Sí (≥16) | Sal del hash de placas. **No cambiarla después de lanzar** |
| `PUBLIC_URL` | Sí (https) | `https://sucarrousado.com` (enlaces para redes) |
| `STORAGE_DRIVER` + `S3_*` | Sí | `s3`; `S3_BUCKET`, `S3_ENDPOINT` (R2: `https://<cuenta>.r2.cloudflarestorage.com`), `S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` |
| `LEGAL_NAME`, `LEGAL_ID`, `LEGAL_EMAIL`, `LEGAL_ADDRESS`, `LEGAL_CITY` | Sí | Responsable de los datos; salen en `/privacidad`, `/terminos` y el pie |
| `LEGAL_PHONE` | No | Teléfono del responsable |
| `ANTHROPIC_API_KEY` | Recomendada | Sin ella la IA queda en modo reglas |
| `SITE_MODE` | No | `beta` (por defecto) o `publico` |
| `BETA_INVITE_CODE` | No | Si existe, solo publican quienes lo tengan (comprar es libre) |
| `VEHICLE_DATA_PROVIDER` | No | `none` (por defecto en producción) o `verifik` + `VERIFIK_API_TOKEN`. `mock` está prohibido en producción |
| `VIDEO_AUTO` | No | `0` desactiva el video automático |
| `TRUST_PROXY` | No | Por defecto `1` en producción (IP real detrás del proxy) |

En archivos `.env`, los valores con `#` o espacios van entre comillas (las direcciones colombianas llevan `#`).

### Antes de abrir al público (fuera de la beta)

- **Abogado**: revisar `apps/web/src/content/privacidad.md` y `terminos.md` (son borradores). Si cambia el texto,
  subir `LEGAL_VERSION` en `packages/shared/src/site.ts`.
- **Ley 1480, art. 53**: ya se piden documento, dirección y teléfono al vendedor antes de publicar
  (`sellerProfileSchema`, `PUT /api/me/seller-profile`); falta el procedimiento para entregarlos ante una queja.
- Recuperar contraseña por correo (proveedor de correo, p. ej. Resend) y avisos por correo de preguntas nuevas.
- Botón para reportar avisos y un panel mínimo de moderación (pausar avisos, ver reportes).
- Evaluar el Registro Nacional de Bases de Datos ante la SIC según el tamaño de la empresa.

### Qué ya está listo para producción

- Sin avisos de ejemplo: la semilla se niega a correr con `NODE_ENV=production`.
- Sin placas ni valores de prueba: `/api/config` da `demoPlates: []` y la tasación por placa muestra
  "llega pronto" con lista de espera mientras `VEHICLE_DATA_PROVIDER=none`; al publicar, el vendedor escribe el carro.
- Autorización de datos obligatoria al registrarse, guardada con versión y fecha (`users.legal_version`).
- Encabezados de seguridad, HSTS, límites por IP, archivos con caché larga e `index.html` sin caché.

## Pendiente (roadmap)

1. Fase 2: proveedor real Fasecolda/RUNT (Verifik), verificación del vendedor en el RUNT, planes pagos
   (Verificado, Gangas Verificadas, Venta Segura con arras en custodia, Plan Profesional).
2. Lanzamiento público: ver "Antes de abrir al público" arriba.
3. Fase 3: registro de marca ante la SIC.
