# Estado de Implementación — Backend

Arquitectura: Clean/Hexagonal (`domain → application → infrastructure → presentation`), Express + Prisma/PostgreSQL, Redis/BullMQ, Bun como package manager. Ver [BUSINESS_RULES.md](./BUSINESS_RULES.md) y [DATA_MODEL.md](./DATA_MODEL.md) para el detalle de cada pieza.

Leyenda: ✅ implementado y probado con tráfico real · ⚠️ implementado pero con una limitación conocida · ❌ no implementado.

## Sprint 1 — Core API, RBAC, Catálogo

| Ítem | Estado | Notas |
|---|---|---|
| Modelos base (`User`, `Category`, `Product`, `ProductVariant`, `ProductImage`) | ✅ | |
| Registro/login/refresh/logout con JWT en cookies `HttpOnly` | ✅ | |
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
| CORS restrictivo (allowlist, no wildcard) | ✅ | |
| Logger centralizado (Pino) | ✅ | Reemplazó todos los `console.error` |
| `tsc --noEmit` + ESLint funcionando | ✅ | El script `lint` existía desde Sprint 1 sin configuración real — se corrigió |
| CI (GitHub Actions) | ✅ | `bun install --frozen-lockfile` → `prisma generate` → `tsc` → `lint` → `build`, verde en cada push a `main` |
| Deploy automatizado a Railway/Render | ❌ | Fuera de alcance de este repo por diseño — se deja como conexión manual del dashboard de Railway/Render al repo de GitHub (evita dos fuentes de verdad sobre qué está desplegado) |

## Pendientes explícitos (requieren acción humana, no bloquean el resto)

1. **Culqi**: crear cuenta sandbox, obtener `CULQI_PUBLIC_KEY`/`CULQI_SECRET_KEY`, habilitar Yape/Plin, confirmar el esquema real de firma de webhook y registrar la URL del webhook (necesita túnel tipo ngrok en local).
2. **Resend**: crear cuenta, obtener `RESEND_API_KEY`, verificar el dominio de envío (`pedidos@flashkings.pe`), cambiar `EMAIL_PROVIDER=resend`.
3. **Infraestructura de producción**: Postgres gestionado (Supabase/Neon/Render), Redis gestionado (Redis Cloud/Upstash), conectar el repo a Railway o Render.
4. **Dominio**: una vez `flashkings.pe` apunte a producción, actualizar `COOKIE_DOMAIN` y `CORS_ORIGIN`.

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
