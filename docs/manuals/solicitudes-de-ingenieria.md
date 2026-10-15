# Manual de uso: solicitudes de ingeniería

## 1. Objetivo

Utilice una solicitud de ingeniería para gestionar una reforma, mejora, adaptación
o solución de obsolescencia de un equipo, desde la identificación del problema
hasta la validación del resultado.

Cada solicitud corresponde a **un solo equipo** y conserva su información original
(código, nombre, serie y cliente), la propuesta técnica, sus revisiones, las órdenes
vinculadas y el historial de decisiones.

**Diferencia entre documentos:**

| Documento | Para qué sirve |
| --- | --- |
| Solicitud de ingeniería | Define el problema, estudia y aprueba la solución, y valida la reforma. |
| OT/OS: orden de trabajo o de servicio | Gestiona la intervención sobre el equipo, las actividades y los consumos correspondientes. |
| OF: orden de fabricación | Gestiona la fabricación y recepción de componentes cuando la solución lo necesita. |

Una solicitud no reemplaza las órdenes de ejecución. Completar una OT, OS u OF
**no cierra automáticamente** la solicitud.

## 2. Participantes y permisos

| Participante | Acciones principales |
| --- | --- |
| Solicitante | Crea la solicitud, edita el borrador, completa información y la envía. |
| Administrador (ADMIN) | Autoriza el estudio, asigna responsables, rechaza, pausa, retoma o cancela. También crea y gestiona vínculos con OF. |
| Responsable de ingeniería | Elabora la propuesta, la envía a revisión, vincula OT/OS e inicia la ejecución y la validación. |
| Revisor técnico | Aprueba la ejecución o devuelve la propuesta a estudio. |
| Responsable de validación | Comprueba el resultado, solicita correcciones o valida y cierra. |
| Usuario de consulta (VIEWER) | Consulta las solicitudes, sin modificarlas. |

El solicitante debe tener perfil ADMIN o TECH. El responsable, revisor y validador
se asignan entre usuarios ADMIN o TECH de la misma empresa.

El administrador puede realizar las acciones de los participantes, con una excepción:
**nadie puede aprobar una propuesta de la que sea el autor, tampoco un administrador**.
Responsable de ingeniería y revisor deben ser personas distintas.

Los botones disponibles dependen del perfil, la asignación y el estado de la solicitud.
El acceso al detalle de una OF también conserva los permisos propios de Manufactura.

## 3. Flujo general

Borrador → Solicitada → En estudio → En revisión → Aprobada →
En ejecución → En validación → Cerrada.

También existen estos caminos:

- **Información pendiente:** el administrador solicita aclaraciones antes de autorizar el estudio.
- **Devolver a estudio:** el revisor pide ajustar la propuesta antes de aprobarla.
- **Solicitar corrección:** el validador devuelve la solicitud a ejecución.
- **En espera:** el administrador pausa el trámite; Retomar recupera el estado anterior.
- **Rechazada o Cancelada:** finaliza el trámite sin cerrar una reforma validada.

## 4. Ingresar y encontrar una solicitud

1. Inicie sesión en la empresa correspondiente.
2. Abra **Ingeniería** en el menú principal.
3. Utilice **Buscar** para localizar por número, título, código del equipo o cliente.
4. Si lo necesita, filtre por **Estado**, **Prioridad** y **Responsable**.
5. Pulse el número de la solicitud para abrirla.

También puede ingresar desde **Activos → equipo → Ingeniería** para ver únicamente
las solicitudes de ese equipo.

El icono de actualización recarga el listado. Dentro del detalle, **Recargar solicitud**
actualiza el estado y el avance de las órdenes.

## 5. Crear la solicitud

**Quién:** solicitante con perfil ADMIN o TECH.  
**Resultado:** Borrador.

1. Pulse **Nueva solicitud** desde Ingeniería.
2. Busque y seleccione el **Equipo**.
3. Complete los campos del formulario.
4. Revise especialmente el equipo seleccionado.
5. Pulse **Crear solicitud**.

También puede pulsar **Solicitar reforma o mejora** desde el detalle de un activo,
una OS o un aviso. En esos accesos se carga el equipo de origen; desde una OS o aviso
se conserva además la referencia de origen.

| Campo | Qué registrar | Ejemplo |
| --- | --- | --- |
| Título | Un nombre concreto para el cambio. | Mejorar guía de descarga. |
| Tipo | Reforma, Mejora, Adaptación u Obsolescencia. | Mejora. |
| Disciplina | General, Mecánica, Eléctrica, Neumática, Hidráulica, Automatización, Software o Calidad. | Mecánica. |
| Prioridad | Baja, Media, Alta o Urgente. | Alta. |
| Fecha deseada | Fecha objetivo, si se conoce; es opcional. | Fecha de la próxima parada programada. |
| Problema actual | Qué ocurre, dónde, con qué frecuencia y qué impacto tiene. | La descarga se atasca tres veces por turno. |
| Mejora esperada y justificación | Qué resultado se busca y por qué es necesario. | Reducir las paradas y evitar intervención manual. |

Título, problema y mejora esperada son obligatorios. El sistema asigna el número de
solicitud automáticamente.

El equipo no se cambia desde la edición posterior de la solicitud. Si eligió uno
incorrecto, pida al administrador cancelar el trámite y cree la solicitud correcta.

## 6. Revisar el borrador y enviarlo

**Quién:** solicitante o administrador.  
**Estado requerido:** Borrador.

1. Abra la pestaña **Resumen**.
2. Corrija o amplíe los datos, si es necesario.
3. Pulse **Guardar solicitud** antes de cambiar de pestaña o ejecutar otra acción.
4. En **Archivos**, adjunte fotografías, informes o antecedentes.
5. Pulse **Enviar solicitud**.
6. Agregue un comentario si corresponde y pulse **Confirmar**.

**Resultado:** Solicitada.

Crear la solicitud solo guarda un borrador: debe enviarla para continuar.
Después de enviarla, los datos iniciales solo vuelven a editarse si se solicita información.

## 7. Evaluar y autorizar el estudio

**Quién:** administrador.  
**Estado requerido:** Solicitada.

1. Revise **Resumen**, **Archivos** y los antecedentes de origen.
2. Elija la decisión correspondiente.

### Autorizar estudio

1. Pulse **Autorizar estudio**.
2. Seleccione **Responsable de ingeniería**, **Revisor técnico** y
   **Responsable de validación**.
3. Verifique que responsable y revisor sean distintos.
4. Registre un comentario si corresponde.
5. Pulse **Confirmar**.

**Resultado:** En estudio.

### Solicitar información

1. Pulse **Solicitar información**.
2. Indique obligatoriamente qué hace falta y confirme.
3. El solicitante revisa el motivo en **Historial**.
4. El solicitante completa los datos en **Resumen**, guarda y adjunta evidencias si corresponde.
5. Pulsa **Enviar solicitud**, registra la respuesta en el comentario obligatorio y confirma.

**Resultado:** vuelve a Solicitada para una nueva evaluación.

### Rechazar

Pulse **Rechazar**, registre el motivo y confirme.
**Resultado:** Rechazada. Esta acción también está disponible para el administrador
durante En revisión.

## 8. Elaborar la propuesta técnica

**Quién:** responsable de ingeniería o administrador.  
**Estado requerido:** En estudio.

1. Abra **Propuesta**.
2. Mantenga el selector **Revisión** en **Propuesta actual**.
3. Complete todos los campos.
4. Pulse **Guardar propuesta**.
5. Adjunte los documentos de soporte en **Archivos** antes de enviarla a revisión.
6. Pulse **Enviar a revisión** y confirme.

| Campo | Contenido esperado |
| --- | --- |
| Solución propuesta | Descripción técnica del cambio. |
| Alcance | Qué se modificará y qué queda fuera del trabajo. |
| Materiales y componentes | Piezas, materiales o recursos necesarios. Si no aplica, indíquelo. |
| Costo estimado | Importe estimado no negativo. No es el costo real ejecutado. |
| Moneda | COP, USD o EUR. |
| Parada estimada (horas) | Tiempo previsto de indisponibilidad, no negativo. |
| Criterios de aceptación | Condiciones medibles para considerar satisfactoria la mejora. |
| Documentos y mantenimiento afectados | Planos, manuales, configuración o planes que deberán actualizarse. |

**Ejemplo de criterio:** “Operar dos horas a la velocidad acordada, sin atascos
y sin intervención manual en la descarga”.

**Resultado:** En revisión. El sistema crea una revisión numerada con una copia
de la propuesta y la relación de archivos existentes en ese momento.

Los archivos cargados después siguen en el expediente, pero no se incorporan
retroactivamente a una revisión anterior.

## 9. Revisar y aprobar la propuesta

**Quién:** revisor técnico o administrador distinto del autor.  
**Estado requerido:** En revisión.

1. Abra **Propuesta** y consulte la revisión correspondiente.
2. Revise alcance, materiales, costos, parada y criterios de aceptación.
3. Consulte los archivos de esa revisión.
4. Si hacen falta ajustes, pulse **Devolver a estudio**, registre el motivo y confirme.
5. El responsable corrige, guarda y vuelve a pulsar **Enviar a revisión**.
6. Cuando sea conforme, pulse **Aprobar ejecución** y confirme.

**Resultado:** Aprobada. La solicitud identifica la revisión autorizada.

Cada nuevo envío a revisión crea otra versión; las anteriores permanecen disponibles.
La propuesta aprobada no se edita directamente. **Solicitar corrección** durante la
validación devuelve a ejecución, no reabre el estudio ni permite cambiar el alcance aprobado.
Los cambios posteriores de alcance requieren acordar un nuevo trámite; no sobrescriba
la propuesta autorizada.

## 10. Vincular la OT/OS de intervención

**Quién:** responsable de ingeniería o administrador.  
**Estado requerido:** Aprobada o En ejecución.

1. Abra **Ejecución**.
2. En **OT/OS del equipo**, seleccione la orden que ejecutará el cambio.
3. Pulse **Vincular**.
4. Compruebe que la orden aparece en **Órdenes vinculadas**.
5. Repita si intervienen varias órdenes.

La orden debe pertenecer al mismo equipo y no estar cancelada.

Si no existe una orden:

1. Pulse **Crear OS** para abrir su formulario en otra pestaña.
2. Cree la OS para el mismo equipo mediante el flujo habitual.
3. Regrese a la solicitud.
4. Pulse **Actualizar órdenes** junto al selector.
5. Seleccione la nueva OS y pulse **Vincular**.

La creación de una OS no la vincula automáticamente. La OS de origen de una solicitud
tampoco sustituye el vínculo explícito de ejecución.

Para retirar una OT/OS vinculada, utilice su icono **Desvincular orden** y registre
un motivo. El vínculo se retira, pero no se elimina la orden.

## 11. Gestionar fabricación, si corresponde

**Quién:** administrador.  
**Estado requerido:** Aprobada o En ejecución.

Este paso es opcional. Úselo cuando la solución aprobada requiera fabricar componentes
registrados en el catálogo de inventario.

### Crear una nueva OF de componente

1. En **Ejecución → Fabricación de componentes**, pulse **Crear OF**.
2. En **Buscar componente**, escriba al menos dos caracteres del nombre o código.
3. Seleccione el **Componente** del catálogo activo.
4. Indique la **Cantidad**, como entero entre 1 y 1000.
5. Registre la **Entrega solicitada**, si aplica.
6. Seleccione el **Responsable de fabricación**.
7. Pulse **Crear OF** en el formulario.

**Resultado:** se crea una OF en borrador y queda vinculada a la solicitud y a su
revisión aprobada. No es necesario volver a vincularla.

Si el componente todavía no existe o está inactivo, resuelva primero su registro
en Inventario. No elija otro artículo solo para poder continuar.

### Vincular una OF existente

1. Pulse **Vincular OF**.
2. Seleccione una OF de componente disponible.
3. Pulse **Vincular OF** en el formulario.
4. Compruebe el vínculo en el listado.

Solo aparecen OF de componentes en borrador, con artículo de salida definido,
sin otra solicitud de ingeniería ni demanda posventa vinculada.
Una solicitud puede tener varias OF; una OF solo puede pertenecer a una solicitud.

### Seguir la fabricación

1. Pulse el número de la OF para abrirla.
2. Consulte **Solicitud de ingeniería** y despliegue **Propuesta aprobada**.
3. Gestione documentos, materiales, producción, calidad y recepción mediante
   el flujo habitual de Manufactura.
4. Regrese a la solicitud y pulse **Recargar solicitud** para consultar el avance.

El listado muestra el estado de la OF, la revisión vinculada y la cantidad recibida
respecto de la cantidad planificada.

La aprobación de la solicitud **no reemplaza** la aprobación documental,
la BOM ni las liberaciones de fabricación.
Recibir el componente en inventario **no lo instala ni registra automáticamente
su consumo en la OT/OS**.

### Desvincular una OF

1. Compruebe que la OF esté en borrador o cancelada.
2. Pulse su icono **Desvincular OF**.
3. Registre el motivo y confirme.

No se permite desvincular una OF en marcha o completada.
La desvinculación no elimina la OF; queda registrada en ambos historiales.

## 12. Iniciar y realizar la ejecución

**Quién:** responsable de ingeniería o administrador.  
**Estado requerido:** Aprobada.

1. Verifique que exista una revisión aprobada y al menos una OT/OS vinculada.
2. Pulse **Iniciar ejecución** y confirme.
3. Realice la intervención a través de las órdenes vinculadas.
4. Registre actividades y consumos en las OT/OS correspondientes.
5. Adjunte evidencias del resultado en **Archivos**.
6. Registre novedades en **Historial → Comentario → Agregar comentario**.

**Resultado:** En ejecución.

Una OF, por sí sola, no permite iniciar la ejecución: siempre debe existir al menos
una OT/OS vinculada para la intervención del equipo.
Iniciar ejecución no completa ni cambia automáticamente el estado de las órdenes.

## 13. Enviar a validación

**Quién:** responsable de ingeniería o administrador.  
**Estado requerido:** En ejecución.

1. Revise el resultado respecto de los criterios de aceptación.
2. Compruebe las evidencias y actualizaciones documentales necesarias.
3. Revise los estados de OT/OS y OF vinculadas.
4. Pulse **Enviar a validación** y confirme.

**Resultado:** En validación.

Como práctica de trabajo, envíe a validación cuando las órdenes estén terminadas.
El bloqueo obligatorio por órdenes pendientes se aplica al **cierre** de la solicitud.

## 14. Validar y cerrar

**Quién:** responsable de validación o administrador.  
**Estado requerido:** En validación.

1. Verifique físicamente o mediante evidencias los criterios de aceptación.
2. Consulte los resultados de las órdenes vinculadas.
3. Si algo no cumple, pulse **Solicitar corrección**, registre el motivo y confirme.
4. El responsable realiza las correcciones en En ejecución y vuelve a enviar a validación.
5. Cuando todo sea conforme, pulse **Validar y cerrar**.
6. Marque **Criterios de aceptación cumplidos**.
7. Complete **Resultado y evidencias de validación**.
8. Complete **Documentos y plan de mantenimiento actualizados**.
9. Pulse **Confirmar**.

Para cerrar se requiere:

- Al menos una OT/OS vinculada y todas las OT/OS completadas o cerradas.
- Todas las OF vinculadas en estado Completada, si existen.
- Confirmación de criterios cumplidos.
- Resultado de validación y registro de actualización documental.

Describa los documentos efectivamente actualizados y su revisión.
Si una actualización no aplica, justifíquelo en el campo; no declare cambios no realizados.

**Resultado:** Cerrada. El cierre y su justificación quedan en **Historial**.
No se admiten nuevos comentarios ni archivos después del cierre.
La aplicación no actualiza automáticamente planos, configuración ni planes de
mantenimiento: esas tareas deben ejecutarse y evidenciarse por separado.

## 15. Pausar, retomar o cancelar

**Quién:** administrador.

| Acción | Procedimiento y efecto |
| --- | --- |
| Poner en espera | Registre el motivo y confirme. Disponible desde Solicitada, En estudio, En revisión, Aprobada, En ejecución o En validación. |
| Retomar | Desde En espera, confirme para volver al estado previo a la pausa. |
| Cancelar solicitud | Registre el motivo y confirme. Disponible mientras la solicitud no esté cerrada, rechazada o cancelada. |

Para cancelar una solicitud, todas sus OF vinculadas deben estar canceladas o completadas.
Incluso una OF en borrador impide cancelar mientras siga vinculada y sin resolver.

Pausar o cancelar la solicitud **no pausa ni cancela automáticamente** las OT/OS u OF.
Coordine las acciones necesarias sobre esas órdenes en sus módulos respectivos.
Los estados Cerrada, Rechazada y Cancelada no tienen una acción de reapertura en este flujo.

## 16. Archivos, historial y revisiones

| Pestaña | Uso |
| --- | --- |
| Resumen | Datos del problema, equipo, participantes, prioridad y referencias de origen. |
| Propuesta | Propuesta actual y selector de revisiones técnicas anteriores. |
| Ejecución | OT/OS vinculadas y fabricación de componentes. |
| Archivos | Carga y descarga de antecedentes, documentos y evidencias. |
| Historial | Decisiones, autores, fechas, comentarios y motivos registrados. |

En **Archivos**, utilice **Adjuntar evidencia o documento** y seleccione el archivo.
El límite por archivo es **30 MB**. Descargue mediante el icono correspondiente.

Pueden añadir archivos y comentarios los participantes de la solicitud con perfil
de escritura y el administrador, mientras no esté cerrada, rechazada o cancelada.
Los archivos son acumulativos: no hay una acción de borrado en este flujo.
Si un documento queda obsoleto, adjunte su reemplazo e indique la corrección en el historial.

Guarde la solicitud o propuesta antes de navegar. Si aparece **Cambios sin guardar**,
las acciones de cambio de estado permanecen deshabilitadas hasta guardar o descartar.

## 17. Problemas frecuentes

| Situación | Qué hacer |
| --- | --- |
| No aparece una acción | Compruebe estado, perfil y asignación. Recargue si otro usuario acaba de cambiar la solicitud. |
| No puedo aprobar mi propuesta | Debe aprobar otra persona, incluso si usted es administrador. |
| No puedo iniciar ejecución | Compruebe la revisión aprobada y vincule al menos una OT/OS del mismo equipo. |
| No aparece una OT/OS | Verifique equipo y estado; actualice el selector después de crear la orden. |
| No aparece una OF | Debe ser de componente, estar en borrador y no tener otra solicitud o demanda posventa vinculada. |
| No aparece un componente | Escriba al menos dos caracteres y verifique que exista y esté activo en Inventario. |
| No puedo desvincular una OF | Solo se permite con OF en borrador o cancelada y solicitud Aprobada o En ejecución. |
| Una OF cancelada impide cerrar | Desde En validación, solicite corrección para volver a ejecución. El administrador debe desvincular la OF cancelada, justificarlo y gestionar su reemplazo si corresponde. |
| Una OT/OS cancelada impide cerrar | Devuelva a ejecución si corresponde, resuelva el vínculo y sustituya la orden según el trabajo pendiente. Debe quedar al menos una OT/OS válida. |
| La solicitud cambió; debo recargar | Otro usuario guardó cambios. Conserve aparte lo pendiente, recargue, revise lo nuevo y vuelva a aplicar únicamente lo que corresponda. |
| La fabricación no muestra el avance reciente | Pulse Recargar solicitud. |
| No puedo adjuntar un archivo | Compruebe tamaño, participación y que la solicitud no haya terminado. |
| Crear una OF dio un error de conexión | Recargue y compruebe si la OF ya aparece antes de volver a crearla. |

## 18. Ejemplo completo: mejora de una descarga

1. El técnico detecta atascos y crea una solicitud desde el equipo:
   “Mejorar guía de descarga”.
2. Describe frecuencia e impacto, adjunta fotografías y envía la solicitud.
3. El administrador autoriza el estudio y asigna a Ana como responsable,
   a Luis como revisor y a Marta como validadora.
4. Ana propone una nueva guía, define materiales, costo, parada y una prueba
   de dos horas sin atascos. Guarda y envía a revisión.
5. Luis revisa y aprueba. Queda identificada la revisión autorizada.
6. Ana vincula una OS del mismo equipo para instalar y probar la guía.
7. Si hace falta fabricar, el administrador crea una OF del componente del catálogo,
   con cantidad y responsable. La OF conserva la revisión aprobada.
8. Ana inicia ejecución. Fabricación produce, verifica y recibe el componente;
   el equipo de servicio registra instalación, consumo y pruebas en la OS.
9. Se completan la OF y la OS, se actualizan los documentos afectados y se adjuntan evidencias.
10. Ana envía a validación. Marta contrasta la prueba con los criterios,
    registra el resultado y las actualizaciones documentales, y valida el cierre.

## 19. Lista de comprobación antes del cierre

- [ ] El equipo y el cambio ejecutado corresponden a la solicitud.
- [ ] La ejecución respeta la revisión aprobada.
- [ ] Existe al menos una OT/OS vinculada; todas están completadas o cerradas.
- [ ] Todas las OF vinculadas están completadas.
- [ ] Los componentes utilizados y sus consumos están registrados donde corresponde.
- [ ] Las pruebas demuestran el cumplimiento de los criterios de aceptación.
- [ ] Están adjuntas las evidencias relevantes.
- [ ] Los documentos y planes afectados se actualizaron o se justificó que no aplica.
- [ ] El validador registró el resultado y confirmó el cierre.

---

Documento relacionado: [Descripción técnica del módulo](../engineering-requests.md).
