# MapCraft — Auditoría de riesgos App Store (iOS)

**Fecha:** 2026-07-01
**Objetivo:** identificar y mitigar los riesgos de rechazo en App Review *antes* de invertir en la versión iOS, para no trabajar en vano.
**Contexto del producto:** MapCraft genera estructuras 3D de Minecraft Bedrock a partir de una frase, usando un agente LLM (Gemini 2.5 Flash) que escribe código Python contra un SDK propio. Público objetivo: padres que crean mapas para sus hijos. Web actual: FastAPI + React, cobro vía Stripe.
**Precedente propio:** modalidad_40_mx fue rechazada por 5.1.1(ix) — App Review sí escala estos temas; el costo de un rechazo es semanas.

---

## Resumen ejecutivo

| # | Riesgo | Guideline | Severidad | Veredicto |
|---|--------|-----------|-----------|-----------|
| 1 | Marca "Minecraft" en nombre/marketing | 5.2.1 / 5.2.5 | 🔴 CRÍTICO | Bloqueante si no se corrige |
| 2 | Stripe para bienes digitales dentro de la app | 3.1.1 | 🔴 CRÍTICO | Bloqueante si no se corrige |
| 3 | Contenido generado por IA sin moderación/reporte | 1.2 / 5.1 | 🟠 ALTO | Corregible con features mínimas |
| 4 | App percibida como "web wrapper" | 4.2 | 🟠 ALTO | Depende de la arquitectura elegida |
| 5 | Público infantil → Kids Category / privacidad | 1.3 / 5.1.4 | 🟡 MEDIO | Evitable con posicionamiento correcto |
| 6 | Etiqueta de privacidad y datos del prompt | 5.1.1 / 5.1.2 | 🟡 MEDIO | Papeleo, no ingeniería |

**Conclusión:** la app ES viable en App Store, pero solo si los riesgos 1 y 2 se resuelven ANTES de escribir código iOS. Ninguno de los dos se arregla "después"; ambos afectan nombre, branding y modelo de cobro desde el día uno.

> **Decisiones tomadas 2026-07-01 (aprobadas por Ricardo):**
> 1. Nombre definitivo = **MapCraft**. Rebrand de UI ejecutado: eliminado "MinecraftLM" de headings (ProjectsPage, SessionPage), `<title>`, nombres de archivo de descarga (`mapcraft_*.mcstructure`, `mapcraft.mcpack`) y system prompt del agente. `grep -ri minecraftlm` en `backend/app`, `backend/tests` y `frontend/src` = 0 resultados.
> 2. Modelo de cobro iOS = **IAP (StoreKit 2)**; Stripe queda solo para web. Pendiente de implementación: tabla `entitlements` agnóstica a pasarela en el backend (`source: stripe|apple`) antes de escribir Swift.

---

## 1. 🔴 Marca registrada "Minecraft" — Guideline 5.2.1 / 5.2.5

**El problema.** "Minecraft" es marca de Mojang/Microsoft. Apple rechaza (y Microsoft solicita retiros de) apps de terceros que:
- Usan "Minecraft" en el **nombre de la app** o como palabra dominante del ícono/screenshots.
- Usan **texturas, skins o assets oficiales** del juego.
- Sugieren afiliación oficial ("for Minecraft" mal usado, logos, tipografía del juego).

El nombre interno del repo era "MinecraftLM" — ese nombre es **inviable** en App Store. El rebrand a **MapCraft** ya apunta en la dirección correcta.

**Estado actual observado:**
- ✅ Landing ya dice "MapCraft" y "Powered by Gemini AI".
- ✅ Rebrand de UI completado (2026-07-01): headings del builder, `<title>` y archivos de descarga ya dicen MapCraft; 0 apariciones de "MinecraftLM" en código de app.
- ⚠️ Verificar origen legal del atlas de texturas (`assets/atlas.png` + lodestone): si son texturas extraídas del juego oficial, es riesgo de 5.2.1 y de DMCA. Las "texturas estilo voxel" propias o de packs con licencia libre son la alternativa segura.

**Mitigación (checklist):**
- [x] Nombre en App Store: "MapCraft" (decidido 2026-07-01). Subtítulo estilo "Mapas para Minecraft Bedrock" — el uso *referencial* ("compatible con") en el subtítulo/descripción es defendible; en el nombre no.
- [x] Eliminar "MinecraftLM" de toda la UI visible (hecho 2026-07-01, grep = 0 resultados).
- [ ] Auditar assets: texturas, íconos y screenshots 100 % propios o con licencia. Documentar la fuente en el repo.
- [ ] Disclaimer en la ficha: "No afiliado a Mojang ni Microsoft. Minecraft es marca de Mojang Synergies AB."
- [ ] Ícono de la app sin creepers, sin logo del juego, sin tipografía Minecrafter.

**Referencia de mercado:** apps como "AddOns Maker for Minecraft PE" sobreviven en App Store con este patrón exacto (nombre propio + referencia de compatibilidad + disclaimer). El patrón funciona, pero el margen de error es cero en el *nombre*.

---

## 2. 🔴 Stripe vs In-App Purchase — Guideline 3.1.1

**El problema.** El backend ya tiene `stripe_secret_key` configurado. En iOS, desbloquear **funcionalidad digital** (generaciones, mapas premium, suscripción) **debe** usar In-App Purchase de Apple. Meter Stripe (o un webview de checkout) para eso es rechazo casi automático por 3.1.1.

**Matices post-2025:** en EE. UU. (caso Epic) se permiten enlaces externos de pago, y existe la excepción de "reader apps", pero: (a) no aplica globalmente, (b) MapCraft no es reader app, y (c) el flujo con enlace externo degrada conversión y sigue requiriendo aprobación de entitlement. Para una v1, no vale la pena esa batalla.

**Mitigación (decisión de arquitectura, tomar ANTES de codificar):**
- [x] iOS = **StoreKit 2 / IAP** para todo lo digital (decidido 2026-07-01).
- [x] Stripe queda solo para la web (decidido 2026-07-01; eso es 100 % legal y común: mismo backend, dos pasarelas).
- [ ] La app iOS puede reconocer cuentas que ya pagaron por web (patrón Netflix/Spotify: login sí, *upsell* a la web no — cero enlaces "paga más barato en mapcraft.app" dentro de la app).
- [ ] Diseñar entitlements en el backend de forma agnóstica a la pasarela desde ahora (tabla `entitlements` con `source: stripe|apple`), para no rehacer el backend al llegar IAP.

**Costo aceptado:** comisión Apple 15 % (Small Business Program, < $1M USD/año) — inscribirse al programa antes del lanzamiento.

---

## 3. 🟠 Contenido generado por IA — Guidelines 1.2 y 5.1

**El problema.** Apple exige a las apps con generación de contenido por IA:
1. **Filtrado** de contenido ofensivo/inapropiado.
2. Mecanismo de **reporte** de contenido.
3. Posibilidad de **bloquear** contenido/usuarios abusivos (si hay componente social/compartido).
4. **Age rating coherente** — apps de IA generativa sin filtros robustos han sido forzadas a 17+; eso mataría el posicionamiento "para tus hijos".

MapCraft genera estructuras voxel (bajo riesgo intrínseco: es difícil generar algo obsceno con bloques), pero el *prompt* es texto libre y el agente escribe código — App Review evalúa el flujo, no la probabilidad.

**Mitigación (features mínimas para la v1 iOS):**
- [ ] Filtro de prompts en el backend (lista de bloqueo + rechazo del LLM ya ayuda; documentarlo para responder a App Review).
- [ ] Botón "Reportar" en cualquier estructura visible que no sea del propio usuario (si v1 no comparte nada entre usuarios, esto se reduce a un mailto/form — barato).
- [ ] Age rating honesto en App Store Connect: apuntar a 9+ o 12+ con la justificación "contenido generado moderado". No marcar 4+ (invita escrutinio) ni aceptar 17+ (mata el producto).
- [ ] Respuesta preparada para Review Notes: explicar el pipeline (prompt → código Python sandboxed → bloques voxel), por qué el output no puede contener texto/imágenes arbitrarias, y qué filtros hay. Esto previene el rechazo por desconocimiento del revisor.

---

## 4. 🟠 Funcionalidad mínima / web wrapper — Guideline 4.2

**El problema.** Si la app iOS es un WKWebView apuntando a mapcraft.app, es rechazo por 4.2 ("your app is primarily a website"). Apple lo detecta trivialmente.

**Mitigación (decisión de stack):**
- [ ] App **nativa SwiftUI** (coherente con el playbook de App Factory) con visor 3D nativo (SceneKit/RealityKit o Metal) consumiendo el mismo API FastAPI.
- [ ] Features que solo tienen sentido en iOS y refuerzan "no es un wrapper": exportar el mapa a **Bedrock en el iPhone/iPad** (abrir directo en Minecraft Bedrock iOS vía `.mcworld` / `.mcpack` share sheet), share sheet nativo, modo offline para ver mapas ya generados.
- [ ] El chat/streaming SSE se consume nativo, no embebido.

**Nota:** esta es la razón #1 para NO atajar con Capacitor/webview "para probar rápido" — ese atajo es precisamente lo que 4.2 castiga.

---

## 5. 🟡 Público infantil — Guidelines 1.3 y 5.1.4

**El problema.** El marketing dice "para tus hijos". Si la app se posiciona *dirigida a niños* (Kids Category), aplican reglas duras: sin tracking, sin links externos sin parental gate, análisis de terceros restringido, COPPA/GDPR-K. Un LLM de terceros procesando prompts de menores es terreno delicado.

**Mitigación (posicionamiento, no código):**
- [ ] **El usuario de la app es el padre** (como ya dice la landing: "crea mapas para tus hijos"). NO inscribirse en Kids Category. Age rating 9+/12+ normal.
- [ ] Evitar en la ficha de App Store lenguaje que implique que los niños *usan* la app directamente ("tu hijo podrá crear…" → "crea para tu hijo…").
- [ ] Si en el futuro se quiere modo niños, tratarlo como release separada con su propia auditoría.

---

## 6. 🟡 Privacidad y datos — Guidelines 5.1.1 / 5.1.2

**Checklist de papeleo (barato pero obligatorio):**
- [ ] Privacy Nutrition Label: declarar que los prompts se envían a un LLM de terceros (Google Gemini) para procesamiento. Prompts = "User Content".
- [ ] Política de privacidad en mapcraft.app (URL obligatoria en App Store Connect) que mencione Gemini/Google como subprocesador.
- [ ] Sin login obligatorio para probar la funcionalidad core (5.1.1(v): no exigir registro para funciones que no lo necesitan) — o si hay login, ofrecer **Sign in with Apple** junto a cualquier otro SSO (4.8).
- [ ] Account deletion in-app si hay cuentas (obligatorio desde 2022).
- [ ] Contacto App Review estándar: Ricardo Manjarrez, +52 6673 45 33 05.

---

## Plan de validación escalonada (evitar trabajo en vano)

La estrategia es comprar señal de App Review lo más barato posible en cada paso:

**Paso 0 — antes de escribir Swift (esta semana):**
1. Cerrar decisiones de los riesgos 🔴: nombre/branding final y modelo de cobro IAP. Son decisiones de papel, cuestan 0 código.
2. Auditar assets de texturas (riesgo 1). Si el atlas viene del juego oficial, planear reemplazo antes de iOS.

**Paso 1 — validación temprana con TestFlight (primer hito iOS):**
3. Construir el esqueleto mínimo navegable (landing + un mapa demo en visor 3D nativo) y subirlo a **TestFlight Beta Review externo**. La beta review externa la hace el mismo equipo de App Review con los mismos criterios base — es la señal más barata que existe de "¿me van a rechazar por 5.2.1?". Costo: ~1 día de build + 1-2 días de espera.
4. Si la beta review pasa con el nombre "MapCraft" + subtítulo de compatibilidad, el riesgo 1 queda validado con evidencia real.

**Paso 2 — primera submission real, alcance mínimo:**
5. v1.0 SIN compras (gratis, generaciones limitadas por servidor). Elimina el riesgo 2 de la primera review por completo; App Review evalúa una app simple.
6. v1.1 añade IAP una vez que la app ya está viva (las updates con IAP nuevo son reviews más suaves que una first submission con todo).

**Paso 3 — solo después de aprobada:**
7. Marketing "para padres", ASO, y evaluación de suscripción vs paquetes.

**Regla App Factory aplicable:** ningún gate se marca ✅ sin evidencia real — aquí la evidencia es la beta review de TestFlight aprobada (paso 1) y la v1.0 aprobada (paso 2), no una opinión.

---

## Qué NO es riesgo (para no sobre-corregir)

- **Generar código con IA en el servidor**: el código Python nunca corre en el dispositivo; para Apple la app solo consume un API. 2.5.2 (código ejecutable descargado) no aplica.
- **La palabra "Bedrock"/"mapas"**: descriptores genéricos, uso libre.
- **Apps de compañía para Minecraft**: categoría establecida y tolerada (docenas de apps top con años en la tienda); no es zona gris nueva.
- **El backend en FastAPI/Gemini**: a Apple no le importa el stack del servidor.
