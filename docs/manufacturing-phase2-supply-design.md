# Manufactura — Fase 2, Incremento 1: plan de abastecimiento

## Estado de implementación

Implementado y validado el 19 de agosto de 2026. Incluye persistencia, API, interfaz, auditoría, control de concurrencia y prueba integral con base de datos.

## Objetivo

Transformar una liberación de Ingeniería vigente en necesidades de material trazables, sin crear todavía movimientos ni reservas reales de Inventario.

## Alcance

- Un plan por liberación de Ingeniería.
- Una necesidad por línea de la BOM liberada.
- Fotografía de código, descripción, unidad, cantidades, estrategia y criticidad.
- Cálculo `cantidad por máquina × cantidad de la OF`.
- Fotografía de existencias, reservas y disponibilidad al generar el plan.
- Cobertura automática únicamente para líneas `STOCK` vinculadas a Inventario, sin duplicar disponibilidad entre líneas del mismo artículo.
- Faltante y cantidad a abastecer.
- Clasificación `STOCK`, `BUY`, `MAKE` o `SUBCONTRACT`.
- Inclusión manual de líneas opcionales.
- Seguimiento operativo básico y referencias externas de compra/fabricación.
- Historial por liberación; un nuevo plan deja el anterior como reemplazado.

## Exclusiones de este incremento

- No modifica `stockOnHand` ni `stockReserved`.
- No crea movimientos `RESERVATION`, `CONSUMPTION` ni `ENTRY`.
- No crea todavía órdenes de compra formales, recepciones, operaciones de fabricación ni contratos con terceros.
- No permite generar un plan desde una liberación que no esté vigente.

## Flujo

```text
Liberación RELEASED -> generar plan ACTIVE
Plan anterior ACTIVE -> SUPERSEDED

Necesidad:
OPEN -> IN_PROGRESS -> PARTIAL -> FULFILLED
  +-------------------------------> CANCELED
```

La estrategia y la inclusión de opcionales pueden ajustarse mientras la necesidad no esté cumplida o cancelada. Las cantidades de Ingeniería permanecen como fotografía inmutable.

## Siguiente incremento

Reservas por bodega para `STOCK` y solicitudes formales diferenciadas para `BUY`, `MAKE` y `SUBCONTRACT`.
