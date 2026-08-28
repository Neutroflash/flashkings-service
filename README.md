# Flashkings API

Backend del e-commerce Flashkings (periféricos gaming, Perú). Node.js + Express + TypeScript en Clean Architecture, Prisma/PostgreSQL, Redis/BullMQ para reserva de stock, Culqi para pagos, Resend para email transaccional.

## Documentación

- [Reglas de negocio](./docs/BUSINESS_RULES.md)
- [Modelo de datos](./docs/DATA_MODEL.md) (con diagrama ER)
- [Estado de implementación](./docs/IMPLEMENTATION_STATUS.md) — qué está hecho, qué falta, cómo correrlo local

## Quick start

```bash
bun install
cp .env.example .env
bunx prisma migrate dev
bun run prisma:seed
bun run dev          # API en http://localhost:4000
bun run worker:dev   # worker de expiración de holds de stock
```

Requiere Postgres y Redis corriendo (ver comandos de Docker en [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md)).
