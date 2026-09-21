# Estabilización y control operativo de manufactura

## Uso

En **Manufactura → Abrir control operativo** (`/manufacturing/control`) se muestran órdenes, responsable, fecha solicitada, avance por unidad, etapa pendiente, bloqueos y siguiente acción. El resumen de cada OF incorpora el mismo control.

El porcentaje mide hitos, no horas ni costo ejecutado. Para equipos, el recorrido es ingeniería, abastecimiento, kits, ensamble, FAT, despacho, montaje en cliente, SAT y entrega final. Los repuestos terminan con recepción de producto; la modalidad abreviada deriva sus hitos de fabricación/calidad/recepción. Los faltantes de otras unidades no hacen retroceder una máquina ya despachada. Las unidades canceladas no cuentan en el avance.

El listado está paginado a 25 órdenes. Los contadores de alertas corresponden explícitamente a la página visible. Incluye búsqueda por número/proyecto y filtro de cerradas. No pronostica fechas ni capacidad de planta. Usa el botón **Actualizar control** para refrescar tras operar en otra pestaña.

## Integridad y permisos

- La migración `51_manufacturing_integrity.sql` añade/valida restricciones omitidas en bases previamente creadas mediante `db push`. No corrige datos silenciosamente: falla si encuentra inconsistencias.
- Se exige `instalado ≤ recibido ≤ solicitado`, entrega directa no mayor que lo recibido y cantidades/versiones válidas. El flujo abreviado solo corresponde a repuestos. Sus relaciones de artículo, perfil y OF incluyen validación de tenant en PostgreSQL.
- El inventario de producto terminado utiliza incremento atómico y bloqueo del artículo. Se mantiene la separación entre recepción, entrega directa e instalación.
- Una demanda cumplida no vuelve a abrirse cambiando cantidades/estado. Una demanda pausada no puede generar una OF. No se permite enviar simultáneamente cantidad recibida y estado: el estado se deriva de cantidades.
- Los cuerpos de las rutas de manufactura y las tres escrituras de demandas posventa se validan contra sus DTO: estructura, tipos, campos desconocidos, enumeraciones, tamaños y versiones. No se cambia globalmente la validación de otros módulos.
- ADMIN conserva las acciones administrativas; TECH necesita ser responsable o miembro operativo de la OF. OBSERVER no obtiene permisos de escritura por pertenecer a una orden. VIEWER es de consulta en manufactura. Los permisos particulares de ingeniería/revisión siguen aplicándose en los servicios. No se introducen nuevos roles de compras, almacén o calidad en este incremento.
- FAT, aceptación SAT, autorización de despacho, aprobación de perfil e inspección abreviada comprueban separación entre ejecutor y aprobador. Si coincide el usuario, se exige una excepción de 20–2000 caracteres. La interfaz permite registrarla y queda conservada en auditoría o en el perfil aprobado. Esto no equivale a una prohibición absoluta de autoaprobación.
- Quitar la última capacitación o repuesto restablece a pendiente el documento generado correspondiente; no invalida referencias externas independientes. No permite modificar expedientes de órdenes pausadas/cerradas.

Los contratos se generan mediante `node scripts/manufacturing-contracts.cjs` desde `apps/api`; su salida JSON debe mantenerse en `src/modules/manufacturing/manufacturing-contracts.json` cuando cambie un DTO. La suite detecta divergencias. El JSON del flujo abreviado nuevo incorpora `schemaVersion: 1`; esto no migra retrospectivamente los registros existentes.

## Migraciones y despliegue

El arranque de producción ejecuta `scripts/run-sql-migrations.sh`: bloqueo asesor de sesión, historial y checksum por archivo nuevo. Un checksum distinto de una migración ya registrada detiene el proceso. Los registros históricos sin checksum se conservan sin inventar verificación. Las migraciones antiguas que añaden enums requieren autocommit; cada archivo debe ser reejecutable si falló antes de registrar su historial.

No se ejecuta `prisma db push --accept-data-loss`, ni en producción ni en el arranque de desarrollo. El cliente Prisma se genera durante la construcción de la imagen de producción y se copia desde esa etapa. En desarrollo las migraciones deben aplicarse explícitamente antes de usar una base nueva.

Si existe `WorkOrder` pero no está registrada `10_schema_no_privs.sql`, el arranque de producción **se detiene**. Antes de desplegar sobre una base heredada:

1. Hacer respaldo y verificar restauración en un entorno aislado.
2. Comparar el esquema real con las migraciones históricas y reconciliar las diferencias; no marcar archivos masivamente como aplicados sin comprobarlos.
3. Registrar únicamente las migraciones cuya equivalencia se haya verificado y ejecutar las restantes con el runner.
4. Regenerar el cliente/build y comprobar inicio y suites en ese entorno antes de promover.

`MIGRATION_START=45` permite una reconciliación expresamente acotada; no es un valor por defecto ni reemplaza la auditoría del baseline completo. Las restricciones SQL adicionales son deliberadas: Prisma no representa todos los CHECK ni las FK compuestas adicionales; no volver a sincronizar con `db push`.

En la base local de esta implementación se reconciliaron 45–48 y se aplicó 51; 49–50 ya figuraban en el historial. La segunda ejecución de 45–51 no reaplicó archivos. Se dejó respaldo previo en el contenedor PostgreSQL: `/tmp/cmms-manufacturing-MifFbH/before-stabilization.dump`. Ese archivo es temporal, no un respaldo externo ni una verificación de restauración. El baseline anterior a manufactura queda pendiente de verificación para producción; no se desplegó una imagen de producción.

## Verificación

Desde `apps/api`, con dependencias instaladas:

```sh
npm run test:manufacturing
npm run test:manufacturing:integration
npm run build
```

La integración necesita PostgreSQL con las migraciones hasta 51 y el cliente generado. Ambos escenarios usan tenants temporales y transacciones que se revierten incluso si falla una aserción; no reutilizan cuentas ni órdenes reales.

- Suite unitaria/HTTP: contratos, tipos anidados, permisos antes de escritura, separación de aprobación, cantidades, transiciones, tablero multiunidad y regresión por faltantes.
- Integración estándar: abastecimiento parcial/rechazos/cuarentena, reservas, kits, ensamble, rechazo/repetición FAT, despacho, recepción técnica, creación del montaje real, ejecución y firmas, SAT condicionado y resolución, expediente documental, eliminación de capacitación/repuesto, entrega final y traspaso a mantenimiento. Comprueba que entregar una unidad no cierra una OF con otras unidades pendientes; el escenario de cierre final cancela las otras unidades únicamente como preparación del fixture.
- Integración abreviada: perfil independiente, aislamiento entre tenants, restricciones de base de datos, materiales, producción, calidad/retrabajo, recepción parcial, entrega directa sin doble descuento, instalación, disposición, pausa y cancelación.

La prueba HTTP utiliza los controladores/guard/pipe reales con un servicio de escritura simulado; las integraciones ejercitan servicios reales y PostgreSQL. No sustituyen una prueba visual en navegador ni una prueba de carga/concurrencia con conexiones independientes.
