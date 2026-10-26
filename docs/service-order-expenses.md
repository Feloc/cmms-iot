# Gastos de órdenes de servicio

Cada OS incluye la sección **Gastos del servicio**, antes de los adjuntos generales.
Administración y los técnicos asignados pueden registrar gastos, incluso después del
cierre operativo para completar la rendición. Un técnico modifica o anula únicamente
los gastos que registró; administración gestiona todos. Un usuario de consulta o un
técnico sin asignación activa no accede a los gastos ni a sus facturas.

## Registro

- Fecha, categoría, concepto, valor y pagador (colaborador/empresa).
- Categorías: transporte, alimentación, hospedaje, peajes, parqueadero, materiales y otros.
- Moneda inicial: COP. Los importes se almacenan como `DECIMAL(14,2)` y viajan como
  texto decimal; los totales se calculan sin aritmética binaria.
- Soportes opcionales: PDF, JPG, PNG o WebP. Hasta 10 por gasto, 10 MB por archivo y
  30 MB por carga. Se validan extensión, tipo y contenido. Se pueden agregar después.
- Total vigente, desglose por categoría y pagador, y conteo de gastos sin soporte.
- Excel con hojas de gastos, resumen e historial. Incluye anulados identificados;
  el resumen suma únicamente los vigentes.

El total representa los gastos reportados. Los pagos del colaborador identifican
posibles reembolsos, sin declarar que se hayan aprobado o pagado. Esta versión no
incluye anticipos, aprobación, liquidación de reembolsos ni cálculo integral de
mano de obra y repuestos.

## Trazabilidad y archivos

Crear, editar, anular, adjuntar y retirar soportes produce un evento con usuario,
nombre y fecha. Las ediciones conservan los valores anteriores y posteriores.
Anular conserva la fila, los soportes y el historial; el gasto deja de sumar y ya
no admite cambios. Las versiones impiden que una edición sobrescriba otra concurrente.

Las facturas reutilizan `Attachment` con `expenseId` y claves privadas en
`ATTACHMENTS_DIR/expense-receipts` (por defecto `storage/attachments/expense-receipts`).
Los listados y endpoints generales de adjuntos no permiten acceder a estas facturas
ni retirarlas. Sus rutas específicas verifican empresa, servicio, asignación y autoría.
Las claves de almacenamiento no se devuelven al navegador. Las claves foráneas
compuestas impiden vincular gastos o soportes entre empresas.

La carga de varios archivos y su evento se confirma en una transacción. Si falla
la transacción, se retiran los archivos que se alcanzaron a escribir. Retirar un
soporte elimina sus bytes después de confirmar la transacción y conserva su nombre
en el historial. El formulario conserva el ID del gasto cuando falla la carga
posterior, para que reintentar no cree otro gasto.

## Migración y ejecución local

Aplicar la migración SQL versionada antes de usar la sección y regenerar el cliente:

```sh
docker compose run --rm --no-deps -e MIGRATION_START=63 migrate
docker compose exec api npx prisma generate
```

La migración `63_service_order_expenses.sql` agrega tablas, tipos, índices y la
relación opcional de `Attachment`. Se puede volver a ejecutar sin duplicar objetos.
Para un despliegue construido en imagen, reconstruir API y web con el flujo habitual.

## API

Prefijo: `/service-orders/:workOrderId/expenses`.

| Método | Ruta | Acción |
|---|---|---|
| GET | `/` | Gastos, historial, permisos y totales |
| POST | `/` | Crear gasto |
| PATCH | `/:expenseId` | Editar con `version` vigente |
| POST | `/:expenseId/void` | Anular con `{ "version": 1 }` |
| GET | `/export` | Excel |
| POST | `/:expenseId/receipts` | Cargar `files` multipart |
| GET | `/:expenseId/receipts/:receiptId` | Ver factura autenticada |
| DELETE | `/:expenseId/receipts/:receiptId` | Retirar soporte |

Ejemplo de creación (la edición agrega `version`):

```json
{
  "expenseDate": "2026-10-25",
  "category": "TRANSPORT",
  "description": "Taxi a planta",
  "amount": "25000.50",
  "paidBy": "EMPLOYEE"
}
```

## Verificación

```sh
docker compose exec api npm run test:expenses
docker cp db/migrations/63_service_order_expenses.sql cmms_api:/tmp/63_service_order_expenses.sql
docker compose exec -e EXPENSES_MIGRATION_FILE=/tmp/63_service_order_expenses.sql api npm run test:expenses:integration
docker compose exec api npx tsc -p tsconfig.build.json --noEmit --incremental false
docker compose exec web npx tsc --noEmit --incremental false
```

La integración crea un esquema PostgreSQL temporal, reproduce el esquema anterior,
aplica la migración real dos veces y comprueba importes, concurrencia, permisos,
facturas y claves foráneas. Elimina el esquema y sus archivos al finalizar; no lee
ni modifica datos de aplicación.
