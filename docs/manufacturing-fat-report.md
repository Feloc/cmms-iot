# Reporte FAT en PDF

En Manufactura → orden → FAT, expandir una ejecución y seleccionar **Descargar reporte FAT (PDF)**. Se abre un selector de puntos y subpuntos, inicialmente todos marcados. Permite **Seleccionar todos**, **Desmarcar todos** y elegir verificaciones individualmente antes de **Generar y descargar PDF**. Disponible con los mismos permisos de lectura de la ejecución; no requiere permisos para aprobarla.

Marcar un punto principal incluye sus subpuntos; estos pueden desmarcarse individualmente. Al marcar un subpunto se incluye también su punto principal, con sus resultados y evidencias, para conservar el contexto. No se permite generar una selección vacía. Los anulados siguen disponibles y se identifican como tales. La selección se aplica solo a esa descarga y se reinicia al volver a abrir el selector.

El PDF contiene datos de empresa, cliente, orden, equipo y serie; protocolo y versión; resumen de resultados; puntos y subpuntos (incluidos los anulados); mediciones y criterios; novedades, correcciones y concesiones; evidencias, trazabilidad y aprobaciones registradas.

El encabezado incluye el logo configurado en **Branding → URL del logo** del tenant de la orden, junto a la razón social y NIT. Conserva sus proporciones y aparece tanto en reportes completos como parciales. No requiere volver a cargarlo para cada descarga.

## Alcance

- Es una copia del estado actual al generarla, no un documento archivado al aprobar. La fecha y el usuario generador quedan identificados.
- Solo una ejecución aprobada se identifica como FAT aprobado. Los demás estados muestran «REPORTE NO APROBADO — no autoriza despacho».
- Las aprobaciones son registros del sistema, no firmas digitales criptográficas.
- Se incrustan hasta 40 fotografías locales JPG/PNG/WebP, con un máximo acumulado de 20 MB. Las imágenes omitidas o no disponibles conservan su referencia y un aviso explícito.
- Los videos se documentan con sus metadatos y se consultan en el expediente con autorización. No se incrustan videos ni se descargan recursos de enlaces externos de las evidencias.
- Exportar no modifica la ejecución ni el flujo de despacho.
- Si se omiten verificaciones, el PDF y su nombre se identifican como **reporte parcial**. El resumen y el detalle incluyen solo la selección, con su numeración original; no se cargan las fotografías de verificaciones excluidas.
- Los reportes parciales conservan el estado real de la ejecución y las aprobaciones, aclarando que corresponden al FAT completo. También muestran los indicadores globales de no conformes, pendientes obligatorios y no conformidades bloqueantes; excluir un punto no elimina sus bloqueos ni simula una aprobación.

## Operación y despliegue

Endpoint autenticado: `GET /manufacturing/fat-executions/:executionId/report.pdf`. Valida empresa y acceso a la orden, entrega `application/pdf` como adjunto y deshabilita caché. La instantánea se lee en una transacción RepeatableRead; Chromium se ejecuta después de cerrarla.

La selección utiliza `POST /manufacturing/fat-executions/:executionId/report.pdf` con JSON `{ "caseIds": ["id-del-punto", "id-del-subpunto"] }`, para admitir protocolos grandes sin exceder los límites de una URL. El contrato admite hasta 1000 identificadores y el servicio verifica que todos pertenezcan a la ejecución autorizada. Los padres se incluyen automáticamente y los duplicados se deduplican. Esta ruta está marcada explícitamente como consulta: también permite usuarios de solo lectura, sin habilitar ninguna modificación. El GET anterior sigue generando el reporte completo.

El logo se descarga desde la URL HTTP/HTTPS pública del branding y se incrusta en el PDF; Chromium continúa sin acceso a la red. Admite PNG, JPG, WebP, GIF y SVG como imagen, hasta 2 MB. La descarga tiene un límite total de 5 segundos y hasta 3 redirecciones, verifica las direcciones de cada destino y fija la IP validada para impedir accesos a redes privadas o cambios de DNS. No envía sesión ni credenciales. Si no hay logo configurado, se muestra solo la identificación de la empresa; si la URL falla, es privada o el contenido no es válido, se añade un aviso sin impedir la generación del reporte.

Requiere Chromium en la API (`CHROMIUM_BIN` o `chromium` en PATH), ya incluido en las imágenes del proyecto. Cada conversión usa archivos temporales y perfil aislados, con limpieza al terminar, límite de 45 segundos y máximo de dos conversiones concurrentes por proceso. Ante saturación o fallo se informa un error recuperable sin exponer rutas internas.

No requiere migraciones. En entornos con imágenes de producción sin código montado es necesario reconstruir y desplegar API y web mediante el procedimiento habitual; modificar el repositorio no actualiza esos contenedores.

## Verificación

- API: `npm run build`.
- Pruebas existentes: `npm run test:manufacturing`.
- Pruebas del reporte, incluyendo PDF real multipágina: `npm run test:manufacturing:report` (requiere Chromium).
- Frontend: `tsc --noEmit` desde `apps/web`.
- El escenario de integración de manufactura incluye comprobaciones adicionales de la instantánea y permisos. Ejecutarlo solo en una base de pruebas; no es necesario para generar el documento.
