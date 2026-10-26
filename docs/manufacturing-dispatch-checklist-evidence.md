# Evidencias del checklist de embalaje

Cada punto del checklist de Despacho permite seleccionar varios documentos o imágenes y subirlos juntos. Se pueden acumular selecciones, revisar nombres y tamaños y quitar archivos antes de enviar. Cada grupo admite hasta 10 archivos, 20 MB por archivo y 50 MB en total. La evidencia registra título, descripción opcional, archivo, tamaño, usuario y fecha. Los formatos son los mismos de los documentos de despacho: PDF, DOC/DOCX, XLS/XLSX, CSV/TXT UTF-8, JPG/PNG/WebP.

El título y la descripción comunes se guardan en cada evidencia. La API valida todos los archivos antes de escribirlos y registra el grupo en una sola transacción. Si falla la carga, se limpian sus archivos y se conservan la selección y los datos del formulario para corregir y reintentar. Los archivos quedan como evidencias individuales para su consulta, descarga o retiro.

Durante la preparación de una orden activa, los usuarios operativos pueden guardar referencias y notas antes de completar el punto, adjuntar archivos y retirarlos. Los controles con evidencia obligatoria requieren una referencia o al menos un archivo para completarse. Cerrar el embalaje vuelve a validar esta condición.

Un punto completado no puede perder su último archivo si exige evidencia y no tiene referencia: primero debe reabrirse, registrar otra evidencia o guardar una referencia. Reabrir conserva archivos, notas y referencias; limpia solamente la información de finalización. Los cambios usan versiones y bloquean primero el despacho para impedir modificaciones simultáneas al cierre.

Después de cerrar el embalaje se conserva la consulta y descarga, incluso tras la salida o entrega. Las descargas requieren sesión, empresa y acceso a la orden. Los archivos no tienen direcciones públicas. La carga y el retiro quedan en la auditoría; los fallos de transacción limpian las cargas nuevas y un retiro confirmado elimina su archivo.

Los puntos se muestran inicialmente contraídos para facilitar el recorrido del checklist. El encabezado conserva el nombre, estado, obligatoriedad y cantidad de archivos. Cada punto puede expandirse individualmente, también con el teclado, y los botones **Expandir todos** y **Contraer todos** controlan el conjunto. Contraer un punto conserva las referencias, notas y archivos seleccionados sin guardar mientras permanece abierto el expediente; esta acción no guarda ni envía información.

Las imágenes JPG/PNG/WebP cargadas muestran una miniatura al acercarse a la zona visible del checklist. Al pulsarla se abre una vista ampliada con la opción de descargar el original; también puede cerrarse con Escape. Este visor funciona en consulta y después de cerrar o entregar el despacho. Usa las rutas autenticadas existentes, libera las imágenes al salir o cambiar de sesión y ofrece reintento si falla la carga. Los documentos generales de despacho muestran el mismo visor cuando su archivo es una imagen.

## Galería del despacho

El botón **Ver galería** de cada expediente reúne sus imágenes en una cuadrícula agrupada por punto del checklist y documentos generales. El selector permite mostrar todas las fotos, un punto específico o solo documentos generales. **Ver fotos de este punto** abre directamente la cuadrícula filtrada.

Pulsar una miniatura abre el visor navegable. Los controles **Anterior / Siguiente**, o las flechas del teclado, permiten recorrer las fotos del filtro actual sin cerrar el visor. Se muestran el contador, título, descripción, nombre de archivo, autor y fecha. **Volver a la cuadrícula** regresa al conjunto y **Descargar original** conserva el archivo completo. Escape cierra la galería.

La cuadrícula carga las imágenes progresivamente y limita las solicitudes concurrentes. Reutiliza los archivos ya cargados durante esa apertura; al cerrar o cambiar de sesión cancela las solicitudes y libera los archivos temporales del navegador. Si se retira una foto mientras está abierta, la galería actualiza el conjunto y evita conservar una selección inexistente. Los documentos que no son imágenes quedan fuera de la galería.

## Rutas

- `POST /manufacturing/dispatch-checklist/:itemId/evidence/file`: multipart con `file`, `title` y `notes` opcional.
- `POST /manufacturing/dispatch-checklist/:itemId/evidence/files`: carga múltiple con el campo repetido `files`, `title` y `notes` opcional. Conserva la ruta individual anterior.
- `GET /manufacturing/dispatch-checklist-evidence/:evidenceId/file`: descarga autenticada.
- `DELETE /manufacturing/dispatch-checklist-evidence/:evidenceId`: retira una evidencia durante preparación.
- `PATCH /manufacturing/dispatch-checklist/:itemId`: conserva el contrato de estado, versión, referencia y notas; permite guardar información en pendiente.

## Migración y verificación

Aplicar `62_manufacturing_dispatch_checklist_evidence.sql` y regenerar Prisma antes de activar la API. La tabla nueva incluye una relación compuesta con empresa y punto para evitar cruces entre empresas. Los puntos y documentos anteriores se conservan. En el entorno de desarrollo con código montado, la migración ya se aplicó durante la implementación.

La selección múltiple utiliza la misma tabla y no requiere otra migración. El proxy de despliegue debe admitir una petición de hasta 50 MB más el contenedor multipart.

El incremento está incluido en `npm run test:manufacturing`. Las pruebas usan archivos temporales y datos simulados para verificar formatos, permisos, estados, descarga HTTP, consistencia de archivos, protección de la evidencia obligatoria y orden de bloqueos. También se verifican la compilación de la API, el esquema Prisma y los tipos del frontend.
