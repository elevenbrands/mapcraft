# MapCraft — Deploy web GRATIS en Render

Guía para poner la web en internet **sin costo**, para validar que funciona y
que la gente la usa antes de pagar hosting. Cuando venda, se migra a un plan de
pago (o a Railway) — ver `docs/WEB_DEPLOY.md`.

> **Lo que el plan free NO da (y hay que aceptar para validar):**
> - La página **se duerme** tras ~15 min sin visitas. El primer visitante espera
>   ~30-50 s mientras despierta. Luego va rápido.
> - **Sin disco persistente:** cada deploy/reinicio borra las sesiones y los
>   `paid.json`. Un mapa comprado puede perderse si Render reinicia el servicio.
>   Para ventas reales esto NO sirve — es solo para probar el flujo completo.
> - 750 horas/mes gratis (suficiente para un servicio).

## 0. Prerrequisitos

- [ ] Cuenta en Render (https://render.com) — se puede crear con la cuenta de GitHub.
- [ ] Repo `elevenbrands/mapcraft` con `main` al día (ya lo está) y este archivo + `render.yaml` mergeados.
- [ ] `GEMINI_API_KEY` a mano (desde Keychain). Es la única llave imprescindible para que genere mapas.
- [ ] Stripe: opcional para el primer smoke test. Sin las llaves de Stripe, la web genera mapas pero el botón de pago no cobra. Se añaden después.

## 1. Crear el servicio (con el Blueprint)

1. Entra a https://dashboard.render.com → **New +** → **Blueprint**.
2. Conecta GitHub y elige el repo `elevenbrands/mapcraft`, rama `main`.
3. Render lee `render.yaml` y propone un servicio web llamado **mapcraft** en plan **Free**. Acepta (**Apply**).
4. Te pedirá los valores de las variables marcadas `sync:false`:
   - `GEMINI_API_KEY` → pega la llave de Gemini.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_URL` → puedes dejarlas **vacías** por ahora y rellenarlas en el paso 3.

Render empieza a construir la imagen Docker (tarda unos minutos la primera vez: compila el frontend y el backend).

## 2. Ver la web arriba

1. Cuando el deploy termine (estado **Live**), Render te da una URL tipo `https://mapcraft-xxxx.onrender.com`.
2. Ábrela. La primera carga puede tardar ~40 s (está despertando). Debe decir **MapCraft** y dejarte escribir un prompt.
3. Prueba un prompt (ej. "una casa pequeña de piedra"). Debe generar y renderizar el mapa en 3D. **Eso ya prueba que funciona en internet.**

## 3. Activar el pago con Stripe (cuando quieras cobrar de verdad)

1. En el dashboard de Render → servicio **mapcraft** → **Environment**:
   - `PUBLIC_URL` = la URL final de Render (ej. `https://mapcraft-xxxx.onrender.com`, sin `/` al final).
   - `STRIPE_SECRET_KEY` = `sk_live_…` (modo live).
2. En Stripe (modo live) → Developers → Webhooks → Add endpoint:
   - URL: `https://<tu-url-de-render>/api/stripe/webhook`
   - Evento: `checkout.session.completed` (el único que procesa el backend).
   - Copia el `whsec_…` → en Render, variable `STRIPE_WEBHOOK_SECRET`.
3. Guarda → Render redeploya solo. El precio ($2.99) va inline en el checkout; no hay que crear un Price en Stripe.

## 4. Smoke test

- [ ] `https://<url>/health` responde `{"status":"healthy"}`.
- [ ] Home carga y dice **MapCraft**.
- [ ] Prompt → mapa renderiza en el visor 3D.
- [ ] (Con Stripe) botón "Descargar · $2.99" → redirige a Stripe Checkout live → pago real → `?paid=success` → descarga `.mcpack`.

## 5. Cuándo dejar Render free

En cuanto la web **venda** o quieras que esté siempre despierta y no pierda las
compras: migra a plan de pago con disco persistente. La config de Railway
(`railway.json` + `docs/WEB_DEPLOY.md`) sigue lista para ese momento.
