declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
    ssl?: unknown;
    [key: string]: unknown;
  }

  export interface QueryResult<R = any> {
    rows: R[];
    rowCount?: number;
  }

  export interface PoolClient {
    query<R = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query<R = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
    on(event: 'error', listener: (err: Error) => void): this;
    end(): Promise<void>;
  }
}
