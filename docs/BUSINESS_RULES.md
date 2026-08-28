# Reglas de Negocio — Flashkings API

Referencia de las reglas implementadas, organizadas por dominio. Cada regla enlaza al archivo que la implementa para que el código sea la fuente de verdad y este documento solo indique dónde mirar.

## 1. Autenticación y RBAC

- Dos roles: `CLIENT` (default al registrarse) y `ADMIN`. — [`prisma/schema.prisma`](../prisma/schema.prisma) (`enum Role`)
- Contraseñas con `bcryptjs`, 12 salt rounds. — [`PasswordHasher.ts`](../src/infrastructure/security/PasswordHasher.ts)
- JWT de acceso (15 min) + refresh token (7 días), ambos en cookies `HttpOnly`, `SameSite=strict`. El refresh rota **ambos** tokens en cada uso. — [`TokenService.ts`](../src/infrastructure/security/TokenService.ts), [`cookies.ts`](../src/infrastructure/security/cookies.ts)
- El access token lleva `{ sub, email, role }`. Ninguna consulta a base de datos por request autenticado — el rol viaja en el propio JWT.
- Rutas públicas (catálogo) usan `attachUserIfPresent`: si hay cookie válida, adjunta `req.user` sin exigirlo; así el mismo endpoint puede servir datos sanitizados a anónimos y datos completos a un ADMIN logueado. — [`authenticateJWT.ts`](../src/presentation/middlewares/authenticateJWT.ts)
- Rutas ADMIN-only exigen `authenticateJWT` + `requireRole('ADMIN')`. — [`requireRole.ts`](../src/presentation/middlewares/requireRole.ts)
- `/api/auth/*` limitado a 10 requests / 15 min por IP (Redis) para frenar fuerza bruta. — [`rateLimiter.ts`](../src/presentation/middlewares/rateLimiter.ts)

## 2. Catálogo y visibilidad de productos

- `costPrice` y `reservedStock` de `ProductVariant` son **ADMIN-only**: nunca salen en una respuesta a un `CLIENT` o anónimo. La sanitización ocurre en la frontera del dominio (`toPublicProduct`/`toPublicVariant`), no en el controlador. — [`Product.ts`](../src/domain/entities/Product.ts), [`ProductVariant.ts`](../src/domain/entities/ProductVariant.ts)
- El stock público nunca es el número exacto: se expone `inStock: boolean`, calculado como `stock - reservedStock > 0`.
- Igual regla aplica a `GET /api/orders/:id` (público, para la página de confirmación): se sanitiza a `PublicOrder`, sin `costPrice` ni detalles internos de la variante — solo lo que le sirve al cliente. — [`Order.ts`](../src/domain/entities/Order.ts) (`toPublicOrder`)
- `GET /api/products` y `GET /api/categories` limitados a 120 requests/min por IP.

## 3. Motor de reserva de stock ("Stock Hold")

Es la regla más delicada del sistema — previene que dos clientes compren la última unidad simultáneamente.

- Al iniciar checkout (`POST /api/orders`), cada variante solicitada se bloquea con `SELECT ... FOR UPDATE` dentro de **una sola transacción** de Postgres.
- Disponible = `stock - reservedStock`. Si algún ítem no alcanza, se aborta toda la orden (`InsufficientStockError`, HTTP 409) — incluyendo los locks/incrementos ya hechos sobre ítems anteriores del mismo carrito.
- Si alcanza, se incrementa `reservedStock` (el stock físico **no** se toca todavía) y se congela el precio vigente en `OrderItem.price` — un cambio de precio posterior nunca afecta órdenes ya creadas.
- La orden nace en estado `PENDING_PAYMENT`.
- Los ítems se bloquean en orden estable (por `variantId`) entre checkouts concurrentes para evitar deadlocks.
- Postgres (los locks de fila) es el límite de corrección; Redis/BullMQ solo programa el timeout de 15 minutos — decisión de diseño para evitar dos fuentes de verdad sobre cuánto stock hay reservado.
- Implementación: [`PrismaOrderRepository.createWithStockReservation`](../src/infrastructure/database/PrismaOrderRepository.ts), caso de uso [`CreateOrderUseCase`](../src/application/orders/CreateOrderUseCase.ts).
- Verificado con test de concurrencia real: 10 requests simultáneos sobre una variante con `stock=1` → exactamente 1 éxito, 9 rechazados con 409.

## 4. Expiración del hold

- Al crear la orden se agenda un job BullMQ (`STOCK_HOLD_MINUTES`, default 15) que llama a `ExpireOrderUseCase`.
- Si nadie pagó a tiempo: `Order.status → CANCELLED`, `cancelReason = EXPIRED_HOLD`, se libera `reservedStock`. `stock` **nunca** se decrementó, así que no hay nada que devolver ahí.
- El worker corre en un **proceso separado** (`src/worker.ts`, `bun run worker:dev`), independiente del servidor HTTP.
- Implementación: [`stockHoldWorker.ts`](../src/infrastructure/queue/stockHoldWorker.ts), [`ExpireOrderUseCase`](../src/application/orders/ExpireOrderUseCase.ts).

## 5. Confirmación de pago

- Dos caminos posibles, ambos deben converger de forma segura:
  - **Síncrono** (`POST /api/payments/charge`): fast-path para tarjetas que confirman al instante.
  - **Webhook** (`POST /api/payments/webhook`): fuente de verdad final, especialmente para métodos async (Yape/Plin pueden volver `pending` en el charge síncrono).
- Pago exitoso → `Order.status = PAID`, `paidAt` seteado, **recién aquí** se decrementa `stock` físico y se libera `reservedStock`, se cancela el job de expiración, y se publica `OrderPaidEvent` (dispara el email de confirmación).
- Pago rechazado → `Order.status = CANCELLED`, `cancelReason = PAYMENT_DECLINED`, se libera `reservedStock` (stock físico intacto).
- `markPaid`/`releaseHold` son **idempotentes**: ambos solo actúan si `status = 'PENDING_PAYMENT'`. Esto hace segura la carrera entre el charge síncrono, el webhook y el worker de expiración — quien llega primero "gana", el resto es no-op.
- El webhook usa el body **crudo** (sin parsear) específicamente para que la verificación de firma vea los mismos bytes que firmó la pasarela — ver el `express.raw()` en [`paymentRoutes.ts`](../src/presentation/routes/paymentRoutes.ts) y el bypass del `express.json()` global en [`app.ts`](../src/app.ts).
- Pasarela abstraída detrás de `IPaymentGateway`: `FakePaymentGateway` (dev/test, determinístico — el monto `13.00` fuerza un rechazo) vs `CulqiPaymentGateway` (integración REST real). **La verificación de firma del webhook de Culqi es un placeholder documentado** — no se pudo confirmar el esquema exacto de firma sin credenciales/documentación en vivo.
- Implementación: [`ProcessPaymentUseCase`](../src/application/payments/ProcessPaymentUseCase.ts), [`HandleCulqiWebhookUseCase`](../src/application/payments/HandleCulqiWebhookUseCase.ts).

## 6. Checkout como invitado

- `Order.userId` es opcional. Cualquiera compra sin cuenta; si hay sesión activa, la orden se vincula al usuario vía `attachUserIfPresent`, pero nunca se exige login.

## 7. Fulfillment (panel admin)

- Transiciones manuales son una cadena estricta de un solo sentido: `PAID → IN_PREPARATION → SHIPPED → DELIVERED`.
- `PAID`, `PENDING_PAYMENT` y `CANCELLED` son 100% gestionados por el sistema — pedirlos vía `PATCH /api/admin/orders/:id/status` devuelve 409.
- La transición a `SHIPPED` acepta `trackingNumber`/`courier` opcionales, se persisten en la orden y viajan al email de envío.
- Implementación: tabla de transición derivada en [`PrismaOrderRepository`](../src/infrastructure/database/PrismaOrderRepository.ts) (`REQUIRED_PRIOR_STATUS`, calculada desde `ALLOWED_MANUAL_TRANSITIONS` en [`Order.ts`](../src/domain/entities/Order.ts)) para que la actualización sea un único `UPDATE` condicional atómico.

## 8. Notificaciones (event-driven)

- Bus de eventos in-process (`NodeEventBus`, sobre `EventEmitter`) desacopla el flujo de pago/envío del envío de notificaciones.
- `OrderPaidEvent` se publica tras un `markPaid` exitoso (desde ambos caminos: charge síncrono y webhook).
- `OrderShippedEvent` se publica al transicionar a `SHIPPED`.
- `EmailService` escucha ambos eventos y envía `OrderConfirmedEmail` / `OrderShippedEmail` (React Email, tema dark/dorado). Proveedor swappeable por env: `EMAIL_PROVIDER=console` (default, loguea el HTML renderizado, sin credenciales) vs `resend` (API real).
- Un fallo en el handler se loguea, **nunca** se propaga al publicador — un proveedor de email caído no puede tumbar el flujo de pago/envío que lo disparó.
- WhatsApp: no hay integración con la Business API. Se genera un link `wa.me` con el resumen del pedido pre-rellenado, en el frontend (`lib/whatsapp.ts`), expuesto como botón en el detalle de pedido del admin.
- Implementación: [`NodeEventBus.ts`](../src/infrastructure/events/NodeEventBus.ts), [`registerEventListeners.ts`](../src/infrastructure/events/registerEventListeners.ts).

## 9. Seguridad transversal

- CORS con allowlist explícita de orígenes (nunca wildcard) — obligatorio porque se usa `credentials: true` con cookies.
- Helmet para headers XSS/sniffing/clickjacking. La protección CSRF real es la combinación `SameSite=strict` + allowlist de CORS explícita, no un header de Helmet.
- Rate limiting respaldado por Redis (compartido si se escala horizontalmente): auth 10/15min, catálogo 120/min.
- Logger centralizado con Pino: errores esperados (`AppError`, 4xx) a nivel `warn`; errores no manejados a nivel `error` con stack completo.

## 10. SEO (ver también `flashkings-webapp`)

- `generateMetadata` dinámico por producto (título, descripción armada desde `description` + `attributes` de la variante, OpenGraph + Twitter Card).
- ISR: producto revalida cada 3600s, catálogo cada 60s, categorías cada 3600s.
- `sitemap.xml` dinámico (rutas estáticas + todas las categorías + todos los productos) y `robots.txt` (bloquea `/checkout`, `/admin`, `/pedido`, `/login`).
