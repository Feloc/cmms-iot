import { Pool, PoolClient } from 'pg';
import pino from 'pino';

const log = pino({ name: 'ingest-db', level: process.env.LOG_LEVEL || 'info' });

function buildPoolConfig() {
  // 1) Si existe DATABASE_URL, la usamos (formato postgres://user:pass@host:port/db)
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PGPOOL_MAX || 10),
      ssl: /^true$/i.test(process.env.PG_SSL || '') ? { rejectUnauthorized: false } : undefined,
    } as any;
  }

  // 2) Caso contrario, armamos config con variables PG_*
  const host = process.env.PG_HOST || 'db';
  const port = Number(process.env.PG_PORT || 5432);
  const database = process.env.PG_DATABASE || 'cmms';
  const user = process.env.PG_USER || 'cmms_ingest';
  const password = process.env.PG_PASSWORD || '';
  const ssl = /^true$/i.test(process.env.PG_SSL || '') ? { rejectUnauthorized: false } : undefined;

  return {
    host,
    port,
    database,
    user,
    password,
    max: Number(process.env.PGPOOL_MAX || 10),
    ssl,
  } as any;
}

export function createPool() {
  const cfg = buildPoolConfig();
  const pool = new Pool(cfg);
  pool.on('error', (err: Error) => log.error({ err }, 'pg pool error'));
  log.info({ mode: process.env.DATABASE_URL ? 'DATABASE_URL' : 'PG_*', host:(cfg as any).host, database:(cfg as any).database, ssl: !!(cfg as any).ssl }, 'pg pool created');
  return pool;
}

/**
 * Ejecuta una función dentro de una transacción fijando el tenant para RLS
 * mediante `SET LOCAL app.tenant_id = '<tenantId>'`.
 */
export async function withTenant<T>(client: PoolClient, tenantId: string, run: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  await client.query(
    'SELECT set_config($1, $2, true)',
    ['app.tenant_id', tenantId],
  );
  
  try {
    const out = await run();
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  }
}
