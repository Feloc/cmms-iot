# Importar protocolos FAT desde Excel o CSV

En una orden de manufactura, abre **Pruebas FAT → Importar protocolo FAT desde Excel / CSV**. Disponible para ADMIN, igual que la creación manual de protocolos.

1. Selecciona **Puntos y subpuntos** (predeterminado) o **Solo puntos** y descarga el ejemplo Excel o CSV desde la pantalla.
2. Completa una fila por punto o subpunto. En Excel se usa solamente la primera hoja, con encabezados en la fila 1. Se rechazan celdas combinadas y fórmulas, incluidos los encabezados: pega valores.
3. Introduce código, nombre y descripción opcional del protocolo en la pantalla.
4. Selecciona el archivo y pulsa **Validar y previsualizar**. Revisa casos, criterios, límites y requisitos de evidencia. Los errores muestran la fila original; corrige el archivo y vuelve a cargarlo.
5. Sin errores, pulsa **Crear protocolo: N puntos y M subpuntos**. Luego selecciona el protocolo para crear una ejecución FAT en una unidad con ensamble completado.

La vista previa no escribe datos. El guardado reutiliza la creación transaccional de protocolos y su validación del servidor. Repetir un código crea la siguiente versión, no sustituye protocolos anteriores ni modifica ejecuciones existentes. El archivo original no se conserva: se guardan los casos normalizados. No se importan resultados, firmas ni aprobaciones.

## Columnas

| Encabezado del ejemplo | Campo | Regla |
| --- | --- | --- |
| posicion | position | Entero positivo único en todo el archivo; obligatorio si hay subpuntos. En archivos planos puede omitirse y se asigna consecutivo |
| punto_padre | parentPosition | Vacío = punto principal. En subpuntos indica la posicion del punto principal |
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

## Jerarquía

Ejemplo mínimo (CSV separado por punto y coma):

```csv
posicion;punto_padre;seccion;nombre;criterio_aceptacion;tipo;minimo;maximo;unidad;obligatorio;evidencia_obligatoria
20;;Eléctrica;Inspección eléctrica;Instalación conforme al plano;BOOLEAN;;;;sí;no
21;20;;Continuidad de tierra;Resistencia máxima de 1 ohm;NUMERIC;0;1;ohm;sí;sí
22;20;;Identificación de conductores;Etiquetas coincidentes con plano;BOOLEAN;;;;sí;no
30;;Mecánica;Inspección mecánica;Ensamble conforme;BOOLEAN;;;;sí;no
```

- Solo se admite **un nivel**. No se permiten padres inexistentes, autorreferencias, ciclos, posiciones duplicadas ni un subpunto como padre.
- Los padres pueden aparecer después de sus hijos. Se ordenan los puntos y los subpuntos por su `posicion`; no se deduce jerarquía por cercanía de filas o por decimales como `20.1`.
- `posicion` identifica y ordena la fila de importación, no es un ID de base de datos ni una referencia a otro protocolo. En la ejecución, los subpuntos se numeran visualmente como `20.1`, `20.2`, etc. La posición original del subpunto no se conserva como campo del protocolo: se conserva su orden dentro del padre.
- La sección del subpunto se hereda del punto principal. Déjala vacía o repite exactamente la del padre; una sección diferente se marca como error, no se descarta silenciosamente.
- Los subpuntos tienen instrucciones, criterio, tipo, límites, obligatoriedad y evidencia propios; no heredan esos requisitos del padre. Sus valores predeterminados siguen siendo obligatorio = sí y evidencia = no.
- Hasta **500 filas totales de datos** (puntos + subpuntos) y **50 subpuntos por punto**. El límite de filas incluye el rango físico de la hoja; filas vacías intermedias no permiten superar el máximo.
- Se aceptan también `posicion_padre`, `padre`, `parentPosition` y `parent_position`. En un archivo con jerarquía todas las posiciones deben ser explícitas. Sin subpuntos se mantiene el comportamiento anterior.
- La vista previa válida agrupa hijos bajo su padre y muestra fila original, posición, requisitos y totales. Si hay errores se muestran en el orden original del archivo. No se genera una estructura parcialmente guardable.

No se importan novedades ni resultados de prueba. Crear el protocolo no ejecuta ni aprueba sus puntos. Las reglas de evaluación y las evidencias son las mismas de los [subpuntos FAT](manufacturing-fat-subpoints.md).

## API y pruebas

- `POST /manufacturing/fat-templates/import/preview`: multipart con un archivo en `file`. Devuelve `rows` (diagnóstico por fila, con `parentPosition`), `cases` (puntos con `subpoints` anidados), `hierarchical`, `rootCount`, `subpointCount`, errores y advertencias; no persiste datos. Si existe cualquier fila inválida, `cases` está vacío.
- **Guardar `preview.cases`, no `preview.rows.map(r => r.data)`**: lo segundo perdería la relación jerárquica. Las filas se conservan para diagnóstico y compatibilidad de las vistas previas planas, no como payload jerárquico.
- `GET /manufacturing/fat-templates/import/example?format=xlsx|csv&layout=flat|hierarchical`: descarga autenticada del ejemplo. Omitir `layout` conserva el ejemplo plano anterior; la interfaz selecciona jerárquico por defecto.
- `POST /manufacturing/fat-templates`: ruta existente para guardar código, nombre, descripción y casos validados.

Desde API: `npm run test:manufacturing` y `npm run test:manufacturing:fat-import:integration`. La integración necesita PostgreSQL; crea datos temporales en una transacción que se revierte, sin modificar protocolos reales.

La suite comprueba XLSX/XLS/CSV, errores de referencias, orden de filas, 50 subpuntos, fórmulas, celdas combinadas, payload HTTP anidado, persistencia, versiones y aislamiento. `npm run test:manufacturing:integration` recorre un CSV jerárquico hasta ejecución FAT, despacho, montaje y entrega final. Compilar API y verificar tipos web. No se requiere una nueva migración: se reutiliza el esquema de subpuntos de la migración 59. La revisión visual en navegador se valida aparte.
