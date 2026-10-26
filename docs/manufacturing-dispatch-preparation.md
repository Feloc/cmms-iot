# Preparación anticipada de despacho

Una orden activa puede preparar el expediente de sus unidades no canceladas sin tener una ejecución FAT, o mientras las pruebas están pendientes. Se mantienen los controles de logística, bultos, checklist y documentos para cerrar el embalaje.

Autorizar la salida exige que el FAT más reciente de la unidad esté aprobado y vincula esa ejecución al despacho. Confirmar la salida verifica nuevamente que siga siendo la misma ejecución aprobada. Si el FAT cambió, se debe cancelar y reabrir el expediente para autorizarlo otra vez; la reapertura conserva logística, checklist, bultos y documentos y elimina la autorización anterior.

La pantalla consulta el FAT más reciente para mostrar la disponibilidad, no la aprobación de una prueba antigua. Las restricciones de órdenes en pausa, canceladas o completadas son independientes del FAT.

## Despliegue

Aplicar `db/migrations/60_manufacturing_dispatch_early_preparation.sql`, regenerar Prisma y reconstruir/desplegar API y web. La migración permite nulos en el vínculo con FAT y conserva los registros existentes. No se ha aplicado a producción como parte de este cambio.

## Pruebas

Desde `apps/api`: `node --test -r ts-node/register/transpile-only test/manufacturing-dispatch-preparation.spec.ts`. Incluye preparación sin FAT, órdenes bloqueadas, cierre de embalaje, reapertura, vinculación al último FAT y comprobación de salida. El escenario de integración de abastecimiento también comprueba la creación anticipada (ejecutar con una base de pruebas migrada).
