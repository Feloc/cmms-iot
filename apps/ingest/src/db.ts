import pg from 'pg';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'db' });

export function createPool() {
  const ssl = String(process.env.PG_SSL || 'false') === 'true' ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'cmms',
    user: process.env.PG_USER || 'cmms',
    password: process.env.PG_PASSWORD || 'cmms',
    ssl,
    max: 10,
    idleTimeoutMillis: 30_000
  });
  pool.on('error', (err) => log.error({ err }, 'pg pool error'));
  return pool;
}

export async function withTenant<T>(client: pg.PoolClient, tenantId?: string, fn?: () => Promise<T>): Promise<T | void> {
  await client.query('BEGIN');
  if (tenantId) {
    // Seteamos tenant para vistas seguras (app.tenant_id)
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
  }
  try {
    const out = fn ? await fn() : undefined as any;
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}