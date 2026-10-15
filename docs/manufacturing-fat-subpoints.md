# Subpuntos de verificación FAT

Se incorpora un nivel de subpuntos dentro de cada punto FAT. Un subpunto representa una revisión; una novedad representa un hallazgo. Los puntos y subpuntos pueden tener varias novedades independientes y evidencias generales propias (texto, enlaces, imágenes y videos).

## Uso

- **Crear protocolo FAT → punto → Agregar subpunto al protocolo**: define nombre, criterio de aceptación, instrucciones, resultado booleano/numérico/textual, límites/unidad, obligatoriedad y exigencia de evidencia. Antes de guardar puedes editar o quitar subpuntos del borrador.
- **Ejecución FAT → punto → Agregar subpunto durante la prueba**: requiere un motivo y acceso operativo. Se registra autor/fecha. Solo afecta esta ejecución, nunca el protocolo original ni otra unidad o FAT.
- Despliega cada subpunto para evaluar, adjuntar archivos o registrar novedades. La numeración visual es `punto.subpunto`; no se renumeran anulaciones. Se muestra procedencia: protocolo o agregado durante la prueba.
- **Anular subpunto con justificación**: solo ADMIN durante `IN_PROGRESS`, con motivo de al menos 10 caracteres. Se conserva criterio, resultado, evidencias, novedades e historial. Primero se deben cerrar todas sus novedades, incluidas observaciones. No se permite usar la anulación para ocultar pendientes. No hay eliminación ni reactivación; si hace falta una revisión nueva se agrega otro subpunto.

Se admiten 50 subpuntos por punto (incluyendo anulados) y 1000 puntos/subpuntos por ejecución. Solo hay un nivel; un subpunto no admite hijos. No se habilitan cambios de criterio ni de obligatoriedad después de crear la ejecución.

## Reglas de evaluación

1. Un subpunto obligatorio pendiente impide declarar conforme/no aplicable el punto y enviar/aprobar el FAT.
2. Un subpunto opcional sin ejecutar no bloquea ni resta progreso obligatorio. Si se ejecuta y falla, su no conformidad bloquea igualmente. El no aplicable está permitido solo en verificaciones opcionales, también numéricas.
3. Para dar conformidad al punto, sus subpuntos evaluados deben cumplir su exigencia de evidencia y no tener no conformidades abiertas. Las evidencias de novedades no sustituyen las del subpunto, ni las del subpunto sustituyen las del punto principal.
4. Se conserva la concesión vigente para no conformidades no críticas: un subpunto fallido solo es aceptable si todas sus no conformidades están aceptadas por concesión. Las demás reglas de corrección/verificación no cambian.
5. Agregar un subpunto obligatorio devuelve el punto a pendiente. Registrar/repetir el resultado de un subpunto, crear/reabrir una no conformidad o anular un subpunto también exige reevaluación del punto. Completar los subpuntos **nunca** aprueba automáticamente el punto principal.
6. Se conservan en el historial el resultado, medición, observaciones, evaluador y fecha anteriores al invalidar el punto. La evaluación vigente pasa a pendiente y limpia su medición, valor observado y firma de prueba; las notas se mantienen para referencia.
7. Agregar un subpunto opcional pendiente o una observación no invalida por sí solo un punto conforme.
8. Fuera de `IN_PROGRESS` no se agrega ni anula estructura. Se mantienen los bloqueos de orden pausada/cancelada/completada y el seguimiento posterior ya existente para observaciones de FAT aprobado. Un subpunto anulado queda de solo lectura.

El avance cuenta los puntos principales y verificaciones activas requeridas o ya ejecutadas; no cuenta anulaciones ni opcionales todavía pendientes. Los contadores de casos incluyen subpuntos activos, y la respuesta distingue `rootCaseCount`, `subpointCount` y `voidedCount`.

## Implementación y compatibilidad

La migración aditiva `59_manufacturing_fat_subpoints.sql` agrega definiciones de subpuntos al caso del protocolo y la relación `parentCaseId` a los casos ejecutados. Se reutiliza `ManufacturingFatCase` para evitar duplicar lógica de resultados, archivos, novedades y permisos. La API devuelve los casos planos con `parentCaseId`; la interfaz los agrupa.

Las definiciones del protocolo se almacenan en un arreglo JSON validado de un solo nivel. Al crear un FAT se copian a registros independientes e inmutables de ejecución. `templateCaseId` en un subpunto predefinido refiere al punto del protocolo que contiene su definición; `parentCaseId` refiere al punto de la ejecución. Los agregados durante la prueba no tienen `templateCaseId`.

La FK compuesta de padre verifica tenant y ejecución; un trigger impide niveles adicionales. Las escrituras bloquean primero la ejecución FAT, luego el caso, igual que el flujo existente. Las versiones de caso, padre, ejecución y orden se actualizan según la operación. Envío y aprobación revisan todos los casos/subpuntos, no solo los puntos principales.

- `POST /manufacturing/fat-cases/:caseId/subpoints`: `lockVersion` del padre, `reason` y definición del subpunto.
- `POST /manufacturing/fat-cases/:caseId/void`: `lockVersion` del subpunto y `reason`.
- Resultados, evidencias multimedia/texto y novedades usan las rutas FAT existentes con el ID del subpunto.
- La creación de protocolo admite `cases[].subpoints[]`.
- La lista incluye historial de cada punto/subpunto, procedencia y datos de anulación.

Los protocolos y ejecuciones existentes conservan su comportamiento sin subpuntos. Excel/CSV admite ahora jerarquía de un nivel mediante la columna opcional `punto_padre`; ver [importación FAT](manufacturing-fat-import.md). La incorporación de hallazgos al próximo protocolo sigue siendo explícita, no automática. SAT y montaje no reciben nuevas estructuras; el despacho sigue requiriendo FAT aprobado.

## Verificación y despliegue

Ejecutar `npm run test:manufacturing`, `npm run test:manufacturing:integration` y `npm run build` en API; `npx tsc --noEmit --incremental false` en web. Las pruebas incluyen instantáneas de protocolo, bloqueo de conformidad, evidencia propia, concesión/reapertura, anulación sin pérdida de historial, permisos, versiones obsoletas, límites de profundidad y FK entre ejecuciones. El ciclo completo llega hasta despacho/montaje/SAT/entrega final con rollback.

La migración 59 se aplicó localmente tras respaldo `/tmp/cmms-fat-subpoints.EpMKjn/before.dump` en el contenedor DB; su catálogo se comprobó, no se ensayó restauración. Es temporal, no un respaldo externo. Regenerar Prisma y cargar el código actualizado; no usar `db push`. Las pruebas automatizadas no equivalen a una revisión visual del navegador ni a una prueba de concurrencia con conexiones independientes.
