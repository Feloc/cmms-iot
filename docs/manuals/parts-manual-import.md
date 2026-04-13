# Importacion de manuales de partes

## Objetivo
Cargar al sistema un manual de partes para que una OS de `DIAGNOSTICO` muestre la imagen del despiece y permita seleccionar hotspots para agregar repuestos.

## Donde guardar las imagenes
La forma mas simple en este proyecto es guardar las imagenes del manual dentro de:

`apps/web/public/manuals/<modelo>/`

Ejemplo:

`apps/web/public/manuals/cbd20j-li3/page-001.png`

Luego, en el JSON del manual, la pagina apunta a:

`/manuals/cbd20j-li3/page-001.png`

Como esa ruta vive en `public`, el frontend la sirve directamente.

## Flujo recomendado
1. Exportar las paginas del PDF a imagenes PNG o JPG.
2. Copiar esas imagenes a `apps/web/public/manuals/<modelo>/`.
3. Si quieres trabajar visualmente, entrar a `/inventory/manuals` y dibujar los hotspots sobre la imagen.
4. Si prefieres trabajar por archivo, crear un manifiesto JSON basado en `docs/manuals/parts-manual.template.json`.
5. Si ya conoces el SKU del repuesto en inventario, usar `inventoryItemSku` dentro del hotspot.
6. Importar el manual con el script:

```bash
npm run parts-manual:import -w apps/api -- ../../docs/manuals/CBD20J-LI3.parts-manual.template.json acme
```

## Campos principales del manifiesto
- `tenantSlug`: slug del tenant.
- `brand`: marca del equipo.
- `equipmentModel`: modelo exacto del activo.
- `variant`: variante opcional.
- `name`: nombre visible del manual.
- `sourcePdfUrl`: ruta opcional al PDF original. Si lo guardas en `apps/web/public/manuals/...`, usa una ruta como `/manuals/cbd20j-li3/CBD20J-LI3.pdf`.
- `replaceExisting`: si es `true`, borra el manual anterior con la misma combinacion `brand + model + variant`.
- `pages`: paginas del manual.

## Campos por pagina
- `pageNumber`: numero de pagina que se mostrara en la UI.
- `title`: titulo corto opcional.
- `imageUrl`: ruta de la imagen de esa pagina.
- `hotspots`: lista de areas clicables.

## Campos por hotspot
- `itemNo`: numero visible en el despiece.
- `label`: nombre corto de la pieza.
- `oemPartNo`: parte OEM si existe.
- `inventoryItemSku`: SKU del inventario para enlazar el hotspot sin usar IDs.
- `x`, `y`, `width`, `height`: coordenadas y tamano en porcentaje de 0 a 100.
- `qtyHint`: cantidad sugerida por defecto al agregar.
- `notes`: detalle adicional para el tecnico.

## Coordenadas
Las coordenadas son porcentajes sobre la imagen:

- `x`: borde izquierdo
- `y`: borde superior
- `width`: ancho
- `height`: alto

Ejemplo:

```json
{
  "itemNo": "12",
  "label": "Drive wheel",
  "x": 43.2,
  "y": 57.8,
  "width": 8.4,
  "height": 7.1
}
```

## Nota operativa
En este entorno no hay utilitarios PDF instalados, asi que la conversion del PDF a imagenes debe hacerse por fuera o manualmente. La importacion del manifiesto ya queda lista para que carguemos el `CBD20J-LI3` por fases.
