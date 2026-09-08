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

## Sprint 5 — Post-venta: reembolsos y notas de crédito

Cierra el hueco más grande que quedaba del ciclo de vida de una orden: hasta acá una orden pagada no tenía ninguna salida — ni cancelación, ni reembolso, ni nota de crédito. `ADMIN_CANCELLED` existía en el enum pero solo lo alcanzaba `RejectManualPaymentUseCase`, que actúa sobre `PENDING_PAYMENT`.

| Ítem | Estado | Notas |
|---|---|---|
| Estado `REFUNDED` + transición desde todo el tramo post-pago | ✅ | Verificado en vivo: reembolso parcial deja la orden en `PAID`; el que agota el saldo la pasa a `REFUNDED` con `refundedAt` |
| Reembolso total y parcial (`POST /api/admin/orders/:id/refund`) | ✅ | Verificado en vivo con `FakePaymentGateway`: 2 unidades a S/ 250 → parcial de 1 (orden sigue `PAID`, stock 7→8), luego la otra (orden `REFUNDED`, stock →9) |
| Reposición de stock opcional por reembolso | ✅ | Decisión del admin (`restock`), no automática — un producto perdido en tránsito no vuelve al almacén |
| Guardas de sobre-reembolso | ✅ | Verificado en vivo, los tres: devolver más dinero del que queda (409), más unidades de las que quedan de una línea (409), y reembolsar una orden ya `REFUNDED` (409). Validado dentro de la transacción con la orden bloqueada `FOR UPDATE` |
| Reembolso manual (dinero devuelto por fuera) | ✅ | Flujo espejo de `ConfirmManualPaymentUseCase`; no toca la pasarela |
| `refundCharge` en `IPaymentGateway` | ⚠️ | `FakePaymentGateway` completo (el monto `7.00` fuerza un rechazo). **`CulqiPaymentGateway.refundCharge` está escrito contra la API REST documentada pero NUNCA ejecutado contra un sandbox real** — mismo estado que `createCharge`. Al conectar credenciales hay que verificar el catálogo de `reason` y el shape de un reembolso parcial |
| `OrderRefundedEmail` + `OrderRefundedEvent` | ✅ | Verificado en el log en modo `console`. No se envía si el reembolso quedó `FAILED` — al cliente todavía no le llegó nada |
| El cliente ve su devolución en `/pedido/:id/confirmacion` | ✅ | Sanitizado a `PublicRefund`: sin `rawResponse`, `providerRefundId`, `reasonCode` ni `createdById` |
| Nota de crédito SUNAT (catálogo 09, UBL 2.1 `CreditNote`) | ⚠️ | Portada de saas-erp-pe, donde está ✅ confirmada en vivo contra `e-beta.sunat.gob.pe`. Acá: flujo completo verificado end-to-end con `SUNAT_PROVIDER=fake` (boleta `B001-4` → `VOID`, nota `BC01-1` emitida corrigiéndola) y XML validado estructuralmente contra 10 checks (raíz `CreditNote`, `DiscrepancyResponse`, `CreditedQuantity`, encoding UTF-8, sin `InvoiceTypeCode`, IGV 149.90 = 127.03 + 22.87). **Pendiente: enviarla a BETA real con las credenciales de este negocio** |
| Series independientes por tipo de documento corregido | ✅ | `BC01` sobre boleta, `FC01` sobre factura. `InvoiceCounter` pasó a clave compuesta `(type, series)`; migración rellena `B001`/`F001` en las filas existentes antes de volver `series` obligatoria — verificado sobre la base de desarrollo, que ya tenía contadores en 3 y 5 |
| Anulación del comprobante corregido (`VOID`) | ✅ | Solo con motivos de anulación total (01/02/06) y reembolso total. Antes `VOID` era un valor huérfano del enum sin ningún flujo que lo produjera |
| Una nota por reembolso (idempotencia) | ✅ | Un doble click no puede quemar dos correlativos contra el mismo hecho |
| UI admin: `RefundSection` en el detalle de pedido | ✅ | Total o por ítem, motivo del catálogo 09 servido por el backend, toggles de reponer stock y reembolso manual, y botón de emitir nota de crédito por reembolso. `tsc` + `next lint` + `next build` en verde. **No verificado en navegador** — sin herramienta de browser en esta sesión |

## Sprint 6 — Envío con tarifa plana

Hasta acá el sistema no cobraba envío en ningún punto: `totalAmount` era exactamente la suma de los ítems.

| Ítem | Estado | Notas |
|---|---|---|
| Tarifa plana por zona (Lima S/ 15, provincia S/ 25) | ✅ | Verificado en vivo, incluido el caso sutil: `Lima/Huaura` → S/ 25 (es departamento Lima pero no Lima Metropolitana), `Callao` → S/ 15 |
| Destino estructurado (departamento/provincia/distrito) | ✅ | Departamento validado contra la lista real de 25 + Callao; un valor libre haría que cualquier typo cayera en PROVINCIA y cobrara S/ 25 de más |
| Flete calculado en el servidor y congelado en la orden | ✅ | Dentro de la misma transacción que reserva stock. El cliente nunca envía el monto |
| `GET /api/orders/shipping/quote` y `/departments` | ✅ | Alimentan el checkout; la tarifa definitiva la recalcula el servidor al crear la orden |
| Checkout: selector de destino y desglose productos/envío/total | ✅ | `tsc` + `next lint` + `next build` en verde. **No verificado en navegador** |
| **El monto cobrado a la pasarela sale del servidor** | ✅ | Antes `window.Culqi.settings({ amount })` lo calculaba el navegador sumando el carrito. Con flete eso habría cobrado de menos en cada pedido — el navegador no conoce la tarifa |
| Línea de envío en boleta/factura | ✅ | Obligatoria: SUNAT valida que las líneas sustenten los totales. Verificado que el XML cuadra (139.74 + 25.16 = 164.90) |
| Devolución del flete según culpa | ✅ | Verificado en vivo los tres casos: arrepentimiento en Lima (devuelve 149.90, retiene 15), falla del negocio (devuelve 164.90), arrepentimiento en provincia (devuelve 149.90, retiene 25). En los tres la orden cierra en `REFUNDED` |
| **Bug real encontrado y corregido en el camino** — órdenes que no podían cerrarse | ✅ (corregido) | `isFull` era solo "no queda dinero por devolver". Con flete retenido, una devolución por arrepentimiento nunca agotaba el saldo aunque volviera todo el producto: la orden se quedaba para siempre en `PAID` con un residuo del tamaño exacto del envío. Ahora también cierra por `allUnitsRefundedAfter` |
| **Segundo bug encontrado probando** — `includesShipping` mentía | ✅ (corregido) | Al atarlo a `isFull`, un reembolso que retenía el flete lo marcaba como devuelto. Habría roto el saldo de un reembolso posterior y las líneas de la nota de crédito. Ahora describe el monto, no el cierre |
| Línea de envío en la nota de crédito | ✅ | Solo cuando el reembolso incluyó el flete — las líneas deben sumar exactamente lo devuelto. Verificado: nota `BC01-2` por S/ 164.90 con sus dos líneas |

## Sprint 7 — Catálogo: baja lógica, variantes, categorías, imágenes

| Ítem | Estado | Notas |
|---|---|---|
| Baja lógica de producto y de variante (`isActive`) | ✅ | Dos niveles, para descontinuar un color sin bajar el producto. Verificado en vivo: desactivado → ficha pública 404, fuera del catálogo público, visible para el ADMIN; reactivar lo devuelve |
| Borrado real solo sin ventas | ✅ | Verificado: producto con 32 unidades vendidas y variante con 16 devuelven 409 explicando por qué y qué hacer. Con ventas, borrar rompería la trazabilidad de órdenes y comprobantes SUNAT ya emitidos |
| No se puede comprar una variante inactiva | ✅ | Verificado en vivo (409 en el checkout). Se comprueba dentro de la transacción con la fila bloqueada, no en una validación previa |
| El filtro `onlyActive` lo decide el rol, no el llamador | ✅ | Ningún query param puede destapar el catálogo oculto |
| Sitemap sin productos desactivados | ✅ | Sale solo: la llamada del sitemap es anónima, así que la API ya devuelve solo activos. Anotado en `app/sitemap.ts` para que nadie le agregue una cookie de admin |
| **Bug encontrado probando** — `isActive` no se guardaba | ✅ (corregido) | El `PATCH` respondía 200 con el valor viejo: `updateProduct`/`updateVariant` construyen el `data` campo por campo y `isActive` no estaba en la lista. Silencioso — sin probarlo en vivo habría pasado por bueno |
| Alta y baja de variantes en un producto existente | ✅ | Hasta acá solo se podían crear todas juntas al crear el producto |
| CRUD de categorías + página admin | ✅ | Verificado: borrar una con productos devuelve 409 con el conteo; crear/renombrar/borrar una vacía funciona; el slug queda intacto al renombrar |
| Subida de imágenes a Cloudinary | ⚠️ | Firma verificada contra el esquema documentado (SHA-1 de params ordenados + secret), `folder` fijado por el servidor, el `api_secret` no viaja al cliente. **No probado contra una cuenta real de Cloudinary** — faltan credenciales. Sin ellas el endpoint responde 409 explicando qué falta y el panel sigue aceptando URLs pegadas a mano |

## Sprint 8 — Suite de tests

Hasta acá todo lo marcado ✅ se había verificado a mano, en vivo, una vez. Nada se re-ejecutaba solo: el test de concurrencia del stock hold, que es la invariante más delicada del sistema, existía como una anécdota en este documento y no como código.

Runner: `bun test`, que viene con el runtime que el proyecto ya usa — cero dependencias nuevas más allá de `@types/bun` para tipar.

| Ítem | Estado | Notas |
|---|---|---|
| **Concurrencia del stock hold** | ✅ | 10 checkouts simultáneos sobre `stock=1` → exactamente 1 gana, 9 con `InsufficientStockError`. Contra Postgres real: los locks `FOR UPDATE` no tienen equivalente simulable. Más el carrito todo-o-nada, `disponible = stock - reservado`, el precio congelado y la variante desactivada |
| Idempotencia de `markPaid`/`releaseHold` | ✅ | 5 confirmaciones simultáneas descuentan una sola vez; `markPaid` vs `releaseHold` en carrera deja exactamente un ganador y el stock coherente con quien ganó |
| Transiciones de orden | ✅ | La cadena avanza en orden, rechaza saltos, y ninguno de los cuatro estados gestionados por el sistema es alcanzable por la ruta manual. Un test deriva la tabla y comprueba que cada destino tenga un único origen — que es lo que permite el `UPDATE` condicional atómico |
| Desglose de IGV y XML SUNAT | ✅ | El IGV se suma **por línea**, no sobre el gran total (un test fija ese criterio para que nadie lo "corrija"). Regresiones de los dos bugs reales del Sprint 4: encoding UTF-8 y `AddressTypeCode`. Nota de crédito: `CreditNote`/`CreditedQuantity`, `DiscrepancyResponse`, sin `InvoiceTypeCode`, tildes preservadas |
| Sanitización pública | ✅ | Comprueba el **JSON serializado**, no la forma del tipo — que es exactamente cómo se escapó el bug del Sprint 1, donde un spread parecía excluir un campo y en runtime lo dejaba pasar. Cubre `costPrice`, stock exacto, payload de la pasarela y `createdById` |
| Reembolsos | ✅ | Guardas de monto y de unidades, motivo fuera de catálogo, orden ya reembolsada, reposición opcional de stock, reembolso manual, y el evento `order.refunded`. Dos reembolsos concurrentes de S/ 150 sobre una orden de S/ 215: solo uno pasa |
| Regresiones de los bugs del Sprint 6 | ✅ | Que devolver todas las unidades cierre la orden aunque el flete se retenga, y que `includesShipping` describa el monto y no el cierre |
| Regresión del bug del Sprint 7 | ✅ | Que `isActive` se persista de verdad y no solo se responda |
| Baja lógica y categorías | ✅ | Producto/variante vendidos no se borran; sin ventas sí, con cascade; desactivar los saca del catálogo público pero no del admin; categoría con productos bloqueada; renombrar no toca el slug |
| CI | ✅ | Dos jobs: el existente suma `typecheck:test` y los unitarios; uno nuevo levanta un servicio Postgres, aplica **la misma cadena de migraciones que producción sobre una base limpia** (si una migración no aplica desde cero, se detecta antes del deploy) y corre los de integración |
| **Hallazgo al escribir los tests** | ✅ | Un caso decía comprobar la guarda de unidades pero con precios normales la guarda de **monto** saltaba antes, así que nunca probaba lo que su nombre prometía. Corregido con un precio bajo, y el caso original se conservó aparte documentando que ambas guardas protegen |

**Cobertura: 94 tests** (51 unitarios sin base de datos, 43 de integración). Los de integración usan una base `flashkings_test` separada y se saltan solos si no la encuentran, así que `bun test` funciona sin Postgres levantado.

```bash
bun run test              # unitarios, sin base de datos
bun run test:integration  # necesita Postgres (ver tests/integration/setup.ts)
bun run test:all
```

## Pendientes explícitos (requieren acción humana, no bloquean el resto)

1. **Culqi**: crear cuenta sandbox, obtener `CULQI_PUBLIC_KEY`/`CULQI_SECRET_KEY`, habilitar Yape/Plin, confirmar el esquema real de firma de webhook y registrar la URL del webhook (necesita túnel tipo ngrok en local).
2. **Resend**: crear cuenta, obtener `RESEND_API_KEY`, verificar el dominio de envío (`pedidos@flashkings.pe`), cambiar `EMAIL_PROVIDER=resend`.
3. **Infraestructura de producción**: Postgres gestionado (Supabase/Neon/Render), Redis gestionado (Redis Cloud/Upstash), conectar el repo a Railway o Render.
4. **Dominio**: una vez `flashkings.pe` apunte a producción, actualizar `COOKIE_DOMAIN` y `CORS_ORIGIN`.
5. **SUNAT**: certificado digital acreditado real (ver Sprint 4 arriba) + RUC/razón social/dirección/usuario SOL reales en `.env`, cambiar `SUNAT_PROVIDER=sunat` y `SUNAT_ENVIRONMENT=PRODUCCION` recién después de validar en BETA con esos datos reales.
6. **Culqi (reembolsos)**: al conectar las credenciales, probar `refundCharge` contra el sandbox — total y parcial — y ajustar el campo de motivo si el catálogo real difiere.
7. **SUNAT (notas de crédito)**: emitir una nota de crédito real contra `e-beta.sunat.gob.pe` con las credenciales de homologación, igual que se hizo con Boleta y Factura en el Sprint 4.
8. **Cloudinary**: crear cuenta gratuita, poner `CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET` y probar una subida real desde el panel.
9. **Guías de remisión electrónica** — pendiente, no construido (ver Sprint 4 arriba). Si en algún momento se decide construirlo: primero tramitar `client_id`/`client_secret` de la API GRE en SOL (menú aparte del usuario/clave SOL de facturación — [Manual_Servicios_GRE.pdf](https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_Servicios_GRE.pdf) de SUNAT), recién ahí tiene sentido portar el código de referencia desde `saas-erp-pe`.

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

## Tests

```bash
bun run test              # unitarios — no necesitan base de datos
bun run test:integration  # necesitan Postgres
bun run test:all
```

La suite de integración usa una base **separada** de la de desarrollo, porque trunca tablas entre casos. Se crea una sola vez:

```bash
docker exec flashkings-postgres psql -U postgres -c "CREATE DATABASE flashkings_test"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flashkings_test?schema=public" bunx prisma migrate deploy
```

Si esa base no existe, los tests de integración se saltan solos en vez de fallar.

Credenciales de prueba tras el seed: `admin@flashkings.pe` / `Admin123!`.
