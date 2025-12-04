export type ParsedTopic = {
  tenantSlug: string;
  deviceId: string; // puede ser id o ingestKey
  channel: string;  // 'telemetry' | 'state' | ...
};

/**
 * Formatos soportados:
 * - tenants/<tenantSlug>/devices/<deviceId>/telemetry
 * - tenants/<tenantSlug>/devices/<deviceId>/state
 * - tenants/<tenantSlug>/devices/<deviceId>/ingestKey/<key>/<channel>  (ignora ingestKey)
 */
export function parseTopic(topic: string): ParsedTopic | null {
  const parts = topic.split('/');
  if (parts.length < 5) return null;
  if (parts[0] !== 'tenants' || parts[2] !== 'devices') return null;

  const tenantSlug = parts[1];
  const deviceId = parts[3];

  // Si aparece la palabra ingestKey, el canal real está dos posiciones después
  const ingestIdx = parts.indexOf('ingestKey');
  let channel = '';
  if (ingestIdx > -1 && parts.length > ingestIdx + 2) {
    channel = parts[ingestIdx + 2];
  } else {
    channel = parts[4];
  }
  return { tenantSlug, deviceId, channel };
}