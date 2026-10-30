# Cotizaciones y cumplimiento comercial

La sección `/quotations` controla una solicitud desde su recepción hasta la factura y la entrega. El expediente existe independientemente de las OS y OF; sus líneas admiten servicios, repuestos y solicitudes mixtas. Se conservan datos del cliente y contacto aunque todavía no exista un activo.

## Puesta en marcha

La migración **65_quotations.sql** es aditiva, transaccional y admite repetición. Con una base actualizada hasta la migración 64:

```sh
docker compose run --rm --no-deps -e MIGRATION_START=65 migrate
```

Regenerar Prisma y reconstruir API y web con el procedimiento habitual del proyecto. Para generación local:

```sh
npx prisma generate --schema apps/api/prisma/schema.prisma
```

El almacenamiento persistente de `ATTACHMENTS_DIR` debe estar montado en la API; los archivos se escriben en su subdirectorio privado `quotations`. No se agregan variables de entorno. No ejecutar `db push` contra la base de aplicación.

## Equipo y acceso

Administración configura **Equipo y permisos** desde el listado. Funciones: cotizar/aprobar, cotizar suministro, registrar compras, recibir, ejecutar servicios, facturar y despachar. `READ` habilita consulta de todos los expedientes de la compañía. Sin ese permiso, un usuario solo ve los que creó, coordina o tiene asignados. El coordinador operativo obtiene gestión y cotización de su propio expediente. `VIEWER` mantiene exclusivamente consulta.

Los usuarios con funciones de cotización, abastecimiento o compras consultan costos y documentos del proveedor. Almacén y demás funciones ven referencias y cantidades de órdenes para cumplirlas, con costos y soportes comerciales de proveedor protegidos. Las descargas verifican el permiso vigente. El cliente no tiene un portal externo en esta entrega.

Cada expediente conserva coordinador, responsable actual, área y fecha de próxima gestión. Se puede traspasar desde una transición comercial o al registrar un documento operativo; también existe una acción explícita del coordinador. El responsable entrante debe tener permiso para su área. Los cambios quedan en la bitácora y en **Me corresponde actuar**. Los cambios de permisos tienen auditoría independiente.

## Operación

1. Crear la solicitud con cliente, contacto, detalle y líneas. Las rutas son compra (`BUY`), fabricación (`MAKE`), existencias (`STOCK`) y servicio (`SERVICE`). Existencias y fabricación requieren artículo de inventario.
2. Adjuntar la solicitud original en **Evidencias**. Se admite PDF, JPG, PNG y WebP, hasta 10 MB, con comprobación de contenido y huella SHA-256. Para solicitudes verbales puede adjuntarse el registro escrito de recepción.
3. Para compra/fabricación, traspasar a compras o manufactura. Adjuntar ofertas o estimaciones internas, registrar costo, moneda, plazo y vigencia por línea y seleccionar la oferta elegida. Se conservan las alternativas.
4. **Preparar cotización** devuelve a servicio técnico. Completar precios de venta e impuestos en **Líneas y avance**. Servicio puro y existencias pasan directamente a esta etapa.
5. Adjuntar la cotización y constancia de envío como **Cotización al cliente y envío**, en la revisión indicada. **Registrar envío al cliente** requiere destinatario/constancia, condiciones y vigencia. Genera una revisión inmutable con cliente, líneas, cantidades, precios, impuestos y condiciones. El envío se registra después de realizarlo por el canal habitual.
6. Si el cliente solicita cambios, **Registrar ajustes solicitados** vuelve a preparación. Las revisiones anteriores permanecen intactas. Una cotización vencida requiere nueva revisión.
7. Adjuntar la OC del cliente para la revisión vigente. **Validar OC del cliente** exige número, verificación explícita de cliente/alcance/valores, cantidades aprobadas y total exacto. Se admite aprobación parcial por línea; las no incluidas conservan cantidad aprobada cero. La propuesta aprobada deja de ser editable.
8. En cumplimiento, registrar documentos con referencia, fecha, evidencia y cantidades por línea. Puede traspasarse la próxima gestión en el mismo registro. La bitácora conserva cada acción y el documento relacionado.
9. Cerrar cuando todas las cantidades aprobadas estén facturadas y los servicios aceptados o los repuestos entregados.

### Compra y recepción

Una OC al proveedor requiere oferta seleccionada vigente, cantidades aprobadas y saldo disponible. Cada orden agrupa un solo proveedor y moneda; conserva una fotografía del costo y plazo seleccionados. Referencias repetidas del mismo tipo dentro del expediente se rechazan.

La recepción señala la orden de origen y cantidades verificadas/aceptadas. Admite entregas parciales y controla el saldo de cada orden. Una compra vinculada al catálogo genera entrada de inventario en la misma transacción, utilizando la distribución habitual del libro de inventario. Los repuestos de descripción libre mantienen control documental sin movimientos de catálogo.

Las ofertas se pueden renovar durante cumplimiento para ordenar el saldo pendiente; se conserva la oferta anterior y los costos de las órdenes ya registradas.

### Fabricación

Crear la OF de repuesto en Manufactura y vincularla a una línea aprobada con el mismo artículo de salida y cantidad suficiente. Una OF solo abastece una línea comercial. Registrar la orden interna con evidencia y cantidades comprometidas.

La recepción comercial exige que Manufactura ya haya registrado suficiente producto terminado. Reutiliza esa recepción sin volver a incrementar inventario. Ensamble, calidad y liberación siguen siendo responsabilidad del módulo de Manufactura.

### Servicios

Crear la OS en su módulo y vincularla desde **Vincular ejecución**. Si el expediente contiene activo, la OS debe corresponderle. Un técnico necesita asignación activa a la OS para vincularla. Registrar la ejecución requiere OS completada/cerrada y evidencia de informe y conformidad. Después se registra la factura.

### Facturación, despacho y entrega

La factura se registra con el soporte emitido por el sistema contable, referencia, cantidades y total con impuestos. Solo se factura cantidad recibida o servicio realizado/aceptado; el cálculo utiliza decimales y redondeo por línea.

El despacho exige recepción, factura y disponibilidad de inventario. Genera una salida vinculada al documento, de forma transaccional. Se registra después la entrega confirmada, limitada a lo despachado. No se confunde despacho con recepción por parte del cliente.

Las cantidades recibidas pendientes de despacho comprometen disponibilidad entre expedientes comerciales. Se descuentan también reservas activas de manufactura al comprobar disponibilidad. Otros módulos de inventario conservan sus mecanismos actuales; la disponibilidad se verifica nuevamente al despachar.

## Estados y excepciones

Estados: solicitud, cotizando suministro, preparando cotización, esperando al cliente, cumplimiento, pausa, cerrada, rechazada y cancelada. Dentro de cumplimiento, los saldos independientes de cada línea permiten compras, recepciones, ejecución, facturación y entregas parciales simultáneas.

Pausa y reanudación requieren motivo y conservan la etapa previa. Rechazar requiere motivo y solo aplica antes de aprobación. Cancelar exige motivo y ausencia de documentos de compromiso operativo; los casos con compras, facturas o entregas requieren gestionar esos compromisos, y no se eliminan mediante una cancelación comercial. El cierre exige cumplimiento completo. Las anotaciones de seguimiento siguen disponibles después del cierre.

No hay borrado de expedientes, revisiones, ofertas, documentos o evidencias desde este módulo. Un ajuste posterior a aprobación, devolución, nota crédito o cancelación de saldos con compromisos requiere una ampliación explícita; esta entrega evita alterar el historial aprobado. Generación de PDF, envío automático, anticipos, portal del cliente e integración fiscal/contable quedan para una siguiente entrega. Las cotizaciones previas de OS permanecen disponibles en su ubicación original.

## Integridad y API

Todas las operaciones comprueban empresa y permisos de la sesión verificada. Las mutaciones usan versión optimista y transacciones serializables con bloqueo del módulo por empresa; los conflictos simultáneos responden 409. Los documentos y movimientos de inventario se confirman juntos. Los archivos fallidos se retiran del disco. Los adjuntos no se exponen por los endpoints heredados.

Tablas propias: `Quotation`, `QuotationLine`, `QuotationRevision`, `QuotationOffer`, `QuotationDocument`, `QuotationAttachment`, `QuotationEvent`, `QuotationAccess`, `QuotationAccessEvent`. Las claves compuestas impiden documentos, evidencias y vínculos operativos entre compañías. Las restricciones SQL adicionales forman parte de la migración y no deben omitirse al instalar.

Rutas principales:

- `GET/POST /quotations`; `GET /quotations/metadata`; `POST /quotations/access`.
- `GET /quotations/:id`; `GET /quotations/:id/events?page=1`.
- `PATCH /quotations/:id/lines`; `POST /quotations/:id/actions`.
- `POST /quotations/:id/offers`; `POST /quotations/:id/offers/:offerId/select`.
- `POST /quotations/:id/documents`; `POST /quotations/:id/links`.
- `POST /quotations/:id/attachments`; `GET /quotations/:id/attachments/:fileId/download`.

Las escrituras de expediente requieren `version`; la carga utiliza multipart con `version`, `purpose`, `revision` cuando corresponda y `file`. El historial y listado se paginan de 30 en 30. Lista y tablero respetan los filtros y paginación.

## Verificación

Desde `apps/api`:

```sh
npm run test:quotations
npm run test:quotations:integration
npx tsc -p tsconfig.build.json --noEmit --incremental false
```

La integración usa exclusivamente `QUOTATIONS_TEST_DATABASE_URL`, por defecto una base temporal `quotations_test` en `127.0.0.1:55465`; no utiliza `DATABASE_URL` de la aplicación. Exige el nombre de base `quotations_test`, crea un esquema único, reproduce el esquema anterior, aplica dos veces la migración real y elimina únicamente ese esquema y su directorio temporal al finalizar. Requiere Prisma regenerado.

Cubre API HTTP autenticada, permisos y empresas, evidencias privadas, propuestas y revisiones inmutables, validación de OC, compras/recepciones/facturas/despachos/entregas parciales, servicio y OS, fabricación sin duplicar stock, solicitud mixta con aprobación parcial, concurrencia, pausa/cancelación e historial completo.
