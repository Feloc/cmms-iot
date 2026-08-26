# Fase 3 — Ejecución interna de ensamble

## Objetivo

Controlar la construcción de cada unidad fabricada desde la liberación de su kit hasta que termina el ensamble interno y queda disponible para el futuro proceso FAT.

La unidad de control es una ejecución asociada de forma única a un kit liberado. De esta manera, una orden con varias máquinas conserva trazabilidad independiente por número de unidad.

## Inicio de la ejecución

- Solo un administrador puede crearla.
- El kit debe estar en estado `RELEASED`.
- Se selecciona una plantilla de montaje activa y con operaciones.
- La cabecera y todas las operaciones se copian como una fotografía: código, nombre y versión de plantilla; fases, instrucciones, duraciones, dependencias y requisitos de evidencia.
- Los cambios posteriores en la plantilla no modifican una ejecución existente.
- Un kit solo puede tener una ejecución de ensamble.

## Operaciones

Estados disponibles:

- `PENDING`: aún no iniciada.
- `IN_PROGRESS`: trabajo activo.
- `PAUSED`: pausa operativa.
- `BLOCKED`: existe un impedimento documentado.
- `COMPLETED`: operación terminada.
- `NOT_APPLICABLE`: operación opcional omitida por un administrador.

Las posiciones indicadas en `dependsOnPositions` deben estar completadas o marcadas como no aplicables antes de iniciar, reanudar o completar la operación dependiente. Cada cambio usa control de versión optimista para evitar sobrescrituras concurrentes.

Una operación puede asignarse a un técnico, pero la asignación solo puede cambiarla un administrador. Los técnicos solo ven y ejecutan órdenes en las que son responsables o miembros.

## Tiempo, evidencia y bloqueos

- Una operación en proceso admite un único cronómetro abierto.
- El registro guarda usuario, inicio, fin y notas; la duración real se calcula a partir de los registros.
- Solo quien abrió el cronómetro o un administrador puede detenerlo.
- Una operación no puede completarse con un cronómetro abierto.
- Si la plantilla exige evidencia, debe existir al menos una referencia antes del cierre.
- En este incremento la evidencia almacena título, referencia, URL o nota. El almacenamiento binario de archivos queda fuera del alcance.
- Todo bloqueo exige un motivo y queda registrado en auditoría.

## Consumo de materiales

El consumo se registra contra una línea del kit de la misma unidad y nunca puede superar su cantidad asignada.

Este movimiento es lógico: el inventario físico ya se descontó cuando la reserva de stock fue emitida. Registrar el consumo en ensamble no genera una segunda salida de almacén; proporciona trazabilidad de qué operación instaló cada material, en qué cantidad y por quién.

## Cierre y protecciones

La ejecución cambia automáticamente a `COMPLETED` cuando todas sus operaciones obligatorias están completadas. El progreso, tiempo real, operaciones cerradas y bloqueos se resumen en la cabecera.

Para preservar trazabilidad:

- no se puede cancelar un kit con una ejecución creada;
- no se puede generar una nueva liberación de ingeniería después de iniciar este proceso;
- no se puede cancelar la orden ni una de sus unidades cuando existe una ejecución de ensamble.

Todas las acciones relevantes generan eventos de auditoría vinculados a la orden de manufactura.

## Interfaz y API implementadas

La pestaña **Ensamble** de la orden permite crear ejecuciones para kits liberados, revisar el avance por unidad, asignar técnicos, operar estados, registrar tiempo, evidencias y consumos, y consultar sus historiales.

La API expone consultas por orden y comandos independientes para creación, actualización de operación, transiciones, cronómetros, evidencias y consumos.

## Validación

La prueba integral cubre:

1. creación desde plantilla y congelación de tres operaciones;
2. rechazo al incumplir una dependencia;
3. inicio y detención de tiempo;
4. consumo válido y rechazo al superar lo asignado;
5. evidencia obligatoria;
6. bloqueo y reanudación;
7. cierre automático al terminar las operaciones obligatorias;
8. limpieza completa de los datos temporales.

## Fuera de alcance y siguiente incremento

No se incluyen todavía carga binaria de fotografías/documentos, programación fina de capacidad, retrabajos, ni protocolo FAT.

El siguiente incremento recomendado es **FAT por unidad**: planes y casos de prueba versionados, mediciones y criterios de aceptación, desviaciones/retrabajos, evidencias, firmas de aprobación y una compuerta que impida despacho hasta aprobar el protocolo.
