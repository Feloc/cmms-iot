# Manufactura de repuestos posventa

## Objetivo

El flujo permite convertir una necesidad de repuesto detectada en una orden de servicio (OS) en una demanda trazable y, cuando corresponde, en una orden de fabricación (OF) de tipo `SPARE_PART`. La recepción del producto terminado incrementa inventario y su instalación vuelve a quedar relacionada con la OS.

## Flujo operativo

1. En una OS se agrega como requerido un repuesto vinculado al catálogo de inventario.
2. Desde el repuesto se registra la demanda posventa, indicando causa, cobertura, ruta de suministro, cantidad y fecha requerida.
3. El sistema relaciona la demanda con el activo y, si existe, con la OF original del equipo entregado.
4. Para la ruta `MAKE`, un administrador genera la OF de repuesto desde la misma demanda. La OF conserva instantáneas del cliente, activo y artículo.
5. Manufactura ejecuta ensamble y control de calidad. No se permite recibir producto terminado hasta que todas las unidades activas tengan el ensamble completo y un FAT aprobado.
6. La recepción registra existencias en la ubicación elegida, crea un movimiento de inventario con origen `MANUFACTURING` y actualiza la cantidad abastecida de la demanda.
7. Cuando el técnico marca el repuesto como reemplazado, el sistema registra la cantidad instalada y completa total o parcialmente la demanda.

## Estados de la demanda

- `VALIDATED`: necesidad registrada y validada.
- `SOURCING`: en abastecimiento por inventario o compra.
- `IN_PRODUCTION`: vinculada a una OF activa.
- `QUALITY_PENDING`: pendiente de liberación de calidad.
- `READY`: cantidad completa disponible para instalación.
- `PARTIALLY_FULFILLED`: abastecimiento o instalación parcial.
- `FULFILLED`: cantidad requerida instalada.
- `ON_HOLD`: demanda suspendida.
- `CANCELED`: demanda cancelada.

## Reglas de negocio implementadas

- Solo puede existir una demanda por línea de repuesto requerido.
- La cantidad demandada no puede exceder la cantidad pendiente de reemplazo.
- La fabricación solo aplica a demandas con ruta `MAKE` y artículo de inventario.
- Una OF de repuesto define explícitamente su artículo de salida y cantidad de unidades.
- La suma de recepciones no puede superar la cantidad de la OF.
- Cada recepción actualiza de forma transaccional la existencia, el libro de movimientos y la demanda.
- Una línea con demanda posventa no puede eliminarse, para preservar su trazabilidad.
- Las actualizaciones de la demanda usan control de versión optimista.
- Técnicos asignados pueden registrar necesidades e instalaciones; la clasificación comercial, generación de OF y recepción corresponden a administradores.

## Endpoints principales

- `GET /service-orders/:id/part-demands`
- `POST /service-orders/:id/parts/:partId/demand`
- `PATCH /service-orders/:id/part-demands/:demandId`
- `POST /service-orders/:id/part-demands/:demandId/manufacturing-order`
- `GET /manufacturing/orders?orderType=SPARE_PART`
- `POST /manufacturing/orders/:id/receive-spare-output`

## Alcance posterior recomendado

El flujo abreviado para piezas repetitivas está documentado en [Manufactura abreviada](manufacturing-quick-flow.md), incluyendo perfiles aprobados, ejecución por lote, recepciones parciales, entrega directa, disposición y costos operativos.

La primera entrega cubre la ruta de manufactura de extremo a extremo. Para completar todas las variantes conviene conectar `BUY` con solicitudes de compra, reservar existencias para `STOCK`, incorporar la disposición de la pieza retirada (retorno, reparación, análisis o descarte) y agregar tableros de tiempo de ciclo, costo de garantía y recurrencia por modelo/componente.
