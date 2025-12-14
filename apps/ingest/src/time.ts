/**
 * Timestamp normalization for telemetry ingestion.
 *
 * Why:
 * - Many MCUs send uptime millis (millis()) instead of epoch time.
 * - If stored as timestamptz it looks like 1970.
 *
 * Strategy (default: auto):
 * - If ts looks like epoch-ms -> use it
 * - If ts looks like epoch-sec -> convert to ms and use it
 * - If ts is ISO string -> parse it
 * - Otherwise -> fallback to receivedAt (server time)
 */
export type TimestampMode = 'auto' | 'server' | 'device';

export type NormalizeResult = {
  ts: Date;
  source: 'server' | 'device_epoch_ms' | 'device_epoch_s' | 'device_iso' | 'invalid_fallback';
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function looksLikeEpochSeconds(n: number) {
  return n > 1_000_000_000 && n < 10_000_000_000; // 2001..2286
}

function looksLikeEpochMillis(n: number) {
  return n > 1_000_000_000_000 && n < 100_000_000_000_000; // 2001..5138
}

function parseIsoMaybe(v: string): Date | null {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function normalizeTelemetryTimestamp(
  inputTs: unknown,
  receivedAt: Date,
  mode: TimestampMode = (process.env.INGEST_TIMESTAMP_MODE as TimestampMode) || 'auto',
): NormalizeResult {
  if (mode === 'server') return { ts: receivedAt, source: 'server' };

  if (typeof inputTs === 'string') {
    const iso = parseIsoMaybe(inputTs);
    if (iso) return { ts: iso, source: 'device_iso' };
    return { ts: receivedAt, source: 'invalid_fallback' };
  }

  if (isFiniteNumber(inputTs)) {
    if (looksLikeEpochMillis(inputTs)) return { ts: new Date(inputTs), source: 'device_epoch_ms' };
    if (looksLikeEpochSeconds(inputTs)) return { ts: new Date(inputTs * 1000), source: 'device_epoch_s' };
    return { ts: receivedAt, source: 'invalid_fallback' };
  }

  return { ts: receivedAt, source: 'server' };
}

export function isSuspicious1970(ts: Date) {
  return ts.getUTCFullYear() < 2000;
}
