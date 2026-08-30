# Estado de Implementación — Backend

Arquitectura: Clean/Hexagonal (`domain → application → infrastructure → presentation`), Express + Prisma/PostgreSQL, Redis/BullMQ, Bun como package manager. Ver [BUSINESS_RULES.md](./BUSINESS_RULES.md) y [DATA_MODEL.md](./DATA_MODEL.md) para el detalle de cada pieza.

Leyenda: ✅ implementado y probado con tráfico real · ⚠️ implementado pero con una limitación conocida · ❌ no implementado.

## Sprint 1 — Core API, RBAC, Catálogo

| Ítem | Estado | Notas |
|---|---|---|
| Modelos base (`User`, `Category`, `Product`, `ProductVariant`, `ProductImage`) | ✅ | |
| Registro/login/refresh/logout con JWT en cookies `HttpOnly` | ✅ | |
| Recuperación de contraseña (`forgot`/`reset-password`) | ✅ | Portado de saas-erp-pe. Token de un solo uso (32 bytes, solo se persiste el hash SHA-256), 30 min de vigencia. Verificado en vivo: mismo mensaje exista o no el correo (anti-enumeración), token incorrecto rechazado, token reusado rechazado, login con la contraseña vieja falla / con la nueva funciona |
| Verificación de email, no bloqueante | ✅ | Token de 7 días generado en el mismo registro, envío best-effort (nunca bloquea el registro). Verificado en vivo: token correcto/incorrecto/reusado, `resend-verification` da 409 si ya está verificado |
| **Bug real encontrado y corregido en el camino** — hashes de tokens expuestos en la respuesta | ✅ (corregido) | `toSafeUser()` solo excluía `passwordHash` con un spread — como Prisma devuelve TODAS las columnas en runtime (el tipo de TS no cambia el objeto real), los hashes de reset/verificación viajaban igual en `POST /auth/register`. Corregido con `select` explícito en `PrismaUserRepository` (mismo patrón `toDomain` que ya usa `PrismaInvoiceRepository`) — encontrado probando el flujo en vivo, nunca llegó a producción |
| Frontend: `/cuenta/olvide-password`, `/cuenta/restablecer-password`, `/cuenta/verificar-email`, aviso de verificación en `/cuenta` | ✅ | `tsc`/`next build` verificados (las 3 páginas nuevas generan como estáticas, sin el error de `useSearchParams` fuera de `Suspense`). **No verificado en navegador** — sin herramienta de browser disponible en esta sesión |
| RBAC (`CLIENT`/`ADMIN`) vía middlewares | ✅ | |
| Sanitización de `costPrice`/stock exacto en respuestas públicas | ✅ | Probado: `GET /api/products` sin auth no expone `costPrice` |
| CRUD de productos + variantes (crear, editar stock/precio/costo) | ✅ | |
| Seed de datos de prueba | ✅ | `bun run prisma:seed` — admin + categoría + producto de ejemplo |

## Sprint 2 — Carrito, Reserva de Stock, Pagos, Admin

| Ítem | Estado | Notas |
|---|---|---|
| Reserva de stock con locking de fila (`FOR UPDATE`) | ✅ | Test de concurrencia real: 10 requests simultáneos, 1 solo éxito |
| Expiración automática del hold (BullMQ, 15 min configurable) | ✅ | Probado con TTL de 3s en un test controlado |
| Checkout de invitado (`Order.userId` opcional) | ✅ | |
| Cobro síncrono (`POST /api/payments/charge`) | ✅ | Contra `FakePaymentGateway` |
| Webhook de pagos con verificación de firma | ⚠️ | Estructura completa y probada con `FakePaymentGateway`. **`CulqiPaymentGateway.verifyWebhookSignature` es un placeholder HMAC-SHA256 no verificado contra Culqi real** — falta confirmar el header/algoritmo exacto contra la documentación viva antes de producción |
| Integración real con Culqi (cobro) | ❌ | `CulqiPaymentGateway.createCharge` está codeado contra la API REST documentada de Culqi pero nunca se probó contra un sandbox real — no hay credenciales en este entorno |
| Dashboard admin: inventario (editar stock/precio/costo) | ✅ | |
| Dashboard admin: pedidos (listar, filtrar, transicionar estado) | ✅ | |
| Rutas admin protegidas por rol | ✅ | Probado: request sin cookie → 401; con cookie de `CLIENT` → 403 (implícito por `requireRole`) |

## Sprint 3 — Notificaciones, SEO, Seguridad, Deploy

| Ítem | Estado | Notas |
|---|---|---|
| `OrderConfirmedEmail` / `OrderShippedEmail` (React Email) | ✅ | Verificado: pago exitoso → email logueado con datos reales de la orden |
| Desacople vía eventos (`OrderPaidEvent`/`OrderShippedEvent`) | ✅ | `NodeEventBus` in-process, sin cola — decisión deliberada, ver `BUSINESS_RULES.md` §8 |
| Envío real de email (Resend) | ❌ | Falta `RESEND_API_KEY` — el sistema funciona hoy con `EMAIL_PROVIDER=console` (loguea el HTML en vez de enviar) |
| WhatsApp | ⚠️ | Solo enlace `wa.me` generado en frontend, sin integración con WhatsApp Business API |
| Rate limiting (Redis) en auth y catálogo | ✅ | Probado: intento #10 de login → 429 |
| Aviso diario de stock bajo (cola `low-stock`, recurrente) | ✅ | Portado de saas-erp-pe. Un solo correo por ADMIN (no uno por SKU) si algo cae en o por debajo de `LOW_STOCK_THRESHOLD` (default 5), toggleable con `LOW_STOCK_ALERTS_ENABLED`. **Bug de compatibilidad encontrado**: BullMQ 6.x (la versión instalada acá) eliminó `repeat` de `queue.add()` en favor de `queue.upsertJobScheduler()` — el código original de saas-erp-pe (bullmq 5.x) no compilaba tal cual. Verificado en vivo: detecta correctamente las 2 variantes bajo el umbral (excluye las demás), `0` correos cuando nada califica, el job recurrente se registra en Redis, y el toggle `LOW_STOCK_ALERTS_ENABLED=false` saca la cola del arranque del worker |
| CORS restrictivo (allowlist, no wildcard) | ✅ | |
| Logger centralizado (Pino) | ⚠️→✅ | Reemplazó todos los `console.error` de Sprint 1-3, pero `stockHoldWorker.ts` (Sprint 2) había quedado afuera — corregido en Sprint 4 junto con la supervisión del worker, ver abajo |
| `tsc --noEmit` + ESLint funcionando | ✅ | El script `lint` existía desde Sprint 1 sin configuración real — se corrigió |
| CI (GitHub Actions) | ✅ | `bun install --frozen-lockfile` → `prisma generate` → `tsc` → `lint` → `build`, verde en cada push a `main` |
| Deploy automatizado a Railway/Render | ❌ | Fuera de alcance de este repo por diseño — se deja como conexión manual del dashboard de Railway/Render al repo de GitHub (evita dos fuentes de verdad sobre qué está desplegado) |
| Backups de base de datos (`scripts/backup-db.sh`, `restore-db.sh`) | ✅ | Portado de saas-erp-pe. Red adicional **independiente** del PITR de Neon (primera línea de defensa) — cubre el caso "se borró/suspendió la cuenta completa", que un backup que vive dentro de esa misma cuenta no cubre. `pg_dump`/`psql` con fallback a `docker exec` en dev local. Verificado en vivo: dump real de la DB de desarrollo, restaurado contra una base temporal separada (luego eliminada) — las 12 tablas y los datos existentes llegaron intactos |

## Sprint 4 — Facturación electrónica SUNAT

Portado desde `saas-erp-pe` (SaaS multi-tenant hermano de este proyecto) — mismo módulo `infrastructure/invoicing/sunat/*` (firma XAdES-BES, XML UBL 2.1, envío SOAP), adaptado acá a negocio único: credenciales SUNAT en variables de entorno (`SUNAT_*` en `.env`), no cifradas por tenant en la base de datos como en el proyecto de origen.

| Ítem | Estado | Notas |
|---|---|---|
| Integración directa con SUNAT (sin PSE/OSE), Boleta y Factura | ✅ | **Confirmado en vivo contra `e-beta.sunat.gob.pe` real, las dos**: `B001-2` (`ResponseCode "0"`, "ha sido aceptada") y `F001-5` (ídem) |
| Firma XAdES-BES (`sign.ts`, `xades.ts`, `certificate.ts`) | ✅ | Portado sin cambios — la firma es agnóstica del tipo de documento UBL |
| PDF del comprobante bajo demanda (`GET /api/admin/orders/:id/invoice/pdf`) | ✅ | Verificado: PDF válido de 1 página generado a partir del comprobante `ISSUED` |
| Reintento automático ante SUNAT caído (`PENDING_SUNAT`, cola BullMQ `sunat-retry`) | ✅ | Backoff creciente (2min, 4min, 8min...), máx. 5 intentos (`SUNAT_RETRY_MAX_ATTEMPTS`). Mecanismo de idempotencia/DI verificado en vivo; el escenario real de SUNAT caído no se pudo simular (necesitaría tirar abajo `e-beta.sunat.gob.pe`, fuera de nuestro control) |
| **Bug real encontrado y corregido en el camino** — FACTURA rechazada | ✅ (corregido) | Boleta se aceptaba sin problema, pero Factura no: faltaba `cbc:AddressTypeCode` (código de local anexo) en `AccountingSupplierParty` y `cac:PaymentTerms` (forma de pago). Corregido acá y portado de vuelta a `saas-erp-pe`, donde el mismo bug existía sin detectar (nunca se había probado Factura ahí, solo Boleta y Notas) — confirmado en vivo en los dos proyectos tras el fix |
| Certificado digital acreditado real (producción) | ❌ | El de prueba (autofirmado, homologación pública `MODDATOS`) solo sirve contra BETA — para producción hace falta un certificado real: gratis vía Certificado Digital Tributario de SUNAT (SOL → Empresas → Comprobantes de Pago) si el negocio califica como MYPE, o de una entidad certificadora acreditada ante INDECOPI si no |
| Guías de remisión electrónica | ❌ | **Decisión explícita: queda pendiente, no se construye por ahora.** Es una integración completamente distinta de boletas/facturas (API REST + OAuth2 propia, `client_id`/`client_secret` generados en un menú aparte de SOL, envío asíncrono por ticket — no el SOAP+XAdES ya construido), confirmado al construirla en saas-erp-pe. Y a diferencia de todo lo demás en esta fase, la API GRE **no tiene cuenta pública de pruebas** (no existe un `MODDATOS` para GRE) — no hay forma de verificar nada en vivo sin que el negocio real tramite sus credenciales OAuth2 primero. El código de referencia (v1, solo "transporte privado") ya existe en `saas-erp-pe/src/domain/dispatch-guides/` si más adelante se decide portarlo |
| Supervisión de `worker.ts` (`SIGINT`, `unhandledRejection`, `uncaughtException`, `.on("error")` de conexión) | ✅ | Antes solo se manejaba `SIGTERM` — un `Ctrl+C` en dev o una excepción no atrapada en cualquiera de los dos workers mataba el proceso sin dejar ningún rastro. Verificado en vivo: arranque limpio, `SIGINT` cierra las 2 colas y termina con log claro. De paso, `stockHoldWorker.ts` pasó de `console.log`/`console.error` a Pino (`logger`) — se había quedado afuera del reemplazo de Sprint 3 |

## Pendientes explícitos (requieren acción humana, no bloquean el resto)

1. **Culqi**: crear cuenta sandbox, obtener `CULQI_PUBLIC_KEY`/`CULQI_SECRET_KEY`, habilitar Yape/Plin, confirmar el esquema real de firma de webhook y registrar la URL del webhook (necesita túnel tipo ngrok en local).
2. **Resend**: crear cuenta, obtener `RESEND_API_KEY`, verificar el dominio de envío (`pedidos@flashkings.pe`), cambiar `EMAIL_PROVIDER=resend`.
3. **Infraestructura de producción**: Postgres gestionado (Supabase/Neon/Render), Redis gestionado (Redis Cloud/Upstash), conectar el repo a Railway o Render.
4. **Dominio**: una vez `flashkings.pe` apunte a producción, actualizar `COOKIE_DOMAIN` y `CORS_ORIGIN`.
5. **SUNAT**: certificado digital acreditado real (ver Sprint 4 arriba) + RUC/razón social/dirección/usuario SOL reales en `.env`, cambiar `SUNAT_PROVIDER=sunat` y `SUNAT_ENVIRONMENT=PRODUCCION` recién después de validar en BETA con esos datos reales.
6. **Guías de remisión electrónica** — pendiente, no construido (ver Sprint 4 arriba). Si en algún momento se decide construirlo: primero tramitar `client_id`/`client_secret` de la API GRE en SOL (menú aparte del usuario/clave SOL de facturación — [Manual_Servicios_GRE.pdf](https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_Servicios_GRE.pdf) de SUNAT), recién ahí tiene sentido portar el código de referencia desde `saas-erp-pe`.

## Cómo correr esto localmente

```bash
docker run -d --name flashkings-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=flashkings -p 5432:5432 postgres:16-alpine
docker run -d --name flashkings-redis -p 6379:6379 redis:7-alpine

cp .env.example .env   # completar según necesidad; los defaults ya sirven para dev
bun install
bunx prisma migrate dev
bun run prisma:seed

bun run dev          # API en :4000
bun run worker:dev   # worker de expiración de holds (proceso separado)
```

Credenciales de prueba tras el seed: `admin@flashkings.pe` / `Admin123!`.
