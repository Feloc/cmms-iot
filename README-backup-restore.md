# Restore + Rotación de Backups (Producción)

Incluye:
- `restore-db.sh`: restaurar un backup `.sql.gz` (requiere `--force`)
- `rotate-backups.sh`: borrar backups viejos por días (DRY RUN por defecto)
- `cron-example.txt`: ejemplo de cron para rotación

## Restaurar (recomendado parar servicios)
```bash
cd /srv/cmms-iot/app/cmms-iot
./stop-prod.sh

./restore-db.sh /srv/cmms-iot/backups/cmms_db_YYYYMMDD_HHMMSS.sql.gz --force

./start-prod-ordered.sh
```

## Rotación
Dry run por defecto:
```bash
./rotate-backups.sh
```

Borrar de verdad y mantener 30 días:
```bash
KEEP_DAYS=30 DRY_RUN=0 ./rotate-backups.sh
```
