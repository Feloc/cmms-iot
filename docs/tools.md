# Herramientas

Sección `/tools` del menú principal, con registro individual o por cantidad, ficha, fotografía privada, ubicación de almacenamiento, responsable habitual, entregas, devoluciones parciales e historial paginado.

## Permisos

Todos los usuarios autenticados pueden consultar las herramientas de su compañía. ADMIN registra, edita, importa, carga fotografías, ingresa unidades y cambia condiciones o da de baja. ADMIN y TECH registran entregas y devoluciones. VIEWER tiene acceso de lectura. El receptor puede ser cualquier usuario de la misma compañía.

Las referencias a herramientas, préstamos y usuarios siempre se validan con el tenant de la sesión, nunca con un tenant recibido en el cuerpo. Las relaciones de préstamos, fotografías e historial usan una clave foránea compuesta con tenantId.

## Cantidades y trazabilidad

- Individual: cantidad total 1, con serial opcional. Cada unidad tiene código propio.
- Por cantidad: grupo de herramientas iguales sin serial; permite ingresos adicionales.
- Los saldos se distribuyen entre disponibles, prestadas, mantenimiento, dañadas y dadas de baja. Las bajas conservan la cantidad histórica registrada.
- Solo se entregan unidades disponibles en buena condición. Cada préstamo registra receptor, destino, cantidad, quién entrega, fecha, observaciones y devolución prevista opcional.
- Una devolución puede ser parcial y destinar las unidades a disponibles, mantenimiento o dañadas. Las devoluciones con novedad requieren una observación. Las unidades regresan a la ubicación de almacenamiento actual de la ficha.
- Los cambios de condición solo afectan unidades presentes, requieren motivo y no reactivan bajas. Una unidad prestada se devuelve antes de cambiar su condición.
- La ficha permite cambiar metadatos, ubicación y responsable habitual; los préstamos abiertos conservan el receptor y destino originales.
- Cada modificación toma un bloqueo transaccional por compañía y comprueba la versión original enviada por la pantalla. Los saldos, préstamos y eventos se guardan en una sola transacción.
- El historial se conserva sin borrado y se consulta en páginas de 30 movimientos. La ficha muestra todas las entregas abiertas y las 20 últimas cerradas.

## Importación y fotografías

La plantilla está en `apps/web/public/templates/template-tools.csv`. Encabezados: codigo, nombre, categoria, control, cantidad, marca, modelo, serial, ubicacion, responsable_email, fecha_compra, observaciones. Son obligatorios codigo, nombre, control, cantidad y ubicacion. Control acepta INDIVIDUAL / CANTIDAD o UNIT / QUANTITY; fechas AAAA-MM-DD. El email opcional debe existir en la compañía. Los códigos se normalizan a mayúsculas. Se admiten coma o punto y coma, UTF-8 con BOM, campos entre comillas y observaciones con saltos de línea.

Vista previa sin escrituras y confirmación con revalidación completa. Entre 1 y 200 filas, máximo 1 MB. La importación agrega registros nuevos en buena condición y rechaza códigos repetidos; cualquier error revierte la carga completa.

Fotografías PNG, JPEG o WebP de hasta 5 MB, verificadas por firma del archivo y guardadas en PostgreSQL. Se sirven mediante un endpoint autenticado sin caché; no se exponen en los listados. Incluir estas tablas en los respaldos habituales de la base de datos.

## Instalación y validación

Aplicar `db/migrations/64_tools.sql` mediante el runner SQL habitual, regenerar Prisma y reiniciar API/web. La migración es aditiva, transaccional y reejecutable; no usa `db push` sobre los datos de la aplicación. Para una instalación que ya tiene conciliadas y aplicadas las migraciones anteriores:

```bash
docker compose --profile tools run --rm -e MIGRATION_START=64 migrate
docker compose exec api npx prisma generate
```

Pruebas desde `apps/api`:

```bash
npm run test:tools
npm run test:tools:integration
```

La prueba de integración requiere DATABASE_URL y permisos para crear un esquema temporal. Construye el esquema anterior en un namespace aislado, aplica la migración real dos veces y comprueba permisos HTTP, aislamiento de compañías, concurrencia, saldos, importación atómica, fotografías e historial. Elimina el esquema temporal al finalizar. En un contenedor donde `db/migrations` no esté montado, copiar la migración a `/tmp/64_tools.sql` y establecer `TOOLS_MIGRATION_FILE=/tmp/64_tools.sql`.

La vinculación de préstamos con órdenes, etiquetas QR, avisos automáticos y programación de calibraciones quedan para una siguiente etapa.
