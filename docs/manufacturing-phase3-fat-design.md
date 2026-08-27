# Fase 3 — FAT por unidad y preparación para despacho

## Objetivo

Controlar las pruebas de aceptación en fábrica de cada máquina terminada, conservar resultados y desviaciones, obtener una aprobación firmada y exponer una única compuerta de preparación para despacho.

El FAT pertenece a una unidad fabricada y referencia el ensamble que le dio origen. Una unidad solo puede iniciar FAT cuando su ejecución de ensamble está completada.

## Protocolos versionados

Los protocolos son plantillas reutilizables con código, nombre, versión y casos ordenados. Crear nuevamente un código existente genera automáticamente una versión superior.

Cada caso define:

- sección, nombre, instrucciones y criterio de aceptación;
- tipo de resultado: conforme/no conforme, medición numérica o texto;
- límites mínimo y máximo para mediciones;
- unidad de medida;
- obligatoriedad;
- requisito de evidencia.

Al crear una ejecución se congela el contenido del protocolo. Los cambios futuros no alteran pruebas ya iniciadas.

## Intentos FAT

Estados:

- `DRAFT`: preparado, todavía no iniciado;
- `IN_PROGRESS`: disponible para registrar resultados;
- `AWAITING_APPROVAL`: completo y bloqueado para revisión;
- `APPROVED`: firmado y habilitado para despacho;
- `REJECTED`: rechazado; permite crear un nuevo intento;
- `CANCELED`: reservado para una futura cancelación controlada.

Solo puede existir un intento activo por unidad. Una aprobación impide crear intentos adicionales; un rechazo permite iniciar el siguiente número de intento.

## Resultados y evaluación

- Los casos booleanos registran `PASS`, `FAIL` o `NOT_APPLICABLE` cuando son opcionales.
- Los casos numéricos se evalúan en el servidor contra los límites congelados; la interfaz no decide la conformidad.
- Los casos de texto exigen un valor observado, salvo que un caso opcional se marque como no aplicable.
- Todo resultado no conforme requiere una observación y abre automáticamente una desviación.
- Un caso que exige evidencia no puede enviarse a aprobación hasta tener al menos una referencia, URL o nota.

## Desviaciones y retrabajo

Estados:

- `OPEN`: no conformidad detectada;
- `IN_REWORK`: acción correctiva en ejecución;
- `RESOLVED`: retrabajo terminado, pendiente de una nueva prueba conforme;
- `ACCEPTED_AS_IS`: concesión formal que permite conservar el resultado no conforme.

Iniciar retrabajo exige describir la acción correctiva. Resolver exige notas de resolución. Solo un administrador puede aceptar una desviación por concesión.

Un caso no puede cambiar a conforme mientras conserve desviaciones abiertas o en retrabajo.

## Envío, firma y aprobación

Para enviar el FAT a aprobación se exige:

1. resultado en todos los casos;
2. ejecución de todos los casos obligatorios;
3. evidencia en los casos que la requieren;
4. ausencia de desviaciones abiertas o en retrabajo;
5. repetición conforme de cada caso fallido, salvo concesión administrativa.

Solo un administrador puede firmar la decisión. La firma conserva usuario, nombre, rol, fecha, decisión y comentarios. Un rechazo exige una justificación y cierra el intento.

## Compuerta de despacho

La consulta `GET /manufacturing/units/:unitId/dispatch-readiness` es la fuente de verdad para el futuro módulo de despacho.

La respuesta solo indica `ready: true` cuando:

- el ensamble está completado;
- existe un intento FAT;
- el intento FAT más reciente está aprobado.

Cuando la compuerta está cerrada devuelve motivos estructurados como `ASSEMBLY_NOT_COMPLETED`, `FAT_NOT_CREATED` o `FAT_AWAITING_APPROVAL`.

## Interfaz implementada

La pestaña **FAT** de la orden permite:

- crear protocolos y sus casos;
- iniciar un FAT para cada unidad elegible;
- registrar mediciones, resultados y evidencias;
- gestionar retrabajos y concesiones;
- enviar a aprobación;
- aprobar o rechazar con firma;
- identificar visualmente las unidades listas para despacho.

## Validación integral

La prueba automatizada recorre abastecimiento, kitting, ensamble y dos intentos FAT. Verifica rechazo por ensamble incompleto, evaluación numérica, desviación automática, retrabajo, reprueba, evidencia obligatoria, concesión, rechazo firmado, segundo intento aprobado y apertura final de la compuerta de despacho.

## Siguiente incremento

El siguiente incremento recomendable es **despacho y logística de salida**: orden de despacho por unidad, checklist de embalaje, documentos de transporte, seriales, responsable, fecha y destino; deberá consultar obligatoriamente la compuerta FAT antes de autorizar la salida.
