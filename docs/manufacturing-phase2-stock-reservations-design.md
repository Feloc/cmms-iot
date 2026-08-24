# Manufactura — Fase 2, Incremento 2: reservas de inventario

## Estado de implementación

Implementado y validado el 23 de agosto de 2026. Incluye persistencia, API transaccional, interfaz, libro de movimientos, auditoría y prueba integral con base de datos.

## Objetivo

Convertir las necesidades `STOCK` de un plan activo en compromisos físicos por bodega, conservando trazabilidad entre BOM, orden de manufactura, ubicación y libro de movimientos.

## Modelo operativo

Cada reserva fija una necesidad, artículo y ubicación. Conserva cantidad reservada, entregada y liberada; la cantidad pendiente se calcula como:

`reservada - entregada - liberada`

Estados: `ACTIVE`, `PARTIAL`, `ISSUED` y `RELEASED`.

## Efecto en inventario

- Reservar incrementa `InventoryStock.stockReserved`; no modifica `stockOnHand`.
- Entregar decrementa simultáneamente `stockReserved` y `stockOnHand` y actualiza la cantidad cubierta de la necesidad.
- Liberar decrementa `stockReserved`; no modifica `stockOnHand`.
- Cada acción crea un `InventoryMovement` enlazado a la reserva: `RESERVATION`, `EXIT` o `RELEASE`.

## Reglas

- Solo administradores pueden operar reservas.
- Solo se reservan necesidades incluidas, con ruta `STOCK`, artículo vinculado y plan `ACTIVE`.
- La cantidad no puede superar ni la disponibilidad de la ubicación ni el faltante de la necesidad.
- Las filas de necesidad y ubicación se bloquean durante la transacción para evitar doble reserva concurrente.
- Una reserva no puede entregar o liberar más de su saldo pendiente.
- No se puede cambiar la ruta, excluir la necesidad, cancelar la orden o publicar otra liberación mientras existan reservas pendientes.
- Las cantidades cubiertas de necesidades `STOCK` avanzan con la entrega física, no con la cobertura teórica calculada al generar el plan.

## Exclusiones

- El consumo en una operación específica de ensamble se implementará junto con la ejecución de manufactura.
- No se crean solicitudes de compra, fabricación interna ni subcontratación en este incremento.
