# Importar protocolos FAT desde Excel o CSV

En una orden de manufactura, abre **Pruebas FAT → Importar protocolo FAT desde Excel / CSV**. Disponible para ADMIN, igual que la creación manual de protocolos.

1. Descarga el ejemplo Excel o CSV desde la pantalla.
2. Completa una fila por caso. En Excel se usa solamente la primera hoja, con encabezados en la fila 1. No se interpretan formularios de formato libre, celdas combinadas ni fórmulas: pega valores.
3. Introduce código, nombre y descripción opcional del protocolo en la pantalla.
4. Selecciona el archivo y pulsa **Validar y previsualizar**. Revisa casos, criterios, límites y requisitos de evidencia. Los errores muestran la fila original; corrige el archivo y vuelve a cargarlo.
5. Sin errores, pulsa **Crear protocolo con N casos**. Luego selecciona el protocolo para crear una ejecución FAT en una unidad con ensamble completado.

La vista previa no escribe datos. El guardado reutiliza la creación transaccional de protocolos y su validación del servidor. Repetir un código crea la siguiente versión, no sustituye protocolos anteriores ni modifica ejecuciones existentes. El archivo original no se conserva: se guardan los casos normalizados. No se importan resultados, firmas ni aprobaciones.

## Columnas

| Encabezado del ejemplo | Campo | Regla |
| --- | --- | --- |
| posicion | position | Entero positivo único; si se omite se asigna consecutivo |
| seccion | section | Opcional |
| nombre | name | Obligatorio |
| instrucciones | instructions | Opcional |
| criterio_aceptacion | acceptanceCriteria | Obligatorio |
| tipo | resultType | BOOLEAN, NUMERIC o TEXT; vacío = BOOLEAN |
| minimo | minimumValue | NUMERIC requiere al menos uno de los límites |
| maximo | maximumValue | No puede ser inferior al mínimo |
| unidad | unit | Opcional, por ejemplo V, bar o mm |
| obligatorio | required | Sí/no, true/false, 1/0; vacío = sí |
| evidencia_obligatoria | evidenceRequired | Sí/no, true/false, 1/0; vacío = no |

Se aceptan encabezados en español o los nombres de campo en inglés, sin distinguir mayúsculas, tildes, espacios o guiones bajos. También se aceptan tipos `booleano`, `numérico` y `texto`. No se aceptan columnas desconocidas o duplicadas.

Formatos: `.xlsx`, `.xls` binario y `.csv` UTF-8. Límite: 2 MB y 500 casos. CSV admite coma o punto y coma como delimitador; para números con coma decimal utiliza punto y coma o entrecomilla la celda. No uses separadores de miles. No se recortan silenciosamente archivos con más de 500 filas de datos. Hojas adicionales generan una advertencia.

## API y pruebas

- `POST /manufacturing/fat-templates/import/preview`: multipart con un archivo en `file`. Devuelve filas normalizadas, errores y advertencias; no persiste datos.
- `GET /manufacturing/fat-templates/import/example?format=xlsx|csv`: descarga autenticada del ejemplo.
- `POST /manufacturing/fat-templates`: ruta existente para guardar código, nombre, descripción y casos validados.

Desde API: `npm run test:manufacturing` y `npm run test:manufacturing:fat-import:integration`. La integración necesita PostgreSQL; crea datos temporales en una transacción que se revierte, sin modificar protocolos reales.
