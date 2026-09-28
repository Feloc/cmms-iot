# Tareas

Módulo disponible en `/tasks`, con API autenticada en `/tasks`. La visibilidad pública se limita a la empresa del usuario. Ser administrador no otorga acceso a tareas privadas o selectivas ajenas.

## Funcionalidad

- Listado paginado con vistas asignadas, creadas, compartidas y todas las visibles; filtros por estado, prioridad, responsable, visibilidad, archivo, búsqueda y seguimiento.
- Indicadores sobre las tareas visibles y los filtros actuales: por terminar, vencidas, bloqueadas y sin avances durante 7 días.
- Creador administra la tarea; responsable ejecuta; colaboradores registran avances y evidencias; observadores consultan. El rol global VIEWER conserva solo lectura.
- Las privadas solo admiten al creador como responsable, o quedan sin asignar. Cambiar a selectiva es un cambio explícito antes de compartir.
- Un responsable es obligatorio al iniciar. Estados: pendiente, en ejecución, en pausa, completada y cancelada. Pausar, cancelar o reabrir requiere motivo. Reabrir reinicia el porcentaje y conserva la bitácora.
- Dependencias múltiples, sin ciclos, entre tareas de la misma empresa. Se agregan antes de iniciar; todas deben completarse antes de ejecutar. Cancelar una predecesora no satisface la dependencia. Las referencias restringidas no revelan título ni identificador de la tarea.
- No se permite reabrir una predecesora cuando una sucesora ya comenzó. Debe resolverse la dependencia primero; retirarla queda auditado.
- Avances inmutables con porcentaje total (0–99), descripción y minutos opcionales; completar lleva a 100. Una corrección se registra como nueva entrada con explicación, preservando las anteriores. Los comentarios no alteran porcentaje ni tiempo.
- Evidencias por tarea o entrada de seguimiento, hasta 30 MB por archivo, descargadas mediante una ruta que comprueba el permiso vigente. Revocar acceso también revoca futuras descargas.
- Referencias opcionales a activos, órdenes de trabajo/servicio y fabricación. Esas relaciones no conceden acceso a la tarea desde el otro módulo.
- Se archivan solo tareas completadas o canceladas. No hay borrado de tareas ni del historial.

## Integridad y privacidad

Cada lectura y escritura comprueba tenant y visibilidad. Las relaciones de tareas incluyen claves compuestas tenant/tarea. Los datos de empresa y autor salen de la sesión verificada, nunca del formulario. Las respuestas GET no se cachean. Los adjuntos se guardan en `ATTACHMENTS_DIR/tasks` y no forman parte del catálogo genérico de adjuntos, para impedir accesos por rutas heredadas.

Todas las mutaciones toman un bloqueo transaccional de PostgreSQL por empresa antes de consultar tareas y dependencias. Esto protege también los ciclos entre tareas distintas y la carrera entre iniciar una sucesora y reabrir una predecesora. La versión de cada tarea impide sobrescribir ediciones concurrentes. El bloqueo serializa escrituras del módulo por empresa; para volúmenes altos debe medirse antes de adoptar bloqueos de granularidad menor.

## Instalación

1. Generar Prisma con el esquema actualizado: `npx prisma generate --schema apps/api/prisma/schema.prisma` desde la raíz.
2. Aplicar `db/migrations/55_tasks.sql` mediante el runner SQL existente al desplegar. La migración es aditiva y transaccional; admite reintento. No usar `db push` sobre la base productiva.
3. Compilar y desplegar API y web siguiendo el flujo habitual del proyecto. Montar el almacenamiento persistente existente de adjuntos también cubre su subdirectorio `tasks`.

En desarrollo, `docker compose up` genera el cliente Prisma, pero **no aplica migraciones SQL**. Si la base ya está actualizada hasta la migración 54, aplicar exclusivamente la nueva migración con:

```sh
docker compose run --rm --no-deps -e MIGRATION_START=55 migrate
```

Este comando registra la migración y su checksum, y no recrea la base ni los servicios. Si la API ya tiene el módulo y el cliente Prisma actualizado, no requiere reinicio. El error `The table public.Task does not exist` indica que falta este paso. Para una base nueva se debe ejecutar el conjunto completo de migraciones mediante el runner, sin limitarlo a la 55.

## Verificación

Desde `apps/api`:

- `npm run test:tasks`: permisos, privacidad, ciclos, transiciones y validación de entradas.
- `TASKS_TEST_DATABASE=isolated ATTACHMENTS_DIR=/tmp/tasks-evidence DATABASE_URL=<base-temporal> npm run test:tasks:integration`: API HTTP real con JWT, PostgreSQL y archivos. Ejecutar únicamente en una base temporal con el esquema y la migración instalados. Crea y elimina empresas de prueba.

La integración cubre aislamiento entre empresas, ausencia de privilegio implícito de administradores, observadores y colaboradores, dependencias restringidas, revocación de descargas, bitácora, archivo y conflictos concurrentes.

Calendario, Kanban, notificaciones, recordatorios y recurrencia quedan para la segunda etapa descrita en la propuesta.
