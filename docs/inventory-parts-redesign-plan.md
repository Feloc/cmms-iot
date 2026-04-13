# Rediseno de Repuestos e Inventario

## Objetivo
Adaptar la propuesta de rediseno de repuestos al estado real del proyecto `CMMS-IoT`, manteniendo compatibilidad con:

- `InventoryItem` actual
- consumo de repuestos desde `ServiceOrderPart`
- consumo de repuestos desde `WorkOrderPartUsed`
- importacion masiva existente
- seguridad multi-tenant

## Estado actual del proyecto

### Backend
- El inventario actual vive en `InventoryItem`.
- Campos actuales:
  - `sku`
  - `name`
  - `qty`
  - `unitPrice`
- Se usa en:
  - `ServiceOrderPart.inventoryItemId`
  - `WorkOrderPartUsed.inventoryItemId`
- El importador actual solo soporta:
  - `sku`
  - `name`
  - `qty`
  - `unitPrice`

### Frontend
- La pantalla `/inventory` es un CRUD simple con carga masiva.
- La busqueda de repuestos para OS/OT usa `/inventory/search`.
- El lenguaje funcional del sistema ya habla de "repuestos", pero el modelo sigue siendo el de inventario basico.

## Conclusiones de adaptacion
La propuesta original de ChatGPT es buena a nivel funcional, pero implementarla literalmente como una sustitucion total de `InventoryItem -> Part` generaria demasiado riesgo en esta base actual.

Para este proyecto conviene una estrategia incremental:

1. Mantener `InventoryItem` como entidad principal en la Fase 1.
2. Enriquecer `InventoryItem` para que actue como catalogo maestro de repuestos.
3. Agregar tablas nuevas para aplicabilidad, stock por ubicacion y movimientos.
4. Mantener compatibilidad con `inventoryItemId` en OS/OT.
5. Posponer un renombre total de `InventoryItem` a `Part` hasta que el sistema ya opere estable con el nuevo modelo.

## Decisiones recomendadas

### Decision 1: No reemplazar `InventoryItem` en la primera fase
En este proyecto, `InventoryItem` ya esta integrado con ordenes de trabajo y ordenes de servicio. Por eso la opcion mas segura es extenderlo.

Campos sugeridos para agregar a `InventoryItem`:

- `oemPartNo`
- `supplierPartNo`
- `description`
- `partType`
- `uom`
- `systemGroup`
- `sectionCode`
- `sectionName`
- `itemNo`
- `parentOemPartNo`
- `preferredSupplier`
- `leadTimeDays`
- `criticality`
- `status`
- `interchangeableWith`
- `notes`
- `lastCost`
- `avgCost`
- `currency`

### Decision 2: Separar stock fisico de cantidad por equipo
La columna `qty` actual mezcla inventario disponible con conceptos del manual OEM.

Se recomienda:

- mantener `qty` temporalmente como compatibilidad legacy
- introducir una tabla nueva para stock real por ubicacion
- introducir `qtyPerEquipment` en la capa de aplicabilidad

De esa forma:

- `qty` deja de ser el centro del modelo
- `qtyPerEquipment` representa cantidad usada por la maquina
- `stockOnHand` representa inventario fisico

### Decision 3: Agregar tablas nuevas, no sobrecargar `InventoryItem`
Tablas recomendadas:

- `InventoryItemApplicability`
- `InventoryStock`
- `InventoryMovement`

Esto permite evolucionar el sistema sin romper los usos actuales.

## Modelo propuesto para este proyecto

### 1. Catalogo maestro
Extender `InventoryItem` para representar la identidad del repuesto.

### 2. Aplicabilidad
Crear `InventoryItemApplicability` para modelar:

- modelo de equipo
- variante
- rango de serie
- rango de fechas
- item del manual
- cantidad por equipo
- opcionalidad
- observaciones del manual
- referencia de pagina

### 3. Stock por ubicacion
Crear `InventoryStock` para:

- bodega
- ubicacion interna
- stock fisico
- stock reservado
- minimos
- maximos
- punto de reorden
- cantidad sugerida de compra

### 4. Movimientos
Crear `InventoryMovement` para:

- entradas
- salidas
- ajustes
- reservas
- consumos
- devoluciones
- transferencias

## Mapeo desde la propuesta original

### Propuesta original
- `Part`
- `PartApplicability`
- `InventoryStock`
- `InventoryMovement`

### Adaptacion recomendada en este repo
- `InventoryItem` extendido
- `InventoryItemApplicability`
- `InventoryStock`
- `InventoryMovement`

Esto mantiene compatibilidad con las relaciones actuales y reduce migraciones de alto impacto.

## Compatibilidad con OS y OT

### Estado actual
- `ServiceOrderPart.inventoryItemId` referencia `InventoryItem`
- `WorkOrderPartUsed.inventoryItemId` referencia `InventoryItem`

### Recomendacion
No cambiar esas relaciones en la primera fase.

Beneficios:

- no rompe formularios actuales
- no rompe busquedas actuales
- no obliga a migrar toda la logica de consumo inmediatamente

## Estrategia de implementacion por fases

## Avance actual

- Fase 1 implementada: catalogo maestro enriquecido en `InventoryItem`.
- Fase 2 implementada: aplicabilidad OEM por modelo, variante y configuracion.
- Fase 3 implementada: stock multiubicacion con `InventoryStock`, importacion extendida y visualizacion en `/inventory`.
- Fase 4 base implementada: kardex de movimientos con consumos y devoluciones automaticas desde OT y OS.

### Fase 1: Catalogo maestro profesional sin romper nada
Objetivo: enriquecer el inventario actual.

Cambios:

- extender `InventoryItem` con campos tecnicos/OEM
- actualizar DTOs, servicio e importador
- actualizar `/inventory` para mostrar nuevos campos
- mantener `qty` y `unitPrice` por compatibilidad

Resultado:

- el sistema ya soporta catalogo maestro serio
- OS/OT siguen funcionando igual
- el importador puede empezar a leer plantillas de manual de partes

### Fase 2: Aplicabilidad por modelo/manual
Objetivo: soportar manuales OEM y variantes.

Cambios:

- crear `InventoryItemApplicability`
- permitir multiples filas por repuesto
- soportar `equipmentModel`, `variant`, `itemNo`, `qtyPerEquipment`, `manualRemark`, `manualPageRef`
- exponer aplicabilidad en detalle de repuesto

Resultado:

- el sistema puede representar piezas compartidas entre variantes
- se separa claramente la identidad del repuesto de su aplicabilidad

### Fase 3: Stock multiubicacion
Objetivo: dejar de depender de un unico `qty`.

Cambios:

- crear `InventoryStock`
- mostrar stock total calculado
- conservar `InventoryItem.qty` como campo legado temporal o derivado
- agregar bodegas y ubicaciones

Resultado:

- inventario real por bodega
- base para reservas y reabastecimiento

### Fase 4: Movimientos
Objetivo: trazabilidad operacional completa.

Cambios:

- crear `InventoryMovement`
- registrar entradas, salidas, ajustes y consumos
- conectar consumos desde OS/OT

Resultado:

- kardex basico
- auditoria de inventario
- base para reservas y compras

## Recomendacion concreta de implementacion inicial
La mejor primera iteracion para este repo es:

1. Extender `InventoryItem` con campos de catalogo tecnico.
2. Mantener `qty` y `unitPrice` para no romper UI ni consumo actual.
3. Actualizar la importacion para aceptar tanto la plantilla simple como la plantilla OEM extendida.
4. Redisenar la UI de `/inventory` para mostrar:
   - identificacion de repuesto
   - datos OEM/proveedor
   - clasificacion tecnica
   - stock y costo
5. Dejar `InventoryItemApplicability` como siguiente paso inmediato.

## Campos minimos sugeridos para Fase 1
Estos son los campos que mas valor dan sin disparar demasiada complejidad:

- `sku`
- `name`
- `description`
- `oemPartNo`
- `supplierPartNo`
- `partType`
- `uom`
- `systemGroup`
- `sectionCode`
- `sectionName`
- `itemNo`
- `preferredSupplier`
- `leadTimeDays`
- `criticality`
- `status`
- `interchangeableWith`
- `notes`
- `qty`
- `unitPrice`
- `currency`

## Mapeo recomendado de la plantilla CSV extendida
La plantilla `inventory_parts_full_template.csv` ya trae una estructura valida para una evolucion por fases.

### Campos que pueden entrar directo a `InventoryItem`
- `internal_sku` -> `sku`
- `oem_part_no`
- `supplier_part_no`
- `name`
- `description`
- `part_type`
- `uom`
- `system_group`
- `section_code`
- `section_name`
- `item_no`
- `parent_oem_part_no`
- `preferred_supplier`
- `lead_time_days`
- `criticality`
- `status`
- `interchangeable_with`
- `notes`
- `last_cost`
- `avg_cost`
- `currency`

### Campos para `InventoryItemApplicability`
- `equipment_model`
- `variant`
- `serial_from`
- `serial_to`
- `applied_date_from`
- `applied_date_to`
- `is_optional`
- `qty_per_equipment`
- `manual_remark`
- `manual_page_ref`

### Campos para `InventoryStock`
- `warehouse`
- `bin_location`
- `stock_on_hand`
- `stock_reserved`
- `stock_min`
- `stock_max`
- `reorder_point`
- `reorder_qty`

## Riesgos a evitar

### Riesgo 1
Renombrar `InventoryItem` a `Part` en una sola iteracion.

Impacto:
- rompe referencias actuales
- aumenta diff
- hace mas dificil revisar

### Riesgo 2
Eliminar `qty` sin una capa de compatibilidad.

Impacto:
- rompe UI actual
- rompe importador actual
- rompe procesos de consumo ya existentes

### Riesgo 3
Intentar implementar aplicabilidad, stock y movimientos en un solo PR.

Impacto:
- demasiada superficie
- pruebas mas complejas
- mas riesgo funcional

## Propuesta de PRs

### PR 1
Catalogo maestro extendido

- Prisma
- DTOs
- API
- importador
- nueva UI de inventario

### PR 2
Aplicabilidad OEM

- tabla
- endpoints
- UI de detalle
- importacion extendida

### PR 3
Stock por bodega

- tabla
- calculos agregados
- UI operacional

### PR 4
Movimientos de inventario

- kardex
- consumos desde OS/OT
- reservas y ajustes

## Recomendacion final
Para este proyecto no conviene "reemplazar inventario"; conviene "evolucionar inventario".

La ruta mas segura y con mejor relacion valor/riesgo es:

1. convertir `InventoryItem` en un catalogo de repuestos serio
2. agregar aplicabilidad
3. agregar stock multiubicacion
4. agregar movimientos

Con eso se obtiene el modelo funcional que buscas, pero respetando la arquitectura actual del sistema.
