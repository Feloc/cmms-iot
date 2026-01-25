# Scripts de operación (Producción)

Coloca estos scripts en la raíz del repo (misma carpeta de `docker-compose.prod.yml`).

## 1) Dar permisos
```bash
chmod +x start-prod.sh stop-prod.sh restart-prod.sh status-prod.sh logs-prod.sh rebuild-prod.sh
```

## 2) Uso
- Iniciar todo:
```bash
./start-prod.sh
```

- Parar todo:
```bash
./stop-prod.sh
```

- Ver estado:
```bash
./status-prod.sh
```

- Ver logs:
```bash
./logs-prod.sh
./logs-prod.sh api
./logs-prod.sh web
```

- Rebuild + redeploy:
```bash
./rebuild-prod.sh
./rebuild-prod.sh api
./rebuild-prod.sh web
```
