# Manufactura — diseño técnico de la Fase 1

## 1. Propósito

Implementar el expediente digital de una máquina desde que Manufactura recibe la información de Ingeniería hasta que existe una versión formalmente liberada para planificar su construcción.

Esta fase resuelve cuatro problemas:

1. Identificar la orden de manufactura antes de que exista un activo terminado.
2. Controlar planos y documentos por revisión, sin reemplazar el historial.
3. Mantener una BOM versionada y apta para el cálculo posterior de materiales.
4. Registrar una liberación formal de Ingeniería, auditable e inmutable.

La Fase 1 no incluye todavía órdenes de compra, reservas de inventario, ejecución de operaciones, FAT ni despacho. El modelo conserva los puntos de extensión necesarios para esas fases.

### Estado de implementación

- Incremento 1 — Fundaciones: **implementado el 17 de agosto de 2026**.
- Incremento 2 — Control documental: **implementado el 17 de agosto de 2026**.
- Incremento 3 — BOM: **implementado el 18 de agosto de 2026**.
- Incremento 4 — Liberación: **implementado el 18 de agosto de 2026**.

El Incremento 1 incluye migración 33, órdenes, consecutivos, unidades, participantes, auditoría, permisos iniciales, API, tablero, alta y detalle operativo.

El Incremento 2 incluye migración 34, maestros documentales por disciplina y tipo, revisiones inmutables con archivo y huella SHA-256, flujo de envío/aprobación/rechazo, segregación entre autor y revisor, permisos por equipo, auditoría y matriz documental en la pestaña de Ingeniería. Una revisión aprobada continúa pendiente hasta incorporarse a una liberación formal del Incremento 4.

El Incremento 3 incluye migración 35, BOM y revisiones, líneas jerárquicas con cantidades decimales, integración opcional con `InventoryItem`, referencias exactas a planos, clasificación de suministro, editor operativo, copia de revisiones, importación CSV/XLS/XLSX con previsualización vinculada por hash y expiración, aprobación segregada, métricas y auditoría. Las revisiones aprobadas permanecen inmutables y pendientes hasta su liberación formal.

El Incremento 4 incluye migración 36, borradores de liberación con control optimista, selección de BOM y documentos, validación de errores y advertencias, publicación serializable, fotografías históricas, reemplazo de paquetes anteriores y transición atómica de BOM, planos y orden. Con este incremento queda completado el alcance técnico de la Fase 1.

## 2. Encaje con el sistema actual

### Componentes que se reutilizan

- Arquitectura multi-tenant mediante `tenantId` y `tenantStorage`.
- Usuarios existentes para responsables, revisores y aprobadores.
- `InventoryItem` como catálogo maestro de componentes comprados, fabricados, ensambles y consumibles.
- Infraestructura física de `Attachment` para guardar y servir archivos.
- Patrones de DTO, controlador y servicio usados en `assemblies`.
- Next.js, `apiFetch`, SWR y navegación mediante `AppShell`.
- Patrón de migraciones SQL numeradas y sincronización posterior del esquema Prisma.

### Componentes que no deben reutilizarse como entidad principal

- `Asset`: representa un equipo identificable dentro del ciclo CMMS. La máquina en construcción aún no debe ser obligatoriamente un activo.
- `WorkOrder`: representa mantenimiento o servicio, no el expediente constructivo.
- `AssemblyExecution`: exige una orden de trabajo y un `assetCode`. Su calendario y métricas podrán reutilizarse conceptualmente en la fase de ejecución de planta, pero no es la raíz de Manufactura.
- `Attachment` sin extensión: actualmente solo admite propietario `asset` o `work_order`; deberá aceptar documentos de manufactura de forma explícita.

## 3. Alcance funcional

### Incluido

- Crear, consultar, editar y cancelar órdenes de manufactura.
- Generación automática de número `OF-AAAA-NNNNN` por tenant.
- Registrar cliente y referencias comerciales como fotografía de texto.
- Definir una o varias unidades físicas a fabricar.
- Asignar responsable general e integrantes de Ingeniería.
- Crear documentos de Ingeniería por disciplina y tipo.
- Crear revisiones documentales con archivo y motivo de cambio.
- Revisar, aprobar, liberar y declarar obsoleta una revisión.
- Crear revisiones de BOM.
- Editar líneas de una BOM en borrador.
- Importar BOM desde CSV/XLSX con previsualización y confirmación.
- Validar vínculos opcionales con `InventoryItem`.
- Crear un paquete de liberación de Ingeniería.
- Validar y publicar la liberación en una única transacción.
- Consultar historial y auditoría de las acciones relevantes.
- Tablero básico de órdenes y detalle por pestañas.

### Fuera de alcance

- Proveedores y órdenes de compra.
- Reservas, entregas y consumo de inventario.
- Fabricación por terceros.
- Operaciones de producción y Gantt.
- Inspecciones y no conformidades.
- FAT.
- Despacho y creación automática del activo.
- Costos reales.
- Firma digital con certificado. En esta fase se registra identidad, fecha y acción del usuario autenticado.

## 4. Lenguaje del dominio

- **Orden de manufactura (OF):** expediente del proyecto o lote a fabricar.
- **Unidad fabricada:** máquina física individual dentro de la OF.
- **Documento de Ingeniería:** identidad lógica de un plano, esquema, programa o especificación.
- **Revisión documental:** contenido concreto e inmutable de un documento.
- **BOM:** lista de materiales lógica de la OF.
- **Revisión de BOM:** fotografía editable o liberada de la lista.
- **Liberación de Ingeniería:** paquete que fija una revisión de BOM y revisiones documentales específicas.
- **Revisión vigente:** última revisión liberada de un documento; no equivale a la última revisión creada.

## 5. Flujo de estados

### 5.1 Orden de manufactura

```text
DRAFT -> ENGINEERING -> RELEASED -> CANCELED
  |           |             |
  +-----------+-------------+-> ON_HOLD
```

Estados de esta fase:

- `DRAFT`: datos iniciales editables.
- `ENGINEERING`: Ingeniería está preparando documentos y BOM.
- `RELEASED`: existe al menos una liberación publicada y vigente.
- `ON_HOLD`: suspendida temporalmente; requiere motivo.
- `CANCELED`: cancelada; requiere motivo y no puede reabrirse en el MVP.

Estados futuros se agregarán cuando entren producción, FAT y despacho.

Reglas:

- Crear el primer documento o la primera BOM puede mover `DRAFT` a `ENGINEERING`.
- Publicar la primera liberación mueve la orden a `RELEASED`.
- Una nueva revisión no degrada automáticamente `RELEASED`; muestra que existen cambios de Ingeniería pendientes de una nueva liberación.
- `CANCELED` es terminal.

### 5.2 Revisión documental

```text
DRAFT -> IN_REVIEW -> APPROVED -> RELEASED -> OBSOLETE
  ^          |
  +----------+ REJECTED
```

- Solo `DRAFT` es editable.
- Enviar a revisión exige archivo y motivo de revisión.
- Aprobar y rechazar exige un usuario distinto del creador cuando la opción de segregación esté activa.
- `RELEASED` significa incluida en una liberación publicada.
- Una revisión liberada nunca se modifica ni elimina.
- Al liberar una revisión nueva, la liberada anterior del mismo documento queda `OBSOLETE`, pero continúa vinculada a liberaciones históricas.

### 5.3 Revisión de BOM

```text
DRAFT -> IN_REVIEW -> APPROVED -> RELEASED -> SUPERSEDED
  ^          |
  +----------+ REJECTED
```

- Solo `DRAFT` permite modificar líneas.
- Una BOM liberada es inmutable.
- Corregir una BOM liberada crea una nueva revisión copiando las líneas anteriores.
- Una sola revisión puede estar `RELEASED` como vigente por orden.

### 5.4 Liberación de Ingeniería

```text
DRAFT -> RELEASED -> SUPERSEDED
   |
   +-> CANCELED
```

- `DRAFT` permite seleccionar documentos y BOM.
- `RELEASED` congela el contenido.
- Una nueva liberación publicada deja la anterior como `SUPERSEDED`.
- Nunca se edita ni elimina una liberación publicada.

## 6. Modelo de datos

Todos los modelos incluyen `tenantId`, relación con `Tenant`, índices por tenant y `onDelete: Cascade` desde el tenant. Las referencias entre entidades siempre se validarán también por tenant en el servicio, porque una FK por sí sola no garantiza que ambos registros pertenezcan al mismo tenant.

### 6.1 Enumeraciones

```prisma
enum ManufacturingOrderStatus {
  DRAFT
  ENGINEERING
  RELEASED
  ON_HOLD
  CANCELED
}

enum ManufacturedUnitStatus {
  PLANNED
  CANCELED
}

enum EngineeringDiscipline {
  MECHANICAL
  ELECTRICAL
  PNEUMATIC
  HYDRAULIC
  AUTOMATION
  SOFTWARE
  QUALITY
  GENERAL
}

enum EngineeringDocumentType {
  DRAWING
  SCHEMATIC
  SPECIFICATION
  DATASHEET
  PROGRAM
  MANUAL
  CALCULATION
  PROCEDURE
  OTHER
}

enum EngineeringRevisionStatus {
  DRAFT
  IN_REVIEW
  APPROVED
  REJECTED
  RELEASED
  OBSOLETE
}

enum ManufacturingBomRevisionStatus {
  DRAFT
  IN_REVIEW
  APPROVED
  REJECTED
  RELEASED
  SUPERSEDED
}

enum SupplyType {
  STOCK
  BUY
  MAKE
  SUBCONTRACT
}

enum EngineeringReleaseStatus {
  DRAFT
  RELEASED
  SUPERSEDED
  CANCELED
}
```

### 6.2 `ManufacturingNumberSequence`

Evita colisiones al generar números concurrentemente.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | String | `cuid()` |
| `tenantId` | String | FK Tenant |
| `year` | Int | Año local del tenant |
| `lastValue` | Int | Último consecutivo asignado |
| `updatedAt` | DateTime | Automático |

Restricción única: `(tenantId, year)`.

La creación de una OF incrementará el consecutivo dentro de la misma transacción. Número visible: `OF-${year}-${lastValue.padStart(5, '0')}`.

### 6.3 `ManufacturingOrder`

| Campo | Tipo | Comentario |
|---|---|---|
| `id` | String | `cuid()` |
| `tenantId` | String | Aislamiento multi-tenant |
| `number` | String | Ej. `OF-2026-00001` |
| `status` | Enum | Estado macro |
| `projectName` | String | Nombre de la máquina/proyecto |
| `productCode` | String? | Código interno del modelo |
| `productName` | String | Nombre comercial/técnico |
| `model` | String? | Modelo o variante |
| `quantity` | Int | Mayor que cero |
| `priority` | WorkOrderPriority? | Reutiliza la semántica actual |
| `customerName` | String? | Fotografía del cliente |
| `customerReference` | String? | Pedido/contrato del cliente |
| `commercialReference` | String? | Cotización/proyecto interno |
| `destination` | String? | Lugar previsto de instalación |
| `description` | String? | Alcance |
| `requestedDeliveryAt` | DateTime? | Compromiso comercial |
| `plannedStartAt` | DateTime? | Plan inicial |
| `plannedEndAt` | DateTime? | Plan inicial |
| `responsibleUserId` | String | Responsable general |
| `createdByUserId` | String | Autor |
| `holdReason` | String? | Obligatorio al pausar |
| `canceledReason` | String? | Obligatorio al cancelar |
| `releasedAt` | DateTime? | Primera liberación |
| `createdAt/updatedAt` | DateTime | Auditoría básica |

Restricciones e índices:

- Único `(tenantId, number)`.
- Índices `(tenantId, status, updatedAt DESC)`, `(tenantId, responsibleUserId, status)` y `(tenantId, requestedDeliveryAt)`.
- `quantity > 0` mediante validación de servicio y `CHECK` SQL.
- `plannedEndAt >= plannedStartAt` cuando existen ambas fechas.

No se crea todavía una FK a cliente porque el proyecto no tiene catálogo de clientes. Los campos de cliente son una fotografía estable. En una fase futura podrán coexistir con `customerId`.

### 6.4 `ManufacturedUnit`

| Campo | Tipo | Comentario |
|---|---|---|
| `id` | String | Identificador |
| `tenantId` | String | Tenant |
| `manufacturingOrderId` | String | OF |
| `unitNumber` | Int | 1..cantidad |
| `serialNumber` | String? | Puede asignarse después |
| `internalCode` | String? | Código interno |
| `status` | Enum | `PLANNED` inicialmente |
| `assetId` | String? | Reservado para el traspaso futuro |
| `createdAt/updatedAt` | DateTime | Auditoría |

Restricciones:

- Único `(manufacturingOrderId, unitNumber)`.
- Único parcial funcional por tenant para `serialNumber` no nulo; Prisma lo representa con índice SQL adicional.
- En Fase 1 no se permite reducir `quantity` si eso elimina unidades con información asociada.

### 6.5 `ManufacturingOrderMember`

Permite asignar participantes sin ampliar todavía el enum global `Role`.

| Campo | Tipo |
|---|---|
| `id`, `tenantId`, `manufacturingOrderId`, `userId` | String |
| `function` | String |
| `createdAt` | DateTime |

Valores iniciales permitidos de `function`: `RESPONSIBLE`, `ENGINEERING`, `REVIEWER`, `OBSERVER`. Único `(manufacturingOrderId, userId, function)`.

### 6.6 `EngineeringDocument`

| Campo | Tipo |
|---|---|
| `id`, `tenantId`, `manufacturingOrderId` | String |
| `code` | String |
| `name` | String |
| `discipline` | EngineeringDiscipline |
| `documentType` | EngineeringDocumentType |
| `systemName` | String? |
| `description` | String? |
| `active` | Boolean |
| `createdByUserId` | String |
| `createdAt/updatedAt` | DateTime |

Único `(manufacturingOrderId, code)` e índice `(tenantId, manufacturingOrderId, discipline)`.

El documento es la identidad estable; el contenido vive en sus revisiones.

### 6.7 `EngineeringDocumentRevision`

| Campo | Tipo | Comentario |
|---|---|---|
| `id`, `tenantId`, `documentId` | String | Relaciones |
| `sequence` | Int | Orden interno monotónico |
| `revisionCode` | String | A, B, 01, 02, etc. |
| `status` | Enum | Flujo documental |
| `changeSummary` | String | Obligatorio |
| `fileAttachmentId` | String | Archivo principal único |
| `sourceFilename` | String | Fotografía del nombre |
| `fileSha256` | String | Integridad y duplicados |
| `createdByUserId` | String | Autor |
| `submittedAt/submittedByUserId` | DateTime?/String? | Revisión |
| `reviewedAt/reviewedByUserId` | DateTime?/String? | Decisión |
| `reviewComment` | String? | Obligatorio al rechazar |
| `releasedAt/releasedByUserId` | DateTime?/String? | Publicación |
| `createdAt/updatedAt` | DateTime | Auditoría |

Restricciones:

- Único `(documentId, sequence)`.
- Único `(documentId, revisionCode)`.
- `fileAttachmentId` único.
- Una revisión con estado distinto de `DRAFT` no permite reemplazar el archivo.
- El código de revisión se normaliza a mayúsculas y no se genera suponiendo una serie específica; la empresa puede usar letras o números.

### 6.8 Extensión de `Attachment`

Se agrega:

```prisma
manufacturingOrderId          String?
manufacturingOrder            ManufacturingOrder?
```

Uso:

- Archivo principal de una revisión: `EngineeringDocumentRevision.fileAttachmentId`, como relación única hacia `Attachment`.
- Adjuntos generales del expediente: `manufacturingOrderId`.

El adjunto que funciona como archivo principal también lleva `manufacturingOrderId`, lo que permite comprobar pertenencia y encontrarlo desde el expediente. El endpoint de adjuntos aceptará `entityType=manufacturing_order`. La creación de una revisión documental usará un endpoint multipart propio y el mismo servicio de almacenamiento para garantizar que el registro de revisión y el adjunto queden coordinados. Si falla la transacción, el archivo físico se elimina en modalidad best-effort.

### 6.9 `ManufacturingBom`

| Campo | Tipo |
|---|---|
| `id`, `tenantId`, `manufacturingOrderId` | String |
| `code` | String |
| `name` | String |
| `description` | String? |
| `createdByUserId` | String |
| `createdAt/updatedAt` | DateTime |

Para el MVP existirá una BOM principal por orden. La tabla separada permite agregar posteriormente BOM eléctrica, mecánica o por unidad. Único `(manufacturingOrderId, code)`.

### 6.10 `ManufacturingBomRevision`

| Campo | Tipo |
|---|---|
| `id`, `tenantId`, `bomId` | String |
| `sequence` | Int |
| `revisionCode` | String |
| `status` | Enum |
| `changeSummary` | String |
| `createdByUserId` | String |
| `submittedAt/submittedByUserId` | DateTime?/String? |
| `reviewedAt/reviewedByUserId` | DateTime?/String? |
| `reviewComment` | String? |
| `releasedAt/releasedByUserId` | DateTime?/String? |
| `createdAt/updatedAt` | DateTime |

Únicos `(bomId, sequence)` y `(bomId, revisionCode)`.

### 6.11 `ManufacturingBomLine`

| Campo | Tipo | Comentario |
|---|---|---|
| `id`, `tenantId`, `bomRevisionId` | String | Relaciones |
| `position` | Int | Posición estable |
| `parentLineId` | String? | Jerarquía de subconjuntos |
| `level` | Int | 0 para raíz |
| `inventoryItemId` | String? | Catálogo existente |
| `itemCode` | String | Fotografía del código |
| `description` | String | Fotografía de la descripción |
| `quantityPerUnit` | Decimal(18,6) | Cantidad por máquina |
| `uom` | String | Fotografía de unidad |
| `supplyType` | SupplyType | Stock/compra/fabricación/tercero |
| `isOptional` | Boolean | Configuración opcional |
| `criticality` | PartCriticality | Reutiliza enum actual |
| `drawingDocumentId` | String? | Plano aplicable |
| `drawingRevisionId` | String? | Revisión exacta prevista |
| `materialSpecification` | String? | Material/acabado |
| `manufacturer` | String? | Compra |
| `manufacturerPartNo` | String? | Compra |
| `preferredSupplier` | String? | Fotografía temporal |
| `leadTimeDays` | Int? | Planificación futura |
| `notes` | String? | Observaciones |
| `createdAt/updatedAt` | DateTime | Auditoría |

Reglas:

- Único `(bomRevisionId, position)`.
- `quantityPerUnit > 0`.
- `level >= 0` y `leadTimeDays >= 0`.
- Si existe `parentLineId`, pertenece a la misma revisión y tiene nivel inferior.
- Si existe `inventoryItemId`, código, descripción y unidad se copian inicialmente desde Inventario, pero continúan siendo una fotografía editable mientras la BOM esté en borrador.
- Si existe `drawingRevisionId`, debe pertenecer a `drawingDocumentId` y a la misma orden.
- No se eliminan líneas de una revisión liberada.

Se usará `Decimal`, no `Float`, para evitar errores en cantidades fraccionarias de cable, lámina o consumibles.

### 6.12 `EngineeringRelease`

| Campo | Tipo |
|---|---|
| `id`, `tenantId`, `manufacturingOrderId` | String |
| `sequence` | Int |
| `releaseCode` | String |
| `status` | EngineeringReleaseStatus |
| `title` | String |
| `notes` | String? |
| `bomRevisionId` | String |
| `createdByUserId` | String |
| `releasedAt/releasedByUserId/releasedByName` | DateTime?/String?/String? |
| `createdAt/updatedAt` | DateTime |

Únicos `(manufacturingOrderId, sequence)` y `(manufacturingOrderId, releaseCode)`.

`releasedByName` es una fotografía para que el historial no dependa de cambios posteriores en el nombre del usuario.

### 6.13 `EngineeringReleaseDocument`

Tabla de unión que fija revisiones específicas:

| Campo | Tipo |
|---|---|
| `id`, `tenantId`, `releaseId` | String |
| `documentRevisionId` | String |
| `documentCodeSnapshot` | String |
| `revisionCodeSnapshot` | String |
| `createdAt` | DateTime |

Único `(releaseId, documentRevisionId)`.

### 6.14 `ManufacturingAuditEvent`

| Campo | Tipo |
|---|---|
| `id`, `tenantId`, `manufacturingOrderId` | String |
| `entityType`, `entityId`, `action` | String |
| `summary` | String |
| `beforeData`, `afterData`, `metadata` | Json? |
| `actorUserId`, `actorName` | String |
| `createdAt` | DateTime |

Índices `(tenantId, manufacturingOrderId, createdAt DESC)` y `(tenantId, entityType, entityId)`.

No se registrarán binarios, contraseñas, tokens ni firmas en los JSON de auditoría.

## 7. Publicación atómica de una liberación

`POST /manufacturing/orders/:orderId/releases/:releaseId/publish` ejecutará una transacción:

1. Bloquear lógicamente la orden y releerla dentro de la transacción.
2. Validar que la orden no esté pausada, cancelada ni modificada por otro proceso.
3. Validar que la liberación esté en `DRAFT`.
4. Validar que tenga una revisión de BOM `APPROVED`.
5. Validar que tenga al menos un documento.
6. Validar que todas las revisiones documentales seleccionadas estén `APPROVED`.
7. Validar que no incluya dos revisiones del mismo documento.
8. Validar que la BOM tenga al menos una línea y no contenga cantidades inválidas.
9. Validar que los planos referidos por las líneas pertenezcan a la liberación o registrar una advertencia bloqueante.
10. Marcar como `SUPERSEDED` la liberación vigente anterior.
11. Marcar la BOM seleccionada `RELEASED` y la anterior `SUPERSEDED`.
12. Marcar las revisiones documentales seleccionadas `RELEASED` y las anteriores del mismo documento `OBSOLETE`.
13. Marcar la liberación `RELEASED` con usuario y fecha.
14. Actualizar la orden a `RELEASED` y establecer `releasedAt` si estaba vacío.
15. Crear el evento de auditoría.

La transacción debe fallar completa ante cualquier conflicto.

Para evitar publicar sobre datos que el usuario no vio, `EngineeringRelease` tendrá además un entero `lockVersion` con actualización optimista. El cliente enviará el valor observado y la publicación incrementará el contador.

## 8. API REST

Prefijo: `/manufacturing`.

### 8.1 Órdenes

| Método | Ruta | Acción |
|---|---|---|
| GET | `/manufacturing/orders` | Listar con filtros y paginación |
| POST | `/manufacturing/orders` | Crear OF y unidades |
| GET | `/manufacturing/orders/:id` | Resumen completo |
| PATCH | `/manufacturing/orders/:id` | Editar datos permitidos |
| POST | `/manufacturing/orders/:id/hold` | Pausar con motivo |
| POST | `/manufacturing/orders/:id/resume` | Reanudar |
| POST | `/manufacturing/orders/:id/cancel` | Cancelar con motivo |
| GET | `/manufacturing/orders/:id/history` | Auditoría paginada |

Filtros del listado:

- `q`, `status`, `responsibleUserId`, `priority`.
- `deliveryFrom`, `deliveryTo`.
- `engineeringPending=true|false`.
- `page`, `size`, `sort`.

Respuesta del listado incluye únicamente resúmenes y métricas derivadas; el detalle pesado se obtiene por ID.

### 8.2 Participantes y unidades

| Método | Ruta |
|---|---|
| PUT | `/manufacturing/orders/:id/members` |
| GET | `/manufacturing/orders/:id/units` |
| PATCH | `/manufacturing/orders/:id/units/:unitId` |

`PUT members` reemplaza atómicamente la composición editable y valida usuarios activos del mismo tenant.

### 8.3 Documentos

| Método | Ruta | Acción |
|---|---|---|
| GET | `/manufacturing/orders/:id/documents` | Matriz documental |
| POST | `/manufacturing/orders/:id/documents` | Crear documento lógico |
| PATCH | `/manufacturing/documents/:documentId` | Editar metadatos |
| POST | `/manufacturing/documents/:documentId/revisions` | Crear revisión multipart |
| POST | `/manufacturing/document-revisions/:id/submit` | Enviar a revisión |
| POST | `/manufacturing/document-revisions/:id/approve` | Aprobar |
| POST | `/manufacturing/document-revisions/:id/reject` | Rechazar con comentario |
| GET | `/manufacturing/document-revisions/:id/file` | Visualizar/descargar por adjunto |

No se expone `DELETE` para revisiones. Una revisión `DRAFT` creada por error puede cancelarse en una extensión posterior; inicialmente se conservará en historial y se podrá crear otra.

### 8.4 BOM

| Método | Ruta | Acción |
|---|---|---|
| GET | `/manufacturing/orders/:id/boms` | BOM y revisiones |
| POST | `/manufacturing/orders/:id/boms` | Crear BOM principal |
| POST | `/manufacturing/boms/:bomId/revisions` | Nueva revisión, opcionalmente copiando otra |
| GET | `/manufacturing/bom-revisions/:id` | Detalle con líneas |
| PUT | `/manufacturing/bom-revisions/:id/lines` | Reemplazo atómico de líneas de borrador |
| POST | `/manufacturing/bom-revisions/:id/import/preview` | Validar CSV/XLSX |
| POST | `/manufacturing/bom-revisions/:id/import/commit` | Confirmar archivo previamente validado |
| POST | `/manufacturing/bom-revisions/:id/submit` | Enviar a revisión |
| POST | `/manufacturing/bom-revisions/:id/approve` | Aprobar |
| POST | `/manufacturing/bom-revisions/:id/reject` | Rechazar |

La importación seguirá el patrón preview/commit del inventario. El archivo temporal tendrá expiración y hash para impedir confirmar un contenido distinto del previsualizado.

Columnas iniciales de importación:

```text
position,parent_position,item_code,description,quantity_per_unit,uom,
supply_type,inventory_sku,is_optional,criticality,drawing_code,
drawing_revision,material_specification,manufacturer,manufacturer_part_no,
preferred_supplier,lead_time_days,notes
```

### 8.5 Liberaciones

| Método | Ruta | Acción |
|---|---|---|
| GET | `/manufacturing/orders/:id/releases` | Historial de liberaciones |
| POST | `/manufacturing/orders/:id/releases` | Crear borrador |
| PATCH | `/manufacturing/orders/:id/releases/:releaseId` | Seleccionar BOM, documentos y notas |
| GET | `/manufacturing/orders/:id/releases/:releaseId/validate` | Validación sin modificar datos |
| POST | `/manufacturing/orders/:id/releases/:releaseId/publish` | Publicación atómica |

`validate` retorna:

```json
{
  "valid": false,
  "errors": [{ "code": "BOM_NOT_APPROVED", "message": "...", "entityId": "..." }],
  "warnings": [{ "code": "UNLINKED_INVENTORY_ITEM", "message": "...", "entityId": "..." }]
}
```

Los errores bloquean; las advertencias quedan visibles pero no bloquean, salvo que una configuración futura indique lo contrario.

## 9. Autorización

El enum actual `Role` se conserva durante la Fase 1 para no afectar autenticación, JWT y pantallas existentes.

Matriz inicial:

| Acción | ADMIN | TECH miembro | VIEWER |
|---|---:|---:|---:|
| Consultar órdenes | Sí | Solo asignadas | Sí |
| Crear/editar OF | Sí | No | No |
| Cargar revisión documental | Sí | Sí, función ENGINEERING | No |
| Enviar a revisión | Sí | Sí, función ENGINEERING | No |
| Aprobar/rechazar | Sí | Sí, función REVIEWER | No |
| Editar BOM | Sí | Sí, función ENGINEERING | No |
| Crear/publicar liberación | Sí | No | No |
| Pausar/cancelar | Sí | No | No |

La capa de servicio aplica todos los controles; ocultar botones en frontend no se considera seguridad.

Esta solución es transitoria. Antes de Compras/Almacén/Calidad se deberá implementar RBAC por capacidades para evitar sobrecargar `Role` y `function`.

## 10. Contratos y validaciones importantes

- Todo ID recibido se consulta con `tenantId`.
- Códigos y números se normalizan con `trim`; códigos técnicos se convierten a mayúsculas.
- Las fechas de negocio viajan en ISO 8601 UTC; la UI las presenta en la zona configurada.
- Ningún endpoint acepta `tenantId`, `createdByUserId`, aprobadores o fechas de aprobación desde el cuerpo.
- No hay borrado en cascada iniciado desde endpoints de negocio.
- Las acciones de estado son endpoints explícitos, no cambios arbitrarios mediante `PATCH`.
- Se rechazan cuerpos sin cambios.
- Se limita el tamaño y tipo de archivos mediante la configuración de adjuntos existente.
- Para documentos se calculan MIME real, extensión permitida y SHA-256; no se confía solo en el nombre enviado.
- PDF se visualiza en línea. Archivos CAD y PLC se descargan.
- Los DTO deberán usar `class-validator`, no solo tipos TypeScript.
- Los errores de negocio usarán `409 Conflict`; datos inválidos `400`; ausencia dentro del tenant `404`; permisos `403`.

## 11. Diseño de frontend

### 11.1 Navegación

Agregar al menú:

```text
🏭 Manufactura
```

Ruta raíz: `/manufacturing`.

El menú estará visible a ADMIN, VIEWER y TECH. Para TECH el backend solo devolverá órdenes asignadas.

### 11.2 Tablero `/manufacturing`

```text
┌ Manufactura                         [Nueva orden] ┐
│ [Todas 18] [Ingeniería 5] [Liberadas 9] [Pausa 2]│
│ Buscar...  Estado  Responsable  Entrega          │
├────────────┬──────────┬────────┬─────────┬────────┤
│ OF         │ Proyecto │ Cliente│ Entrega │ Ing.   │
│ 2026-00012 │ Paletiz. │ ACME   │ 24 Sep  │ 8/9 ⚠ │
└────────────┴──────────┴────────┴─────────┴────────┘
```

Indicadores por orden:

- Documentos totales/aprobados/liberados.
- Revisión de BOM vigente.
- Cambios pendientes desde la última liberación.
- Días hasta entrega.
- Responsable.

### 11.3 Crear orden `/manufacturing/new`

Formulario por secciones:

1. Identificación: proyecto, producto, modelo, cantidad.
2. Cliente: nombre, pedido y destino.
3. Planeación: prioridad y fechas.
4. Equipo: responsable y participantes.

Después de crear, redirige al detalle. El número se muestra como resultado, no se escribe manualmente.

### 11.4 Detalle `/manufacturing/[id]`

Cabecera persistente:

```text
OF-2026-00012 · Paletizador PTZ-400        [ENGINEERING]
Cliente ACME · Entrega 24/09/2026 · Responsable Ana
[Pausar] [Nueva liberación]
```

Pestañas de Fase 1:

- **Resumen:** datos, unidades, responsables y alertas.
- **Ingeniería:** matriz de documentos y revisiones.
- **BOM:** árbol/lista, filtros, edición e importación.
- **Liberaciones:** borrador, validación y publicaciones históricas.
- **Historial:** línea de tiempo auditable.

Pestañas futuras pueden mostrarse deshabilitadas con etiqueta “próximamente” solo si ayuda a comunicar el flujo; no deben interferir con la operación.

### 11.5 Matriz documental

```text
Código    Documento             Disciplina  Última  Liberada  Estado
MEC-001   Plano conjunto        Mecánica    C       B         En revisión
ELE-010   Diagrama potencia     Eléctrica   02      02        Liberado
PLC-001   Programa principal    Software    05      04        Aprobado
```

La diferencia entre “última” y “liberada” hace visible el trabajo pendiente.

### 11.6 Editor de BOM

- Tabla jerárquica con filas expandibles.
- Selector de inventario con búsqueda existente.
- Cálculo visible `cantidad por unidad × cantidad de OF`.
- Validación por fila.
- Guardado completo mediante `PUT lines` para simplificar orden y jerarquía.
- Indicadores para código no vinculado a Inventario y plano no incluido.
- Revisiones liberadas en modo solo lectura.

### 11.7 Constructor de liberación

Tres pasos:

1. Elegir BOM aprobada.
2. Elegir una revisión aprobada por documento.
3. Validar y publicar.

Antes de publicar se muestra un resumen inmutable:

- Revisión de BOM y número de líneas.
- Documentos por disciplina.
- Errores bloqueantes.
- Advertencias.
- Usuario que realizará la liberación.

La confirmación exige escribir una nota o motivo de liberación; no una frase fija de seguridad.

## 12. Estructura de código propuesta

### API

```text
apps/api/src/modules/manufacturing/
├── manufacturing.module.ts
├── manufacturing-orders.controller.ts
├── manufacturing-documents.controller.ts
├── manufacturing-boms.controller.ts
├── manufacturing-releases.controller.ts
├── services/
│   ├── manufacturing-orders.service.ts
│   ├── manufacturing-documents.service.ts
│   ├── manufacturing-boms.service.ts
│   ├── manufacturing-releases.service.ts
│   ├── manufacturing-audit.service.ts
│   └── manufacturing-number.service.ts
└── dto/
    ├── manufacturing-order.dto.ts
    ├── engineering-document.dto.ts
    ├── manufacturing-bom.dto.ts
    └── engineering-release.dto.ts
```

No se recomienda un único servicio grande como siguiente evolución del patrón de `assemblies`; separar por agregado facilitará transacciones, pruebas y las fases siguientes.

### Web

```text
apps/web/src/app/manufacturing/
├── page.tsx
├── new/page.tsx
└── [id]/
    ├── page.tsx
    └── components/
        ├── ManufacturingSummary.tsx
        ├── EngineeringDocumentsTab.tsx
        ├── BomTab.tsx
        ├── EngineeringReleasesTab.tsx
        └── ManufacturingHistoryTab.tsx

apps/web/src/lib/manufacturing.ts
```

## 13. Migración y compatibilidad

### Archivos

- Modificar `apps/api/prisma/schema.prisma`.
- Crear `db/migrations/33_manufacturing_foundation.sql`.
- Importar `ManufacturingModule` en `apps/api/src/app.module.ts`.
- Extender `Attachment`, su controlador y servicio.
- Agregar la ruta en `apps/web/src/components/AppShell.tsx`.

### Estrategia

1. Crear enums y tablas nuevas de forma aditiva.
2. Agregar columnas nullable a `Attachment`.
3. Crear FKs e índices.
4. Agregar `CHECK` SQL no expresables completamente en Prisma.
5. No migrar ni reinterpretar montajes existentes.
6. No crear activos para órdenes de manufactura de Fase 1.
7. Probar la migración sobre una copia de datos con migraciones 00–32 aplicadas.

El repositorio usa migraciones SQL propias y después ejecuta `prisma db push` cuando no existen migraciones Prisma. Por eso SQL y `schema.prisma` deben quedar alineados en el mismo cambio.

### Consideración sobre cambios locales

Actualmente existen modificaciones no confirmadas en módulos de montajes, adjuntos y Prisma. La implementación debe preservar esos cambios y evitar reescrituras masivas. La migración 33 debe construirse sobre el estado real de las migraciones 28–32.

## 14. Pruebas

### Unitarias

- Normalización de códigos.
- Generación del número de OF.
- Validación de jerarquía de BOM.
- Validación de publicación.
- Matriz de transiciones de estado.
- Cálculo de cambios pendientes desde la liberación vigente.

### Integración API/DB

- Dos creaciones concurrentes no generan el mismo número.
- No se puede consultar o vincular un registro de otro tenant.
- No se modifica una revisión documental o BOM liberada.
- Rechazar exige comentario.
- Publicar actualiza todos los estados o ninguno.
- Publicar una nueva liberación conserva la anterior y la marca superada.
- El archivo pertenece al documento y tenant correctos.
- Cancelar exige motivo.
- TECH solo ve órdenes asignadas.

### Frontend

- Estados de carga, vacío y error.
- Filtros del tablero.
- Edición de BOM con errores por fila.
- Diferencia visible entre revisión última y liberada.
- Confirmación de publicación con errores y advertencias.
- Vistas de solo lectura para revisiones publicadas.

### Regresión

- Adjuntos de activos, órdenes y actividades de montaje continúan funcionando.
- Inventario mantiene búsquedas y movimientos existentes.
- Montajes no requieren ningún cambio de datos.
- El build de API y Web termina correctamente.

## 15. Observabilidad y auditoría

Eventos mínimos:

- `ORDER_CREATED`, `ORDER_UPDATED`, `ORDER_HELD`, `ORDER_RESUMED`, `ORDER_CANCELED`.
- `DOCUMENT_CREATED`, `DOCUMENT_REVISION_CREATED`, `DOCUMENT_SUBMITTED`, `DOCUMENT_APPROVED`, `DOCUMENT_REJECTED`.
- `BOM_CREATED`, `BOM_REVISION_CREATED`, `BOM_IMPORTED`, `BOM_SUBMITTED`, `BOM_APPROVED`, `BOM_REJECTED`.
- `ENGINEERING_RELEASE_CREATED`, `ENGINEERING_RELEASE_PUBLISHED`.

Cada error de publicación debe registrar un log técnico con `tenantId`, `orderId`, `releaseId` y código de error, sin incluir contenidos binarios ni datos sensibles.

## 16. Métricas derivadas de Fase 1

No requieren tablas de acumulados inicialmente:

- Documentos totales.
- Documentos con revisión aprobada.
- Documentos incluidos en la liberación vigente.
- Documentos con revisión más nueva que la liberada.
- Número de líneas de BOM.
- Líneas vinculadas/no vinculadas a Inventario.
- Líneas por `supplyType`.
- Días hasta entrega.
- Órdenes sin liberación vigente.

Se calculan en el servicio de listado con consultas agregadas. Si el volumen crece, se podrá introducir una vista o proyección sin cambiar el contrato del frontend.

## 17. Decisiones aplazadas

- Catálogo formal de productos y variantes reutilizables.
- Catálogo de clientes.
- BOM maestra reutilizable frente a BOM exclusiva por orden.
- Numeración configurable por tenant.
- Firma digital criptográfica.
- Almacenamiento S3/objeto en lugar de disco local.
- Vista previa nativa de CAD y archivos PLC.
- RBAC por capacidades.
- Flujo de cambios urgentes después de liberar (`EngineeringChangeOrder`).
- Configuraciones opcionales diferentes por unidad fabricada.

Estas decisiones no bloquean la Fase 1, pero el modelo evita asumir que una OF siempre tendrá un único activo, una única BOM para siempre o un solo archivo sin revisión.

## 18. Secuencia de implementación recomendada

### Incremento 1 — Fundaciones

- Enums, modelos Prisma y migración 33.
- Número de OF.
- CRUD de orden, unidades y miembros.
- Tablero y detalle/resumen.
- Auditoría base.

### Incremento 2 — Control documental

- Extensión de adjuntos.
- Documento y revisiones.
- Flujo enviar/aprobar/rechazar.
- Matriz documental.

### Incremento 3 — BOM

- BOM y revisiones.
- Editor e integración con Inventario.
- Importación preview/commit.
- Flujo de aprobación.

### Incremento 4 — Liberación

- Constructor y validador.
- Publicación transaccional.
- Historial de liberaciones.
- Indicadores de cambios pendientes.

Cada incremento debe incluir migración compatible, pruebas de tenant, build de API/Web y validación de regresión antes de iniciar el siguiente.

## 19. Criterio de terminación de la Fase 1

La fase se considera terminada cuando un administrador puede:

1. Crear una OF con una o varias unidades.
2. Asignar responsables.
3. Cargar planos de distintas disciplinas con revisiones sucesivas.
4. Aprobar revisiones sin perder versiones anteriores.
5. Crear o importar una BOM y vincular componentes de Inventario.
6. Aprobar la BOM.
7. Construir y validar un paquete de Ingeniería.
8. Publicarlo de forma atómica.
9. Consultar exactamente qué BOM y planos fueron liberados.
10. Ver quién realizó cada acción y cuándo.

La **Fase 1 de Manufactura queda completa**. La evolución recomendada es la Fase 2: abastecimiento, fabricación por terceros, reservas de inventario y seguimiento de compras, sin crear todavía activos terminados ni movimientos automáticos hasta definir sus reglas operativas.
