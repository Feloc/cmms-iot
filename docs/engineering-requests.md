# Solicitudes de ingeniería

Manual paso a paso para usuarios: [Solicitudes de ingeniería](manuals/solicitudes-de-ingenieria.md).

La primera versión gestiona un equipo por solicitud, enlazado por assetId.
El código, nombre, serie y cliente originales se conservan en assetSnapshot.
Entradas: menú Ingeniería, pestaña Ingeniería del activo, acción del activo, de la OS y del aviso.
La API también admite originNoticeId; ambos orígenes se validan contra el equipo y tenant.

## Flujo y permisos

- ADMIN y TECH pueden crear solicitudes. VIEWER consulta.
- El solicitante puede editar el borrador o complementar información requerida.
- ADMIN autoriza el estudio y asigna responsable de ingeniería, revisor y validador.
- El responsable prepara solución, alcance, materiales, costo/moneda, parada, criterios y afectación documental.
- Enviar a revisión crea una copia inmutable de la propuesta y sus adjuntos.
- El revisor o ADMIN aprueba la ejecución; el autor de la propuesta no puede aprobarla.
- Una devolución permite una nueva revisión sin modificar las anteriores.
- La ejecución exige revisión aprobada y al menos una OT/OS vinculada.
- El validador puede devolver a ejecución o cerrar con criterios cumplidos, resultado y actualización documental registrados.
- El cierre exige todas las órdenes vinculadas completadas/cerradas; terminar una orden no cierra la solicitud.
- ADMIN puede rechazar, cancelar o poner en espera con motivo. Retomar restaura el estado anterior.
- Cada escritura utiliza version para rechazar cambios simultáneos; registro e historial se guardan en una transacción.

Los archivos pertenecen al activo y a la solicitud; son acumulativos y no se borran desde el endpoint genérico de adjuntos.
Cada carga registra una huella SHA-256. Las propuestas aprobadas referencian una revisión exacta.
Las órdenes se vinculan/desvinculan en Aprobada o En ejecución, con registro en historial.
Crear una OS y gestionar consumos utiliza las pantallas existentes.

## Fabricación de componentes

En la pestaña Ejecución, ADMIN puede crear una OF de componente del catálogo activo
o vincular una OF SPARE_PART en borrador sin otra solicitud ni demanda posventa.
La solicitud debe estar Aprobada o En ejecución. Una OF pertenece a una sola solicitud;
una solicitud puede tener varias OF. TECH y VIEWER consultan el avance sin modificar vínculos.

Cada vínculo conserva la revisión aprobada exacta, visible también desde la OF.
Crear OF, asignar equipo, numerar, vincular e historizar ocurre en una transacción.
La propuesta no reemplaza la aprobación de documentos, BOM o liberaciones de fabricación.
La producción, calidad y recepción al inventario siguen el flujo existente.
La recepción no instala el componente ni registra automáticamente su consumo en la OT/OS.

La desvinculación exige motivo y OF en borrador o cancelada. No elimina la OF ni su historial.
El cierre exige todas las OF vinculadas COMPLETED, además de OT/OS completadas/cerradas.
Una OF cancelada debe desvincularse en Aprobada/En ejecución; desde Validación,
primero se devuelve la solicitud a ejecución. No se cierra una reforma automáticamente.
Para cancelar una solicitud deben estar canceladas o completadas todas sus OF.

## Instalación y pruebas

Aplicar db/migrations/52_engineering_requests.sql y db/migrations/57_engineering_manufacturing.sql con el ejecutor habitual de migraciones.
Regenerar Prisma (npx prisma generate) y reiniciar la API.
No requiere nuevas variables de entorno.

Desde apps/api:

    node --test -r ts-node/register/transpile-only test/engineering-requests.spec.ts
    node -r ts-node/register/transpile-only test/engineering-requests.integration.ts

La integración requiere una base local migrada. Crea dos tenants temporales y elimina
exclusivamente sus datos al terminar.

## Alcance posterior

Esta versión no modifica la configuración del equipo ni documentos automáticamente:
el cierre registra qué se actualizó y permite adjuntar el resultado.
La ingeniería documental de fabricación mantiene su estructura actual.
Liberaciones documentales independientes, fabricación fuera del catálogo, cambios de
alcance después de aprobar y campañas para varios equipos requieren una ampliación.
