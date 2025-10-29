export type ParsedTopic = {
  tenantSlug: string;
  deviceId: string;
  channel: 'telemetry' | 'state' | 'events' | string;
};

export function parseTopic(topic: string): ParsedTopic | null {
  // Esperado: tenants/<tenantSlug>/devices/<deviceId>/(telemetry|state|events|...)
  const parts = topic.split('/');
  if (parts.length < 5) return null;
  if (parts[0] !== 'tenants' || parts[2] !== 'devices') return null;
  const tenantSlug = parts[1];
  const deviceId = parts[3];
  const channel = parts.slice(4).join('/');
  return { tenantSlug, deviceId, channel };
}