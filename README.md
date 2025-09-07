# CMMS-IoT (Multi-tenant) – Monorepo

Monorepo con **Next.js (TS + NextAuth)** y **NestJS (Prisma)** sobre **PostgreSQL + TimescaleDB** y **Mosquitto (MQTT)**.

## Stack
- **apps/web**: Next.js 14 + NextAuth (Credentials) + Axios.
- **apps/api**: NestJS + Prisma + JWT + MQTT ingest.
- **DB**: PostgreSQL (OLTP) y TimescaleDB (telemetría, hypertable `telemetry`).
- **Broker**: Eclipse Mosquitto.

## Multi-tenant
- Enfoque **por fila** (`tenantId`) en todos los modelos Prisma.
- **Enforcement** por app: AsyncLocalStorage + middleware de Prisma inyecta `tenantId` en queries.
- **Defensa** SQL: ejemplo de RLS (opcional) en `db/init/02_rls_examples.sql`.

## Estructura
- `apps/web` – Frontend Next.js (dashboard KPIs, auth, alertas recientes).
- `apps/api` – Backend NestJS (auth, assets, rules, telemetry, alerts, notices, work-orders, inventory, dashboard KPIs).
- `db/init` – SQL de TimescaleDB (extensión + hypertable) y RLS demo.
- `docker-compose.yml` – Orquestación de servicios.
- `.env.example` – Variables para API/Web/DB/MQTT/NextAuth.
- `scripts/db_fix_timescale.sh` – Script para arreglar PK/Hypertable si ya existe la tabla.

## Arranque rápido (dev)
```bash
docker compose up -d --build
# Migraciones + seed
docker compose exec api npx prisma migrate dev --name init
docker compose exec api npx ts-node prisma/seed.ts

# (Opcional) Publica lecturas de demo al broker
docker compose exec api node scripts/publish-demo.js
```

**Credenciales demo**
- Tenant: `acme`
- Usuario: `admin@acme.local`
- Password: `admin123`

**Endpoints**
- Web: http://localhost:3000
- API: http://localhost:3001

## Tópico MQTT (ingest)
`cmms/{tenant}/{assetCode}/{sensorType}` con payload JSON:
```json
{"ts":"2025-01-01T10:00:00Z","value": 42.3}
```

## KPIs
- Disponibilidad, MTBF, MTTR, Backlog, % Preventivo (cálculo simple en `/dashboard`).

## Notas
- Para producción: endurecer RLS, rotar secretos, pooling, colas, observabilidad.

### Si la DB ya existe y falla la hypertable
Usa `scripts/db_fix_timescale.sh` después de `docker compose up -d`.
