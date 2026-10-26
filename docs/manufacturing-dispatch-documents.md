# Archivos en los documentos de despacho

En la orden de manufactura → Despacho → expediente → Agregar documento, seleccionar tipo, título y archivo. La referencia es opcional si se adjunta un archivo. Se conserva la posibilidad de registrar únicamente una referencia y los documentos anteriores siguen disponibles.

Se admite un archivo por documento, hasta 20 MB: PDF, Word (DOC/DOCX), Excel (XLS/XLSX), CSV/TXT UTF-8 e imágenes JPG/PNG/WebP. La API comprueba extensión, contenido y tipo. Archivos vacíos, formatos no admitidos o un documento que no corresponda con la extensión producen un error sin guardar el registro. El formulario conserva los datos ante un fallo.

La lista muestra el nombre y tamaño del archivo y permite descargarlo. Las descargas requieren sesión, empresa y acceso a la orden; no hay enlaces públicos a la carpeta de almacenamiento. Los archivos pueden consultarse después del despacho y la entrega.

La carga y el retiro siguen disponibles en preparación, embalaje listo y salida autorizada, con orden activa y usuario operativo. Retirar elimina el registro y su archivo después de confirmar la transacción, conservando la trazabilidad de la acción. Si falla la creación del registro, se limpia el archivo nuevo. Un documento retirado deja de estar disponible para descargar.

## API y almacenamiento

- `POST /manufacturing/dispatches/:dispatchId/documents/file`: multipart con `file`, `documentType`, `title` y opcionalmente `reference`, `url`, `notes`.
- `GET /manufacturing/dispatch-documents/:documentId/file`: descarga como adjunto con caché deshabilitada y `nosniff`.
- Los endpoints de registro por referencia y retiro conservan sus rutas.
- Los archivos se guardan en `ATTACHMENTS_DIR/dispatch-documents` (por defecto `storage/attachments/dispatch-documents`) con identificadores aleatorios, separados del nombre original. La carpeta hereda el volumen persistente de adjuntos de la API y debe incluirse en sus respaldos.

## Despliegue y verificación

Aplicar `db/migrations/61_manufacturing_dispatch_document_files.sql`, regenerar Prisma y reconstruir/desplegar API y web mediante el procedimiento habitual. La migración agrega campos opcionales y un índice único; conserva los documentos existentes. Si el incremento de preparación anticipada está pendiente, aplicar también la migración 60 en el orden habitual. Ajustar cualquier límite del proxy externo para que admita un archivo de 20 MB más el contenedor multipart.

Las pruebas del almacenamiento y los endpoints se incluyen en `npm run test:manufacturing`. Usan archivos temporales y simulación de la base de datos para comprobar formatos, carga y descarga autenticadas, permisos, estados, limpieza ante errores y compatibilidad de referencias. Para el esquema y la compilación: `prisma validate`, `npm run build` en API y `tsc --noEmit` en web.
