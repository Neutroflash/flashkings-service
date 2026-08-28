# Modelo de Datos — Flashkings API

Fuente de verdad real: [`prisma/schema.prisma`](../prisma/schema.prisma). Este documento explica el *por qué* de cada relación y campo no obvio; para tipos/constraints exactos, revisa el schema.

## Diagrama de relaciones

```mermaid
erDiagram
  User ||--o{ Order : "coloca (opcional, guest checkout)"
  Category ||--o{ Product : contiene
  Product ||--o{ ProductVariant : tiene
  Product ||--o{ ProductImage : tiene
  ProductVariant ||--o{ OrderItem : "se vende como"
  Order ||--o{ OrderItem : contiene
  Order ||--o| Payment : tiene

  User {
    string id PK
    string email UK
    string passwordHash
    string name
    Role role "CLIENT | ADMIN"
  }
  Category {
    string id PK
    string name
    string slug UK
    string description
  }
  Product {
    string id PK
    string name
    string slug UK
    string brand
    string categoryId FK
    boolean isFeatured
  }
  ProductVariant {
    string id PK
    string productId FK
    string sku UK
    decimal price
    decimal costPrice "ADMIN-only"
    int stock "conteo fisico"
    int reservedStock "system-managed"
    json attributes "libre: switch, sensor, peso..."
  }
  ProductImage {
    string id PK
    string productId FK
    string url
    boolean isPrimary
  }
  Order {
    string id PK
    string userId FK "nullable"
    OrderStatus status
    decimal totalAmount
    string customerName
    string customerEmail
    string customerPhone
    string shippingAddress
    CancelReason cancelReason "nullable"
    string trackingNumber "nullable"
    string courier "nullable"
  }
  OrderItem {
    string id PK
    string orderId FK
    string productVariantId FK
    int quantity
    decimal price "congelado al momento de la compra"
  }
  Payment {
    string id PK
    string orderId FK UK
    string provider "culqi"
    string providerChargeId
    string status "vocabulario propio del gateway"
    json rawResponse "payload crudo, auditoria/reembolsos"
  }
```

## Por qué cada modelo se ve así

### `ProductVariant.stock` vs `reservedStock`
Son dos contadores separados a propósito. `stock` es el conteo físico que edita el ADMIN desde el panel de inventario. `reservedStock` es 100% gestionado por el sistema (nunca editable manualmente) — representa unidades comprometidas por órdenes en `PENDING_PAYMENT`. La disponibilidad real siempre es `stock - reservedStock`. Separarlos evita que una reserva temporal "desaparezca" stock físico antes de que el pago se confirme.

### `ProductVariant.attributes` como JSON libre
Las variantes (switch, color, sensor, peso, polling rate...) varían por categoría de producto y no tienen un esquema fijo conocido de antemano. Un `Json` evita una migración cada vez que se agrega un tipo de atributo nuevo. El costo es que no hay validación de esquema a nivel de base de datos — la validación vive en la capa de aplicación (zod, en los controladores).

### `Order` con campos de cliente denormalizados
`customerName`, `customerEmail`, `customerPhone`, `shippingAddress` viven directamente en `Order`, no en un modelo `Address`/`Customer` separado. Es intencional: el checkout es de invitado por defecto (`userId` opcional), así que no siempre hay un `User` al que colgarle esos datos, y una orden es un snapshot histórico — la dirección de envío de una orden de hace 3 meses no debe cambiar si el usuario actualiza su perfil después.

### `OrderItem.price` congelado
Nunca se relee `ProductVariant.price` después de creada la orden. Si el admin sube el precio de un producto, las órdenes ya creadas conservan el precio con el que se compró — es el comprobante legal de la transacción.

### `Payment` separado de `Order`
Tienen ciclos de vida distintos: `Order` es la máquina de estados propia del negocio (`PENDING_PAYMENT → PAID → IN_PREPARATION → ...`); `Payment` es el reflejo del ciclo de vida de la pasarela (reintentos, reembolsos futuros, el payload crudo para auditoría). Fusionarlos habría mezclado dos vocabularios de estado distintos en una sola tabla.

### `CancelReason` como enum separado de `OrderStatus`
Se evitó agregar un estado `EXPIRED` al lado de `CANCELLED` — desde la perspectiva de cualquier consumidor (dashboard admin, página de confirmación), "expiró el hold" y "se canceló por otra razón" son funcionalmente lo mismo (stock liberado, orden muerta). `CancelReason` conserva la distinción para humanos sin inflar la máquina de estados principal.

## Índices

| Modelo | Índice | Por qué |
|---|---|---|
| `Product` | `categoryId`, `isFeatured` | Filtros más comunes del catálogo público |
| `ProductVariant` | `productId` | Join constante al cargar un producto con sus variantes |
| `ProductImage` | `productId` | Ídem |
| `Order` | `status`, `userId` | El dashboard admin filtra por estado constantemente; `userId` para "mis pedidos" a futuro |
| `OrderItem` | `orderId`, `productVariantId` | Join en ambas direcciones (ver una orden, o ver en qué órdenes aparece una variante) |

## Migraciones aplicadas

1. `init` — modelos base de catálogo (`User`, `Category`, `Product`, `ProductVariant`, `ProductImage`).
2. `orders_payments` — `Order`, `OrderItem`, `Payment`, `reservedStock` en `ProductVariant`.
3. `order_shipping_tracking` — `trackingNumber`/`courier` en `Order`.
