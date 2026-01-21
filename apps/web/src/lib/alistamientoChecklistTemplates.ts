export type ChecklistItemTemplate = {
  label: string;
  required?: boolean;
};

export type ChecklistTemplate = {
  /** Identificador estable (para guardar en formData) */
  key: string;
  /** Nombre visible */
  name: string;
  /** Modelos que hacen match (case-insensitive). Ej: ["GA11", "GA15"] */
  matchModels?: string[];
  /** Marcas que hacen match (case-insensitive). Ej: ["Atlas Copco"] */
  matchBrands?: string[];
  items: ChecklistItemTemplate[];
};

function norm(s?: string | null) {
  return (s ?? '').trim().toLowerCase();
}

/**
 * Templates de alistamiento por tipo de máquina (ejemplo).
 * Amplía esta lista con tus modelos reales.
 */
export const ALISTAMIENTO_TEMPLATES: ChecklistTemplate[] = [
  /* {
    key: '',
    name: '',
    items: [
      { label: 'Inspección visual general (golpes/fugas)', required: true },
      { label: 'Verificar niveles (aceite/refrigerante) si aplica', required: true },
      { label: 'Revisar conexiones eléctricas / bornes', required: true },
      { label: 'Prueba funcional (encendido/apagado)', required: true },
      { label: 'Revisar ruidos/vibraciones anormales' },
      { label: 'Limpieza básica / soplado / retiro de polvo' },
    ],
  }, */
  {
    key: 'GA11',
    name: 'Compresor 10HP',
    matchBrands: ['atlas copco', 'Atlas Copco'],
    matchModels: ['ga', 'ga11', 'ga15', 'ga18', 'ga22', 'GA11'],
    items: [
      { label: 'Verificar presión de trabajo y setpoints', required: true },
      { label: 'Revisar filtro de aire / estado', required: true },
      { label: 'Revisar aceite (nivel/estado)', required: true },
      { label: 'Revisar drenajes / purgas', required: true },
      { label: 'Revisar temperatura de operación' },
      { label: 'Registrar horas de operación' },
      { label: 'Prueba de carga/descarga', required: true },
    ],
  },
  {
    key: 'MONTACARGAS',
    name: 'Montacargas eléctrico',
    matchBrands: ['HELI'],
    matchModels: ['CPD30'],
    items: [
      { label: 'Verificar SOC', required: true },
      { label: 'Revisar filtro de aire / estado', required: true },
      { label: 'Revisar aceite (nivel/estado)', required: true },
      { label: 'Revisar drenajes / purgas', required: true },
      { label: 'Revisar temperatura de operación' },
      { label: 'Registrar horas de operación' },
      { label: 'Prueba de carga/descarga', required: true },
    ],
  },
  {
    key: 'APILADORES ELÉCTRICOS',
    name: 'APILADORES ELÉCTRICOS',
    matchBrands: ['HELI'],
    matchModels: ['CDD', 'CQDH', 'CTD'],
    items: [
      { label: 'Switch de encendido', required: true },
      { label: 'Boton Antiatrapamiento', required: true },
      { label: 'Boton Paro de emergencia', required: true },
      { label: 'Frenos', required: true },
      { label: 'Horquillas', required: true},
      { label: 'Horometro e indicador de batería', required: true},
      { label: 'Pito' },
      { label: 'Sistema de Dirección', required: true },
      { label: 'Mandos de marcha', required: true },
      { label: 'Funciones(Subir, bajar)', required: true },
      { label: 'Sistema hidráulico', required: true },
      { label: 'Mastil', required: true },
      { label: 'Cadenas', required: true },
      { label: 'Apariencia', required: true },
      { label: 'Etiquetas MyZ y Logos', required: true },
      { label: 'Tornillería', required: true },
      { label: 'Conexiones eléctricas', required: true },
      { label: 'Batería', required: true },
      { label: 'Cargador', required: true },
      { label: 'Ruedas', required: true },
      { label: 'Patas', required: true },
      { label: 'Prueba de carga', required: true },
    ],
  },
  {
    key: 'APILADORES SEMIELÉCTRICOS',
    name: 'APILADORES SEMIELÉCTRICOS',
    matchBrands: ['HELI'],
    matchModels: ['CBS', 'EPS', 'DCY'],
    items: [
      { label: 'Boton Paro de emergencia', required: true },
      { label: 'Frenos', required: true },
      { label: 'Indicador de batería', required: true },
      { label: 'Horquillas', required: true},
      { label: 'Sistema de Dirección', required: true },
      { label: 'Funciones(Subir, bajar)', required: true },
      { label: 'Sistema hidráulico', required: true },
      { label: 'Mastil', required: true },
      { label: 'Cadenas', required: true },
      { label: 'Apariencia', required: true },
      { label: 'Etiquetas MyZ y Logos', required: true },
      { label: 'Tornillería', required: true },
      { label: 'Conexiones eléctricas', required: true },
      { label: 'Batería', required: true },
      { label: 'Cargador', required: true },
      { label: 'Ruedas', required: true },
      { label: 'Patas', required: true },
      { label: 'Prueba de carga', required: true },
    ],
  },
];

export function resolveAlistamientoTemplate(asset: { brand?: string | null; model?: string | null }) {
  const b = norm(asset.brand);
  const m = norm(asset.model);

  for (const t of ALISTAMIENTO_TEMPLATES) {
    const brandOk = !t.matchBrands?.length || t.matchBrands.some((x) => b.includes(norm(x)));
    if (!brandOk) continue;

    if (!t.matchModels?.length) return t;

    const modelOk = t.matchModels.some((x) => {
      const k = norm(x);
      return (m && (m.includes(k) || k.includes(m))) || false;
    });

    if (modelOk) return t;
  }

  return ALISTAMIENTO_TEMPLATES[0];
}
