# Telegram: mensajes privados

La sección **Telegram** del menú permite conectar una cuenta, activar/desactivar mensajes y avisos automáticos, y consultar los últimos 50 envíos. Los administradores pueden seleccionar hasta 100 usuarios de su empresa, escribir un mensaje con `{nombre}`, revisar cada vista previa y enviarlo. El historial confirma aceptación por Telegram, no lectura.

Se conserva el notificador existente del canal. Los mensajes privados utilizan el mismo bot y no necesitan `TELEGRAM_CHAT_ID`. Cada destinatario debe tener una cuenta del CMMS y vincularla: pertenecer al canal no basta. Esta versión no importa miembros del canal ni verifica pertenencia al canal; no incluye suscriptores externos ni recordatorios periódicos.

## Instalación local: long polling

No requiere publicar el CMMS ni abrir puertos. En el `.env` que carga la API:

```dotenv
TELEGRAM_RECEIVE_MODE=polling
TELEGRAM_BOT_TOKEN=<token del bot existente>
```

El receptor consulta `getMe` y obtiene automáticamente el nombre correcto del bot. En este modo no se necesitan `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` ni `CMMS_PUBLIC_URL`. Esta última es opcional para incluir enlaces a las OS: puede ser una dirección LAN, pero el destinatario solo podrá abrirla desde una red con acceso al CMMS.

Con la base local ya actualizada hasta la migración 53 y en ejecución:

```sh
docker compose run --rm --no-deps -e MIGRATION_START=54 migrate
docker compose up -d --no-deps --force-recreate api
```

La migración 54 crea `TelegramPollingState`. En producción el runner aplica las migraciones pendientes durante el despliegue y el build regenera Prisma. En desarrollo, el arranque de la API regenera Prisma. Después, abrir **Telegram → Conectar Telegram → Abrir el bot → Iniciar**. Puede tardar unos segundos en aparecer como disponible mientras el receptor valida el token.

Al arrancar, el receptor que obtiene el control elimina el webhook con `drop_pending_updates=false`: conserva los eventos pendientes. No registrar un webhook mientras esté activo polling. Cada bot admite un receptor; las réplicas que comparten esta base se coordinan mediante una reserva de 90 segundos. Un receptor en otro sistema/base provoca un error 409 y debe detenerse. No compartir este bot con otro consumidor de actualizaciones.

El último evento confirmado se guarda por bot en PostgreSQL, en la misma transacción que la vinculación o `/stop`. Un fallo revierte ambos y el evento se reintenta. Los eventos repetidos no se vuelven a aplicar. El receptor espera hasta 25 segundos por petición, limita las esperas de red, aplica pausas ante errores/429 y se detiene al cerrar la API. Una reserva expirada permite recuperarse tras una caída.

El servidor debe permanecer encendido y tener conexión a internet. Telegram conserva actualizaciones pendientes por un máximo de 24 horas; si la instalación estuvo apagada más tiempo, el usuario debe volver a generar un enlace e iniciar el bot. El envío de mensajes al canal y a usuarios conserva su configuración existente.

## Instalación con webhook HTTPS

Variables del contenedor API (no usar `NEXT_PUBLIC_*` para secretos):

```dotenv
TELEGRAM_RECEIVE_MODE=webhook
TELEGRAM_BOT_TOKEN=<token del bot existente>
TELEGRAM_BOT_USERNAME=<nombre del bot sin @>
TELEGRAM_WEBHOOK_SECRET=<secreto aleatorio de 32 a 256 caracteres>
CMMS_PUBLIC_URL=https://cmms.ejemplo.com
TELEGRAM_TIME_ZONE=America/Bogota
# Opcional: false detiene el procesamiento de la cola en esta instancia.
TELEGRAM_WORKER_ENABLED=true
# El canal sigue usando su configuración existente:
TELEGRAM_CHAT_ID=<id del canal>
```

Para crear el secreto: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

1. Desplegar API y web juntas. El entrypoint de producción aplica las migraciones 53 y 54 mediante el runner SQL existente; el build regenera Prisma. No usar `db push` en producción.
2. Comprobar que `CMMS_PUBLIC_URL` sea la URL pública HTTPS del frontend y que `API_INTERNAL_URL` en web apunte a la API. La ruta pública `/api/telegram/webhook` reenvía exclusivamente al webhook de la API, conservando el secreto de Telegram. La API verifica el secreto antes de procesar el cuerpo; el resto de rutas requiere autenticación.
3. Registrar el webhook **una vez que el despliegue sea accesible**, con las variables anteriores cargadas:

   ```sh
   docker compose -f docker-compose.prod.yml exec api node /app/apps/api/scripts/configure-telegram-webhook.cjs
   ```

   Telegram admite un webhook por bot: este registro reemplaza el anterior. La integración previa de este repositorio solo envía mensajes y no registra webhooks. Si el mismo bot se usa en otro sistema receptor, hay que coordinar su recepción antes de ejecutar el comando. No ejecutar un consumidor `getUpdates` simultáneamente.
4. Cada usuario abre **Telegram → Conectar Telegram → Abrir el bot → Iniciar**. El enlace caduca en 10 minutos, es de un solo uso y se almacena únicamente su hash. Generar otro enlace invalida el anterior. Una identidad de Telegram solo puede asociarse a un usuario por empresa. Si ya estaba vinculada a otro usuario, debe desconectarse allí primero.
5. Probar un envío manual y una asignación/reprogramación de OS con un destinatario vinculado. Consultar los estados en el historial.

El cambio de variables requiere recrear el contenedor API. Si se cambia de bot/token a una identidad de bot distinta, los usuarios deben volver a vincularse y deben cancelarse las entregas pendientes del bot anterior antes de habilitar el worker.

## Desarrollo con Docker Compose

El Compose de desarrollo regenera el cliente Prisma, pero las migraciones SQL se aplican explícitamente. `prisma generate` no crea tablas. Para una base existente que ya tiene las migraciones hasta la 52, con el servicio `db` en ejecución, aplicar las actualizaciones de Telegram (53 y posteriores):

```sh
docker compose run --rm --no-deps -e MIGRATION_START=53 migrate
```

Este servicio utiliza `DATABASE_URL` de `.env` y el mismo runner de producción. El alcance explícito `MIGRATION_START=53` corresponde a una base ya actualizada hasta la 52; registra el checksum y permite repetir el comando sin reaplicar la migración. `--no-deps` evita que Compose recree la base en ejecución. Es un servicio opcional, no arranca con `docker compose up`. Si cambias el modo o las variables, recrea únicamente la API con `--no-deps`; si solo faltaban tablas y el cliente Prisma ya estaba actualizado, no hace falta reiniciar.

No usar este alcance para inicializar una base vacía ni para omitir otras migraciones pendientes. El runner completo requiere un historial inicial verificado; las bases antiguas sin ese historial deben reconciliarlo antes de ejecutar todas las migraciones. No marcar migraciones antiguas como aplicadas sin verificarlas.

Si aparece `The table public.TelegramDelivery does not exist`, falta aplicar `53_telegram_personal_messages.sql` en la base a la que apunta la API. No se soluciona regenerando Prisma ni reiniciando el contenedor.

## Avisos y entrega

- Se encolan dentro de la transacción al asignar/reprogramar una OS desde `schedule`, cambiar su duración, añadir/reactivar técnicos desde el calendario o crear una OS correctiva con técnico. Una reprogramación avisa a todos los técnicos activos vinculados. Una operación sin cambios no crea otro aviso. Un aviso nuevo sustituye los avisos de programación todavía pendientes de esa OS para el mismo técnico. La eliminación de una asignación no envía detalles al antiguo técnico.
- Antes de enviar, se comprueban la empresa, la conexión y su fecha de vinculación, las preferencias y la asignación activa. Una nueva vinculación invalida las entregas dirigidas a la anterior.
- Desconectar, desactivar avisos o enviar `/stop` cancela los pendientes. `/stop` afecta a todas las cuentas conectadas al mismo chat con este bot. Un envío que ya esté en curso puede haber sido aceptado por Telegram.
- La cola persiste en PostgreSQL. Los workers usan un bloqueo breve para reclamar trabajos, leases de 60 segundos y un límite por chat. Hay hasta cinco intentos, espera exponencial y respeto de `retry_after` en errores 429. Bloqueos (403) desactivan la conexión; otros errores permanentes quedan como fallidos.
- Un identificador de solicitud evita duplicar envíos manuales al reintentar la misma petición. La Bot API no ofrece idempotencia para `sendMessage`: un corte después de aceptar Telegram el mensaje y antes de guardar la respuesta puede causar un duplicado al reintentar. No se promete entrega exactamente una vez.
- Los textos se envían sin interpretar HTML/Markdown. Los enlaces a la OS requieren iniciar sesión y conservan los permisos del CMMS. Los mensajes ya aceptados por Telegram no se retiran al cambiar permisos.

## Verificación

```sh
npm run test:telegram -w apps/api
npm run build -w apps/api
npx tsc -p apps/web/tsconfig.json --noEmit --incremental false
```

Para la prueba de integración, preparar PostgreSQL **aislado** con una base llamada `telegram_test` y el esquema del proyecto. Definir `TELEGRAM_TEST_DATABASE_URL` con esa base y ejecutar `npm run test:telegram:integration -w apps/api`. El script no usa `DATABASE_URL`, crea fixtures propios y simula todas las respuestas HTTP de Telegram. Valida consumo concurrente de tokens, caducidad, separación de empresas, rol administrador, deduplicación, leases, cambios de programación y rollback de la cola, cursor de polling, fallos entre procesamiento y confirmación, exclusión entre receptores y recuperación tras reinicio.

Referencias oficiales: [vinculación mediante enlaces](https://core.telegram.org/bots/features#deep-linking), [long polling](https://core.telegram.org/bots/api#getupdates), [webhook y secreto](https://core.telegram.org/bots/api#setwebhook), [límites de envío](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).
