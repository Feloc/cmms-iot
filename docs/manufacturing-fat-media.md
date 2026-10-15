# Imágenes y videos en evidencias FAT

En Manufactura → orden → Pruebas FAT, despliega un punto o una novedad y utiliza **Agregar imagen o video**. Selecciona o arrastra un archivo, completa título y descripción opcional y pulsa **Subir evidencia**. Se agrega un archivo por envío; puedes repetir para registrar varias fotos o videos. Las notas y enlaces anteriores siguen disponibles.

## Formatos y uso

- JPG/JPEG, PNG y WebP: hasta 10 MiB por archivo.
- MP4, WebM y MOV: hasta 50 MiB por archivo.
- El selector indica los formatos admitidos; la cámara disponible depende del dispositivo/navegador. HEIC, SVG, GIF y otros formatos no se admiten y deben convertirse antes.
- **Ver imagen / video** descarga el archivo con autenticación y muestra una imagen o un reproductor. La descarga es bajo demanda, no automática al listar la orden. También se puede descargar el original.
- No hay transcodificación ni compresión. La reproducción depende de los códecs del navegador; especialmente MOV puede requerir descargar el original. Para archivos mayores se mantienen los enlaces HTTP/HTTPS.
- El video se obtiene completo antes de reproducirlo (máximo 50 MiB); no se implementa streaming por rangos ni miniaturas generadas en servidor.

## Seguridad y trazabilidad

Los archivos se guardan bajo `ATTACHMENTS_DIR/fat` (por defecto `storage/attachments/fat`), reutilizando el volumen persistente de adjuntos. No se reutiliza el CRUD genérico de adjuntos porque FAT tiene reglas de cierre y permisos propios. El nombre físico es aleatorio; no se publica en las respuestas ni hay una ruta estática pública.

Cada evidencia conserva título, descripción, autor, fecha, tipo, tamaño y relación con punto o novedad, además de evento de auditoría. Se comprueban firma básica del contenedor y MIME, tamaño y número de archivos. Esto no constituye análisis antivirus ni validación completa de códecs. Se rechazan campos no declarados y nombres de descarga engañosos se normalizan a la extensión detectada.

Carga: mismos permisos operativos y estados que las evidencias de texto. La comprobación se hace dentro de la transacción y bajo bloqueo de ejecución/punto. Durante aprobación pendiente no se admiten cargas. Un FAT aprobado no admite nuevas evidencias generales ni de no conformidades; las observaciones mantienen el seguimiento posterior ya existente. No hay endpoint de eliminación ni sustitución de archivos.

Lectura: autenticación, tenant y visibilidad de la orden. Un técnico ajeno a la orden no puede descargarla; observadores con acceso pueden consultar. Las respuestas usan `private, no-store` y `nosniff`. La interfaz no coloca tokens en URLs y revoca las URLs temporales al cerrar/cambiar el contexto.

Si falla la transacción, se elimina el archivo recién creado. Una falla de lectura de la respuesta después de confirmar no elimina evidencia ya registrada. Una caída abrupta del proceso entre escritura y confirmación puede dejar archivos huérfanos; no se incorpora un recolector automático en este incremento. Respaldar tanto la base como el volumen de archivos.

## API y despliegue

- `POST /manufacturing/fat-cases/:caseId/evidence/file`
- `POST /manufacturing/fat-deviations/:deviationId/evidence/file`
- `GET /manufacturing/fat-evidence/:evidenceId/file`

Los POST reciben multipart: `file`, `title` obligatorio y `notes`, `reference`, `url` opcionales (máximo cuatro campos de texto). Devuelven la lista FAT actualizada. La lista expone `hasFile`, `filename`, `mimeType`, `size`, nunca la ubicación física. Los endpoints JSON anteriores no cambian.

Aplicar `58_manufacturing_fat_media.sql` con el runner SQL y regenerar Prisma. La migración es aditiva y deja intactas las evidencias previas. No usar `db push`. El proxy de producción, si existe fuera del repositorio, debe permitir un cuerpo multipart ligeramente superior a 50 MiB. El proxy Next y la API reciben el archivo en memoria: considerar esto al dimensionar cargas simultáneas.

En el entorno local se aplicó 58 con respaldo previo `/tmp/cmms-fat-media.PloMHh/before.dump` en el contenedor DB. Se comprobó el catálogo del respaldo, no una restauración completa; es temporal, no un respaldo externo.

## Verificación

`npm run test:manufacturing` incluye firmas/tipos, límites, campos rechazados, permisos HTTP, almacenamiento y limpieza transaccional. `npm run test:manufacturing:integration` comprueba archivos reales, aislamiento entre tenants y miembros, separación punto/novedad, autor/auditoría, bloqueo durante aprobación y todo el ciclo hasta entrega final, con rollback de datos y limpieza del directorio temporal.

Compilar API con `npm run build` y verificar web con `npx tsc --noEmit --incremental false`. La validación automatizada no sustituye una revisión visual en navegador ni pruebas de códecs/cámara en dispositivos móviles.
