# Flujo abreviado de manufactura posventa

## Uso en la aplicación

1. Inventario → artículo → **Perfil de fabricación**. Crear una revisión con referencia de plano/instrucción, revisión, materiales por pieza, operaciones del lote y controles de calidad. Guardar borrador y aprobar.
2. OS → repuesto requerido del catálogo → **Gestionar suministro** → ruta fabricar. En la demanda seleccionar **Crear OF abreviada**. Si ya se creó una OF estándar, su Resumen permite **Activar flujo abreviado** mientras siga en borrador sin ingeniería, abastecimiento ni ejecución registrada.
3. La creación toma una instantánea de la receta aprobada y reserva las existencias disponibles. En **Ejecución rápida**, revisar faltantes, ingresar los materiales faltantes por Inventario y volver a reservar. Liberar a producción cuando todas las cantidades estén reservadas.
4. Confirmar consumo de materiales y ejecutar las operaciones en orden. Iniciar, pausar y terminar registra tiempo; las evidencias obligatorias bloquean el cierre si faltan. Las operaciones se ejecutan por lote.
5. Un administrador registra y firma calidad por lote o unidad según el perfil. Los límites numéricos determinan conformidad en el servidor. Un rechazo exige observaciones y un ciclo de retrabajo antes de repetir la inspección. Puede consumirse material adicional de la receta con cantidad y motivo de desperdicio/retrabajo.
6. Recibir cualquier cantidad entera aprobada, incluso si otras piezas siguen pendientes de inspección o retrabajo. Elegir inventario (bodega/ubicación) o entrega directa a la OS (persona que recibe).
7. Marcar las piezas como cambiadas en la OS. La entrega directa ya descontada no vuelve a consumirse. Registrar la disposición de la pieza retirada desde el bloque de posventa de la OS.

## Reglas y trazabilidad

- Artículo activo, criticidad baja o media, diseño estable y no crítico. Materiales activos de un solo nivel; no se permite autoconsumo ni líneas duplicadas.
- Revisión aprobada e inmutable, con vigencia opcional. Cada cambio crea otra revisión; retirar una revisión impide su uso en nuevas órdenes, sin alterar las ya emitidas.
- La cantidad del lote queda fija; una receta distinta requiere una nueva revisión y una nueva OF. No hay sustitución informal de materiales ni liberación con faltantes.
- ADMIN configura/aprueba perfiles, crea/libera OF, firma calidad, recibe y registra disposición. TECH responsable o integrante de la OF registra fabricación y consumos. El acceso se valida por tenant y por pertenencia a la OF.
- Las escrituras usan transacciones serializables, bloqueo de OF/stock y versión optimista de ejecución. Repetir una recepción o un consumo con una versión antigua no duplica movimientos.
- Cancelar antes del consumo libera reservas y devuelve la demanda a validada para generar otra OF. Una OF con consumos/recepciones no se cancela directamente; puede pausarse y tramitar retrabajo. Pausar la OF detiene el cronómetro operativo.
- Entrega directa: entrada a una ubicación de tránsito exclusiva de la OF y salida inmediata, vinculadas al comprobante y demanda. La instalación usa el saldo de entregas directas aún no instalado. Revertir una instalación parcial devuelve ese saldo para una instalación posterior.
- Las cantidades abastecida e instalada se conservan por separado. Finalizar producción no marca automáticamente la demanda como instalada.
- Se conserva historial de operaciones, inspecciones, rechazos, retrabajos, recepciones y cambios de disposición. Series se registran en inspección individual; las operaciones continúan siendo por lote.

## Costos e indicadores

La ejecución muestra consumo valorizado al costo promedio o último costo del artículo, más tiempos cerrados a la tarifa horaria de la receta. Se conserva la moneda y se marca costo incompleto si falta valorización o coincide otra moneda; no se hacen conversiones ni se usa precio de venta como costo.

Manufactura muestra cantidad de OF abreviadas, completadas, ciclo promedio y costos registrados por moneda, con subtotal de demandas clasificadas como garantía aprobada. Estos son costos operativos registrados; no incluyen fletes, impuestos ni la instalación en campo, y no generan facturas ni asientos contables.

## Alcance y límites

- No se genera automáticamente una compra para faltantes; se ingresa el material mediante el flujo de inventario existente y se reintenta la reserva.
- La evidencia se captura como referencia o nota; no se añadió un repositorio nuevo de archivos.
- La firma de calidad corresponde al usuario administrador que registra la inspección, sin otra pantalla de aprobación.
- La estabilización exige un aprobador distinto del ejecutor para perfiles/calidad, o una excepción documentada; consultar [estabilización y control operativo](manufacturing-stabilization.md).
- La disposición registra decisión y observaciones por demanda; no genera por sí sola una devolución a proveedor ni un expediente de análisis de falla.
- Una pieza rechazada permanece pendiente de retrabajo/reposición dentro del lote. No hay cierre definitivo con merma de unidades ni reducción silenciosa de la necesidad de la OS.
- La entrega directa registra destinatario y movimientos; no incorpora transportista, guía o seguimiento de envío.

## Modelo y API

`ManufacturingQuickProfile` conserva revisiones y recetas JSON validadas. `ManufacturingQuickExecution` conserva la receta congelada, estado de operaciones/materiales/calidad y `lockVersion`. `ManufacturingOrder.executionMode` distingue `STANDARD` de `EXPEDITED`. Las recepciones reutilizan `ManufacturingOutputReceipt` y el kardex de inventario.

- `GET/POST /manufacturing/quick-profiles/items/:itemId`
- `POST /manufacturing/quick-profiles/:profileId/approve|retire`
- `POST /service-orders/:id/part-demands/:demandId/manufacturing-order`, con `executionMode: EXPEDITED` y `profileId`
- `POST /manufacturing/orders/:id/quick-enable`, con `version`, `profileId`
- `GET /manufacturing/orders/:id/quick`
- `POST /manufacturing/orders/:id/quick/:action`, con `lockVersion`
- Acciones: `reserve`, `release`, `consume`, `extra-material`, `start`, `pause`, `complete`, `inspect`, `rework`, `receive`.
- `GET /manufacturing/quick-metrics`
- `PATCH /service-orders/:id/part-demands/:demandId`, con `lockVersion` y `removedPartDisposition`.

## Verificación

Ejecutar en API:

```sh
node --test -r ts-node/register/transpile-only test/manufacturing-quick.spec.ts
node -r ts-node/register/transpile-only test/manufacturing-quick.integration.ts
```

La prueba integral usa tenants y artículos temporales dentro de una transacción que se revierte completamente; requiere las migraciones hasta 51 y el cliente Prisma generado. Cubre autorización, aislamiento, revisión inmutable, reservas/faltantes, consumo, inspección, retrabajo, recepción parcial, entrega directa sin doble consumo, instalación, disposición y cancelación.
