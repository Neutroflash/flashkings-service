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

## 2b. Baja lógica del catálogo

- **Un producto o variante que ya se vendió NO se puede borrar.** Sus `OrderItem` (y tras ellos los `RefundItem` y el comprobante SUNAT ya emitido) lo referencian, y ese comprobante tiene que seguir siendo explicable — ya vive en los servidores de SUNAT. El `DELETE` real solo funciona si nunca hubo una venta; con ventas devuelve 409 explicando que hay que desactivar. — [`PrismaProductRepository`](../src/infrastructure/database/PrismaProductRepository.ts)
- Desactivar (`isActive: false`) lo saca del catálogo, la búsqueda, el sitemap y la ficha pública (que pasa a 404, no a una página vacía) sin tocar una sola venta histórica.
- La baja existe en **dos niveles**: producto completo, o una sola variante — para descontinuar un color o un tipo de switch sin bajar el producto entero. Las variantes inactivas se filtran en `toPublicProduct`, así que no aparecen en el selector ni cuentan para `inStock`.
- **El filtro no lo elige el llamador**: `GetProductsUseCase` decide `onlyActive` según el rol, para que ningún query param pueda destapar el catálogo oculto. Un ADMIN ve todo (necesita poder reactivar lo que desactivó); cualquier otro, solo lo activo.
- **No se puede comprar una variante inactiva**, y eso se comprueba dentro de la transacción con la fila bloqueada — no en una validación previa. Entre una lectura optimista y el checkout el admin puede haberla desactivado, y el pedido se cerraría igual. Mismo razonamiento que la disponibilidad de stock.
- **Una categoría con productos no se borra.** `Product.categoryId` es obligatorio, así que no hay ningún destino al que mandarlos: el admin tiene que reasignarlos primero. Mandarlos automáticamente a una categoría "sin clasificar" sería inventar una decisión de catálogo que le corresponde a él.
- Ni el slug de un producto ni el de una categoría son editables: son URLs públicas que pueden estar indexadas o compartidas.

## 2c. Imágenes de producto

- La imagen se sube **directo del navegador a Cloudinary**; el backend solo firma la operación y nunca recibe los bytes. Es deliberado: hacer de intermediario de subidas en un servicio de 512 MB de RAM (Render Starter) es la forma más rápida de tumbarlo. — [`SignImageUploadUseCase`](../src/application/products/SignImageUploadUseCase.ts)
- El `CLOUDINARY_API_SECRET` nunca sale del backend, y el `folder` lo fija el servidor dentro de la firma — el cliente no puede elegir dónde escribe.
- Pegar una URL a mano sigue funcionando: lo que se persiste es la URL, venga de donde venga.

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

## 7a. Envío y tarifa plana

- Dos zonas, tarifa plana: **Lima Metropolitana S/ 15**, **provincia S/ 25**. — [`Shipping.ts`](../src/domain/entities/Shipping.ts) (`SHIPPING_RATES`)
- Las tarifas viven en el dominio, no en variables de entorno: son parte del precio informado al cliente y del monto que va al comprobante, así que cambiarlas debe pasar por un commit y quedar en el historial — mismo criterio que el IGV.
- **El departamento de Lima no es Lima Metropolitana.** Solo la provincia de Lima (más el Callao entero) paga tarifa urbana; Huaura, Cañete, Barranca y el resto del departamento pagan provincia. Cobrarles S/ 15 sería regalar el flete en cada pedido de esa zona. — `resolveShippingZone`
- El flete **se calcula en el servidor**, dentro de la misma transacción que reserva el stock, a partir del destino. Nunca se acepta un monto enviado por el cliente: sería manipulable desde el navegador.
- Queda congelado en `Order.shippingCost` y la zona en `Order.shippingZone`, por la misma razón que `OrderItem.price` — una tarifa nueva no reescribe ventas viejas, y una orden de hace meses tiene que poder explicar el flete que cobró.
- `Order.totalAmount` **incluye** el flete. El checkout cobra ese monto tal cual lo devuelve el servidor; el navegador no vuelve a sumar su propio total (no conoce la tarifa).
- En el comprobante el flete va como **una línea de servicio propia**, gravada con IGV igual que los productos. Es obligatorio: SUNAT valida que las líneas sustenten los totales del documento, así que facturar solo los productos declararía un total que sus propias líneas no respaldan. — `buildInvoiceLines` en [`SunatInvoicingGateway`](../src/infrastructure/invoicing/SunatInvoicingGateway.ts)
- El desglose de IGV se hace **por línea y se suma**, no sobre el gran total. Con 149.90 + 15.00 eso da 139.74 + 25.16 en vez de 139.75 + 25.15: ambas cuadran contra el total, y la del documento es la que suma por línea.

## 7b. Post-venta: reembolsos y notas de crédito

- **`REFUNDED` es un estado distinto de `CANCELLED`, a propósito**: `CANCELLED` significa que la orden murió antes de que se moviera dinero (hold expirado, cargo rechazado, pago manual rechazado) — no hay nada que devolver y el `stock` físico nunca se decrementó. `REFUNDED` es lo contrario en ambos puntos. — [`Order.ts`](../src/domain/entities/Order.ts)
- Una orden es reembolsable en todo el tramo post-pago: `PAID`, `IN_PREPARATION`, `SHIPPED` y `DELIVERED` (`REFUNDABLE_STATUSES`). Incluye `DELIVERED` porque una devolución llega casi siempre después de entregada, que es cuando el cliente vio el producto.
- **Reembolso total vs. parcial**: total = "no queda nada más por devolver" (no "igual al total de la orden"), así que dos parciales que agotan el saldo también cierran la orden. Un parcial **no** cambia el estado — una orden entregada sigue `DELIVERED` y solo acumula un `Refund`.
- **El orden de operaciones es la regla de seguridad**: primero se registra el reembolso en nuestra base — en la misma transacción que acumula `refundedQuantity`, repone `stock` si corresponde y pasa la orden a `REFUNDED` — y **recién después** se le pide el dinero a la pasarela. Al revés, un fallo entre ambas dejaría dinero devuelto sin ningún registro nuestro, que es la única mitad del flujo que no se puede reconstruir mirando la base. Con este orden el peor caso es un `Refund` en `FAILED`: visible y reintentable. — [`RefundOrderUseCase`](../src/application/refunds/RefundOrderUseCase.ts)
- La transacción bloquea la orden con `FOR UPDATE` antes de leer cuánto queda por devolver — mismo razonamiento que el motor de stock hold: sin el lock, dos reembolsos concurrentes pueden cada uno pasar una validación que el otro invalida y sumar más que el total. — [`PrismaRefundRepository`](../src/infrastructure/database/PrismaRefundRepository.ts)
- **Reponer stock es decisión del admin, no automática**: un producto que volvió al almacén sí, uno perdido o dañado en tránsito no.
- **Reembolso manual**: si el dinero se devolvió por fuera (transferencia, Yape), no se toca la pasarela y el reembolso queda `COMPLETED` por declaración del admin — el flujo espejo de `ConfirmManualPaymentUseCase` del lado del cobro.
- **La nota de crédito es un paso aparte**, no un efecto del reembolso: devolverle la plata al cliente no puede quedar bloqueado porque SUNAT esté caído, y una orden que nunca tuvo comprobante emitido no necesita ninguna nota. — [`IssueCreditNoteUseCase`](../src/application/invoicing/IssueCreditNoteUseCase.ts)
- El motivo del reembolso **es** el código del catálogo 09 de SUNAT, no un texto aparte — se elige una sola vez y viaja igual al comprobante de corrección. — [`note-catalogs.ts`](../src/infrastructure/invoicing/sunat/note-catalogs.ts)
- La serie de una nota depende de qué corrige (`BC01` sobre boleta, `FC01` sobre factura), son secuencias correlativas independientes — por eso `InvoiceCounter` tiene clave compuesta `(type, series)`.
- Solo los motivos de anulación total (01, 02, 06) dejan el comprobante original en `VOID`. Un descuento o una devolución por ítem lo dejan vigente con monto corregido.
- Una nota por reembolso: un doble click no puede quemar dos correlativos contra el mismo hecho.

### El flete en una devolución

- **Se devuelve cuando la falla es del negocio, no cuando el cliente se arrepiente** — práctica estándar: el envío ya se prestó como servicio. El catálogo 09 de SUNAT **no modela culpa** (`06 Devolución total` cubre tanto un teclado fallado como un arrepentimiento), así que esto no se deriva del motivo: es un flag propio (`Refund.includesShipping`) con un valor sugerido por motivo (01/02/03 → sí) que el admin puede cambiar en cualquier dirección. — `suggestsShippingRefund`
- **Una orden se cierra por dos caminos, no uno**: cuando no queda dinero por devolver, **o** cuando no queda producto por devolver (`allUnitsRefundedAfter`). El segundo existe justamente por el flete: en una devolución por arrepentimiento el saldo nunca llega a cero aunque el cliente haya devuelto todo el producto, y sin esa regla esas órdenes se quedarían para siempre en `PAID` con un residuo del tamaño exacto del envío.
- `includesShipping` describe **el monto**, no el cierre de la orden. Atarlo a `isFull` marcaría como devuelto un flete que el negocio retuvo, y eso rompería tanto el saldo de un reembolso posterior como las líneas de la nota de crédito.
- Si el reembolso incluyó el flete, la nota de crédito lleva su línea de envío: sus líneas deben sumar exactamente el monto devuelto.

## 8. Notificaciones (event-driven)

- Bus de eventos in-process (`NodeEventBus`, sobre `EventEmitter`) desacopla el flujo de pago/envío del envío de notificaciones.
- `OrderPaidEvent` se publica tras un `markPaid` exitoso (desde ambos caminos: charge síncrono y webhook).
- `OrderShippedEvent` se publica al transicionar a `SHIPPED`.
- `OrderRefundedEvent` se publica tras un reembolso. El handler **no** envía correo si el reembolso quedó `FAILED` — al cliente todavía no le llegó nada.
- `EmailService` escucha los tres eventos y envía `OrderConfirmedEmail` / `OrderShippedEmail` / `OrderRefundedEmail` (React Email, tema dark/dorado). Proveedor swappeable por env: `EMAIL_PROVIDER=console` (default, loguea el HTML renderizado, sin credenciales) vs `resend` (API real).
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
