# Manufactura — Fase 2, Incremento 5: kits y liberación a ensamble

## Estado de implementación

Implementado y validado el 24 de agosto de 2026. Incluye persistencia, API transaccional, interfaz, asignación global, excepciones, liberación firmada, auditoría y prueba integral con base de datos.

## Objetivo

Preparar un kit trazable por unidad fabricada y establecer una puerta formal antes de iniciar el ensamble.

## Estructura

Cada unidad `PLANNED` recibe un `ManufacturingKit` asociado al plan y a la liberación de Ingeniería vigentes. Sus líneas se generan desde las necesidades incluidas y requieren la cantidad por máquina fijada en la BOM.

Estados: `DRAFT`, `PREPARING`, `READY`, `RELEASED` y `CANCELED`.

## Disponibilidad y asignación

- La disponibilidad global proviene de `fulfilledQuantity`: material `STOCK` entregado y material externo aceptado por Calidad.
- La asignación a un kit no modifica inventario; distribuye material de proyecto ya liberado físicamente.
- La suma asignada entre kits nunca puede superar la cantidad aprobada de la necesidad.
- Una cantidad asignada puede retirarse mientras el kit no esté liberado.

## Faltantes y excepciones

Cada línea calcula `requerido - asignado - excepción`. Una excepción exige cantidad, motivo, responsable y fecha. Puede modificarse o retirarse antes de liberar el kit.

Un kit queda `READY` únicamente cuando todas sus líneas están totalmente asignadas o cubiertas por una excepción explícita.

## Liberación

La liberación conserva usuario, fecha y notas. Los kits liberados son inmutables y representan autorización formal para iniciar el ensamble de la unidad.

Los kits activos bloquean la cancelación de la unidad, la cancelación de la orden y una nueva liberación de Ingeniería. Deben cancelarse explícitamente para liberar sus asignaciones.

## Exclusiones

- Creación automática de una `AssemblyExecution`; el módulo actual de montajes está vinculado a órdenes de trabajo de campo.
- Consumo por operación de ensamble y devoluciones desde estación.
- Kits por subconjunto y ubicación física del contenedor.
