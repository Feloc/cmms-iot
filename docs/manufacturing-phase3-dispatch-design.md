# Fase 3 — Despacho y logística de salida por unidad

## Objetivo

Controlar la preparación, autorización, salida y entrega de cada máquina fabricada mediante un expediente logístico único por unidad.

El despacho no reemplaza la aceptación de calidad. Su creación y autorización dependen del último FAT aprobado de la unidad.

## Estados

- `DRAFT`: expediente creado y editable.
- `PREPARING`: embalaje, checklist, bultos y documentos en preparación.
- `READY`: embalaje cerrado y validado.
- `AUTHORIZED`: salida firmada por un administrador.
- `DISPATCHED`: unidad entregada al transportista y en tránsito.
- `DELIVERED`: recepción confirmada con soporte.
- `CANCELED`: preparación cancelada antes de la salida.

Un expediente cancelado puede reabrirse si la compuerta FAT continúa abierta. No se permite cancelar una unidad que ya salió o fue entregada.

## Creación y compuerta FAT

Solo un administrador puede crear el expediente. El servicio consulta el intento FAT más reciente y exige estado `APPROVED`.

El despacho conserva la relación directa con ese intento FAT. Al autorizar la salida se vuelve a consultar el último intento para comprobar que sigue siendo el mismo y continúa aprobado.

Cada unidad y cada FAT aprobado admiten un solo expediente de despacho.

## Datos logísticos

El expediente registra:

- serial congelado al cerrar el embalaje;
- destino y dirección de entrega;
- contacto y teléfono;
- responsable interno;
- transportista y referencia comercial;
- conductor y placa;
- guía o número de seguimiento;
- fecha planeada, autorización, salida y entrega.

Antes de marcar el embalaje como listo son obligatorios serial, destino, dirección y transportista.

## Checklist de embalaje

Al crear el expediente se generan controles estándar para:

1. identificación y serial;
2. anclaje y protección mecánica;
3. protección ambiental;
4. accesorios y repuestos;
5. documentación incluida;
6. registro fotográfico final.

Los controles de identificación y registro fotográfico exigen referencia de evidencia. Los controles obligatorios no pueden omitirse.

## Bultos

Cada bulto recibe un código consecutivo derivado del despacho. Se registra tipo, descripción, dimensiones, peso neto y bruto, serial, sello y notas.

El sistema valida valores positivos y evita que el peso neto supere el peso bruto. Para cerrar el embalaje debe existir al menos un bulto.

## Documentos

Se admiten referencias o URL para:

- lista de empaque;
- documento de transporte;
- factura comercial;
- seguro;
- certificados;
- manuales;
- informe FAT;
- otros documentos.

La lista de empaque es obligatoria para cerrar el embalaje. El documento de transporte es obligatorio para confirmar la salida.

La carga binaria puede añadirse en un incremento posterior utilizando la infraestructura existente de adjuntos.

## Autorización, salida y entrega

Solo un administrador puede autorizar la salida. La autorización conserva nombre, rol y fecha del firmante.

Confirmar la salida exige autorización, documento de transporte y número de seguimiento. Se registra quién despacha, transportista, conductor, placa y fecha.

La entrega exige nombre del receptor y referencia de soporte, por ejemplo POD, remesa firmada o acta de recibo.

Todas las acciones generan eventos de auditoría dentro de la orden de manufactura.

## Interfaz implementada

La pestaña **Despacho** permite:

- crear expedientes para unidades con FAT aprobado;
- editar datos logísticos y responsable;
- completar checklist con evidencias;
- registrar bultos, dimensiones, pesos y sellos;
- agregar documentos;
- cerrar embalaje y autorizar salida;
- confirmar tránsito y entrega;
- cancelar y reabrir expedientes antes de la salida.

## Validación integral

La prueba automatizada recorre ingeniería, abastecimiento, kits, ensamble, dos intentos FAT, preparación logística, checklist, bulto, documentos, autorización, salida y entrega.

También comprueba los rechazos esperados cuando falta FAT aprobado, cuando la logística está incompleta y cuando se intenta despachar sin documento de transporte.

## Siguiente incremento

El siguiente incremento recomendable es **recepción en sitio, instalación y SAT**: acta de recibo, inspección por daños de transporte, montaje en cliente, pendientes de instalación, pruebas SAT, aceptación del cliente y transferencia final de la máquina al registro de activos.
