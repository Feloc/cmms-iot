# Reporte FAT en PDF

En Manufactura → orden → FAT, expandir una ejecución y seleccionar **Descargar reporte FAT (PDF)**. Disponible con los mismos permisos de lectura de la ejecución; no requiere permisos para aprobarla.

El PDF contiene datos de empresa, cliente, orden, equipo y serie; protocolo y versión; resumen de resultados; puntos y subpuntos (incluidos los anulados); mediciones y criterios; novedades, correcciones y concesiones; evidencias, trazabilidad y aprobaciones registradas.

## Alcance

- Es una copia del estado actual al generarla, no un documento archivado al aprobar. La fecha y el usuario generador quedan identificados.
- Solo una ejecución aprobada se identifica como FAT aprobado. Los demás estados muestran «REPORTE NO APROBADO — no autoriza despacho».
- Las aprobaciones son registros del sistema, no firmas digitales criptográficas.
- Se incrustan hasta 40 fotografías locales JPG/PNG/WebP, con un máximo acumulado de 20 MB. Las imágenes omitidas o no disponibles conservan su referencia y un aviso explícito.
- Los videos se documentan con sus metadatos y se consultan en el expediente con autorización. No se incrustan videos ni se descargan recursos de enlaces externos.
- Exportar no modifica la ejecución ni el flujo de despacho.

## Operación y despliegue

Endpoint autenticado: `GET /manufacturing/fat-executions/:executionId/report.pdf`. Valida empresa y acceso a la orden, entrega `application/pdf` como adjunto y deshabilita caché. La instantánea se lee en una transacción RepeatableRead; Chromium se ejecuta después de cerrarla.

Requiere Chromium en la API (`CHROMIUM_BIN` o `chromium` en PATH), ya incluido en las imágenes del proyecto. Cada conversión usa archivos temporales y perfil aislados, con limpieza al terminar, límite de 45 segundos y máximo de dos conversiones concurrentes por proceso. Ante saturación o fallo se informa un error recuperable sin exponer rutas internas.

No requiere migraciones. En entornos con imágenes de producción sin código montado es necesario reconstruir y desplegar API y web mediante el procedimiento habitual; modificar el repositorio no actualiza esos contenedores.

## Verificación

- API: `npm run build`.
- Pruebas existentes: `npm run test:manufacturing`.
- Pruebas del reporte, incluyendo PDF real multipágina: `npm run test:manufacturing:report` (requiere Chromium).
- Frontend: `tsc --noEmit` desde `apps/web`.
- El escenario de integración de manufactura incluye comprobaciones adicionales de la instantánea y permisos. Ejecutarlo solo en una base de pruebas; no es necesario para generar el documento.
