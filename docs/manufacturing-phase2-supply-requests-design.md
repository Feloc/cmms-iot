# Manufactura — Fase 2, Incremento 3: solicitudes operativas

## Estado de implementación

Implementado y validado el 23 de agosto de 2026. Incluye persistencia, API transaccional, interfaz, entregas parciales, cancelación de saldos, auditoría y prueba integral con base de datos.

## Objetivo

Convertir las necesidades `BUY`, `MAKE` y `SUBCONTRACT` de un plan activo en documentos operativos trazables, con compromisos y entregas parciales.

## Documento unificado

`ManufacturingSupplyRequest` conserva la ruta de la necesidad y se presenta como:

- Solicitud de compra para `BUY`.
- Orden interna de fabricación para `MAKE`.
- Solicitud de subcontratación para `SUBCONTRACT`.

Una necesidad puede dividirse entre varias solicitudes. Cada una tiene código estable, cantidad, proveedor o responsable, referencia externa, fecha prometida, notas y control de versión.

Estados: `REQUESTED`, `IN_PROGRESS`, `PARTIAL`, `COMPLETED` y `CANCELED`.

## Entregas

Cada recepción o terminación crea un registro inmutable `ManufacturingSupplyDelivery`. La entrega incrementa la cantidad cubierta de la necesidad y completa automáticamente la solicitud y, cuando corresponde, el plan.

El saldo de una solicitud es:

`solicitado - entregado - cancelado`

Cancelar conserva las entregas previas y cancela solamente el saldo.

## Reglas

- Solo administradores gestionan solicitudes.
- Solo se crean desde necesidades incluidas, de un plan activo y con ruta distinta de `STOCK`.
- La suma comprometida no puede superar la cantidad requerida.
- Una entrega no puede superar el saldo de su solicitud.
- Las transacciones bloquean la necesidad o solicitud para evitar compromisos y entregas concurrentes duplicadas.
- No se cambia la ruta ni se excluye una necesidad con solicitudes abiertas.
- No se cancela la orden ni se publica una nueva liberación con solicitudes abiertas.
- Las solicitudes cerradas conservan la fotografía de la liberación por medio de la necesidad de origen.

## Exclusiones

- Cotizaciones comparativas, aprobación multinivel y emisión contable de órdenes de compra.
- Planeación detallada de operaciones, máquinas y capacidad para fabricación interna.
- Inspección de calidad de recepción y manejo de rechazos.
