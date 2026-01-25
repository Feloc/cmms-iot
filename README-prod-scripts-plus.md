# Scripts de operación (Producción) — Plus

Coloca estos scripts en la **raíz del repo** (misma carpeta de `docker-compose.prod.yml`).

## 1) Instalar / permisos
```bash
chmod +x *.sh
```

## 2) Comandos rápidos
### Iniciar (simple)
```bash
./start-prod.sh
```

### Iniciar ordenado (recomendado)
```bash
./start-prod-ordered.sh
```

### Parar / Reiniciar
```bash
./stop-prod.sh
./restart-prod.sh
```

### Estado / Logs / Health
```bash
./status-prod.sh
./logs-prod.sh
./health-prod.sh
```

## 3) Backups antes de cambios
### Backup manual
```bash
./backup-db.sh
```

### Rebuild seguro (con backup previo)
```bash
./rebuild-prod-safe.sh
./rebuild-prod-safe.sh api
./rebuild-prod-safe.sh web
./rebuild-prod-safe.sh ingest
```

## Nota sobre MQTT (profile)
Si quieres que MQTT (mosquitto/ingest) arranque siempre sin poner `--profile mqtt`, agrega en:
`/srv/cmms-iot/env/.env.production`

```env
COMPOSE_PROFILES=mqtt
```
