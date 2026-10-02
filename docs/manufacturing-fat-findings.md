# Varias novedades dentro de un punto FAT

En **Manufactura → orden → Pruebas FAT**, inicia la ejecución, despliega un punto y usa **Registrar novedad**. No hay que duplicar el punto ni cambiar el archivo Excel del protocolo.

Cada novedad tiene consecutivo dentro del FAT, título, descripción, componente/ubicación, clasificación, severidad, responsable, fecha compromiso, evidencias y un historial propio. Los responsables seleccionables son administradores del tenant y técnicos con función operativa en la orden; los observadores no pueden operar.

## Clasificación y cierre

- **No conformidad:** incumple el criterio de aceptación. Abrirla marca el punto como no conforme. Sus estados abierta, en corrección y pendiente de verificar bloquean conformidad, envío a aprobación y aprobación FAT.
- **Observación:** recomendación o aclaración que no incumple el criterio. No cambia el resultado ni bloquea la aprobación; solo admite severidad menor. No sirve para rebajar un incumplimiento existente: la clasificación no se modifica mediante seguimiento.
- Severidad de no conformidades: menor, mayor o crítica. Una crítica no admite concesión. ADMIN puede aceptar una no conformidad no crítica por concesión, documentando el motivo.

Recorrido normal:

`Abierta → En corrección → Pendiente de verificar → Cerrada y verificada`

1. Registrar acción correctiva e iniciar corrección.
2. Documentar el trabajo realizado y enviar a verificación. Se conserva quién presentó la corrección y cuándo.
3. ADMIN, el responsable de la orden o un técnico con función REVIEWER verifica: cierra o devuelve a corrección con observaciones.
4. El corrector no puede verificar su propio cierre sin una excepción explícita de al menos 20 caracteres, siguiendo la política existente de aprobación independiente. Se conserva la excepción en el historial.
5. Cerrar las novedades no cambia automáticamente el resultado del punto: el inspector debe registrar la reprueba. Una concesión aislada no cubre las otras novedades resueltas que siguen requiriendo reprueba.

Una novedad cerrada puede reabrirse mientras el FAT siga en ejecución; una no conformidad reabierta vuelve a marcar el punto no conforme. No se permite editar su corrección mientras está pendiente de verificar: primero debe devolverse a corrección.

## Evidencias y seguimiento posterior

Las evidencias de cada novedad se registran con título y referencia o enlace HTTP/HTTPS. Se reutiliza el sistema de evidencias FAT; no se añade carga binaria de fotografías en este incremento. Las evidencias de novedades se muestran separadas y **no sustituyen** la evidencia obligatoria del punto de prueba.

Las observaciones pendientes siguen visibles después de aprobar el FAT y pueden completarse/verificarse sin modificar sus resultados ni firmas, incluso si la orden ya está completada. No se pueden agregar nuevas novedades ni reabrir no conformidades en un FAT aprobado. Las órdenes canceladas o pausadas no admiten cambios de seguimiento. Durante la aprobación pendiente se congela el seguimiento hasta que se decida el FAT.

Los contadores distinguen pendientes y bloqueantes. El tablero operativo considera la verificación pendiente como bloqueo; las observaciones son advertencias de seguimiento y las fechas vencidas se señalan.

## Compatibilidad y API

La migración aditiva `56_manufacturing_fat_findings.sql` conserva las desviaciones anteriores como `NON_CONFORMITY`, severidad `MAJOR`, sin inventar responsables, fechas o verificadores históricos. Sus evidencias previas siguen siendo evidencias generales del punto. Se añade el estado `PENDING_VERIFICATION`, campos de seguimiento y un vínculo opcional de evidencia a novedad, con FK que verifica tenant y punto.

- `GET /manufacturing/orders/:orderId/fat-assignees`
- `POST /manufacturing/fat-cases/:caseId/deviations`, con `lockVersion` del punto y datos de la novedad.
- `PATCH /manufacturing/fat-deviations/:deviationId`, con `lockVersion` de la novedad, estado y seguimiento.
- `POST /manufacturing/fat-deviations/:deviationId/evidence`.

La lista FAT incluye evidencias e historial por novedad y permisos de operación/verificación. La escritura bloquea primero la ejecución FAT, después el punto; comparte el bloqueo con envío/aprobación y genera consecutivos bajo ese bloqueo. Las versiones del punto, novedad y ejecución se actualizan según la operación. Se vuelven a comprobar las condiciones al aprobar, no solo al enviar.

## Verificación y despliegue

Ejecutar desde API: `npm run test:manufacturing`, `npm run test:manufacturing:integration`, `npm run build`. Desde web: `npx tsc --noEmit --incremental false`.

La integración amplía la prueba de ciclo completo con varias novedades simultáneas, aislamiento por tenant, permisos de observador/revisor, versiones obsoletas, evidencias separadas, rechazo de concesión crítica, corrección/verificación independiente, devolución, reapertura, reprueba y seguimiento de observaciones después de aprobar. Todos los datos de prueba se revierten. No equivale a una prueba de carga con múltiples conexiones independientes ni a una inspección visual del navegador.

Aplicar 56 con el runner SQL y regenerar Prisma antes de cargar el código nuevo. No usar `db push`. En el entorno local se tomó respaldo previo en el contenedor PostgreSQL: `/tmp/cmms-fat-findings.bnIoji/before.dump`; se comprobó que su catálogo es legible, no se hizo una restauración de ensayo. Es un respaldo temporal, no externo. La migración no altera los protocolos Excel/CSV ni extiende este flujo al SAT.
