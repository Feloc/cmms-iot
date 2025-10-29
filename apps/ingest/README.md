# CMMS Ingest Service (MQTT → Timescale + Reglas MVP)

## Resumen
- Suscribe a `tenants/+/devices/+/telemetry` y `.../state`.
- Inserta telemetría en `timeseries.telemetry`.
- Evalúa reglas (`Rule`) por tenant/asset/device/métrica y crea/actualiza `RuleState` y `AssetEvent`.

## Requisitos
- Timescale + scripts 001/002/003 aplicados (schema `timeseries`, cagg, roles).
- Tablas Prisma para `Device`, `Rule`, `RuleState`, `AssetEvent` ya creadas.
- Rol `cmms_ingest` con permisos INSERT en `timeseries.telemetry` y UPDATE en `Device`.

## Variables de entorno
Ver `.env.example`.

## Ejecutar en dev
```bash
cd apps/ingest
npm i
cp .env.example .env
npm run dev