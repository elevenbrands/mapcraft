# MapCraft — Deploy web a producción (Railway)

Guía para lanzar la web con ventas reales. La app es **un solo servicio**: FastAPI
sirve la API y el frontend compilado (Vite) desde el mismo contenedor
(`Dockerfile` multi-stage, healthcheck en `/health` vía `railway.json`).

> Secretos: los valores viven en macOS Keychain y en las Variables de Railway.
> Nunca en archivos versionados. `backend/.env` está excluido de la imagen por
> `.dockerignore` y de git por `.gitignore`.

## 0. Prerrequisitos (acciones del dueño)

- [ ] Cuenta Railway con plan de pago (el free tier duerme el servicio; Hobby $5/mes basta para validar).
- [ ] Dominio comprado (ej. `mapcraft.app`) — opcional para el primer smoke test, obligatorio antes de compartir el link.
- [ ] Stripe en modo **live** activado (negocio verificado en el dashboard).
- [ ] PRs #1, #2 y #3 mergeadas a `main` (tests verdes + fix TDZ + rebrand). No deployar con el crash de SessionPage sin mergear.

## 1. Crear el servicio en Railway

1. New Project → Deploy from GitHub repo → `elevenbrands/mapcraft`, rama `main`.
2. Railway detecta `railway.json` y construye con el `Dockerfile` de la raíz. No configurar buildpacks.
3. En **Settings → Networking**: generar dominio público (`*.up.railway.app`) para el smoke test.

## 2. Volumen persistente (obligatorio)

Las sesiones y los markers de pago (`paid.json`) viven en filesystem. Sin volumen,
**cada deploy borra los mapas comprados**.

1. Service → Attach Volume → mount path: `/data`.
2. Variable `STORAGE_PATH=/data/sessions`.

## 3. Variables de entorno

En Railway → Variables (valores desde Keychain, nunca pegados en el repo):

| Variable | Valor | Notas |
|---|---|---|
| `GEMINI_API_KEY` | (Keychain) | Modelo por defecto `gemini/gemini-2.5-flash` |
| `LLM_MODEL` | `gemini/gemini-2.5-flash` | Explícito para no depender del default del código |
| `STRIPE_SECRET_KEY` | `sk_live_…` (Keychain) | Live, no test |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (paso 4) | Del endpoint live |
| `PUBLIC_URL` | `https://<dominio>` | Sin slash final; construye los redirects de Stripe |
| `STORAGE_PATH` | `/data/sessions` | Apunta al volumen |
| `LOG_LEVEL` | `INFO` | |

## 4. Webhook de Stripe (live)

1. Dashboard Stripe (modo live) → Developers → Webhooks → Add endpoint.
2. URL: `https://<dominio>/api/stripe/webhook`.
3. Evento: `checkout.session.completed` (único que procesa el backend).
4. Copiar el `whsec_…` → variable `STRIPE_WEBHOOK_SECRET` en Railway → redeploy.

El precio ($2.99) va inline con `price_data` en el checkout — no hay que crear
un Price en el dashboard de Stripe.

## 5. Dominio propio

1. Railway → Settings → Networking → Custom Domain → `mapcraft.app` (o el elegido).
2. CNAME en el DNS del registrar según lo que indique Railway.
3. Actualizar `PUBLIC_URL` al dominio final y actualizar la URL del webhook en Stripe si cambió.

## 6. Smoke test de producción (evidencia del gate)

- [ ] `GET https://<dominio>/health` → `{"status":"healthy"}`.
- [ ] Home carga y dice **MapCraft** (título de pestaña y h1).
- [ ] Crear sesión → prompt de prueba → estructura renderiza en el visor 3D.
- [ ] Click "Descargar · $2.99" → redirige a Stripe Checkout **live**.
- [ ] Pagar con tarjeta real ($2.99, se puede reembolsar desde el dashboard) → redirect `?paid=success` → botón cambia a "Descargar para tablet".
- [ ] Descargar `.mcpack` → importarlo en Minecraft Bedrock en tablet → `/structure load mystructures:generated 0 64 0`.
- [ ] Redeploy del servicio → la sesión pagada **sigue** pagada (volumen OK).
- [ ] Logs de Railway sin errores en el webhook (`checkout.session.completed` procesado).

## 7. Pendientes conocidos post-lanzamiento

- **Tabla `entitlements` agnóstica** (`source: stripe|apple`): sustituir el marker
  `paid.json` por un registro consultable — prerrequisito del bloque iOS/IAP
  (ver `docs/APP_STORE_RISK_AUDIT.md`).
- Sin rate-limiting en `/api`: cada prompt cuesta tokens de Gemini. Vigilar el
  gasto en Google AI Studio; añadir límite por IP/sesión si hay tráfico real.
- Licencia del atlas de texturas (auditoría pendiente, riesgo 5.2.1 del audit).
