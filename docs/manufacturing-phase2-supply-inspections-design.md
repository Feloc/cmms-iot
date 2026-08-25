# Manufactura — Fase 2, Incremento 4: recepción e inspección de calidad

## Estado de implementación

Implementado y validado el 24 de agosto de 2026. Incluye persistencia, API transaccional, interfaz, decisiones inmutables, cuarentena, auditoría y prueba integral con base de datos.

## Objetivo

Separar la recepción física de la liberación para ensamble. Una entrega solo cubre la necesidad después de que Calidad acepta la cantidad correspondiente.

## Lote de inspección

Cada `ManufacturingSupplyDelivery` conserva cuatro cantidades:

- Recibida.
- Aceptada.
- Rechazada.
- En cuarentena.

La porción aún no clasificada se calcula como `recibida - aceptada - rechazada - cuarentena`.

Estados: `PENDING`, `PARTIAL`, `QUARANTINED` y `CLOSED`.

## Decisiones

Las decisiones son eventos inmutables:

- `ACCEPT` y `REJECT` durante la inspección inicial.
- `QUARANTINE` cuando no existe todavía una decisión definitiva.
- `ACCEPT_FROM_QUARANTINE` y `REJECT_FROM_QUARANTINE` para cerrar la disposición.

Cada evento conserva cantidad, fecha, inspector, referencia y notas.

## Reglas

- Solo administradores registran decisiones de calidad.
- No se clasifica más que la cantidad pendiente del lote.
- No se dispone más que la cantidad actualmente en cuarentena.
- Solo la cantidad aceptada incrementa la cobertura de la necesidad.
- La cantidad rechazada libera compromiso para generar una solicitud de reemplazo.
- Cuarentenas e inspecciones pendientes bloquean el cambio de ruta, la cancelación de la orden y una nueva liberación de Ingeniería.
- Las transacciones bloquean el lote para impedir decisiones concurrentes duplicadas.
- Las entregas anteriores a este incremento se migran como aceptadas para conservar su semántica histórica.

## Exclusiones

- Planes de inspección configurables por artículo o proveedor.
- Adjuntos de certificados, fotografías e informes dimensionales.
- No conformidades, acciones correctivas y evaluación de proveedores.
- Ingreso automático de material aceptado al inventario general.
