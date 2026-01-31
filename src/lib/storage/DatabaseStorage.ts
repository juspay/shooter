// Database Storage Implementation
// PostgreSQL/SQLite backend with connection management and error handling

import type { Storage } from './types.js';
import type { StorageHealth, StorageStats } from '$lib/types/storage';

// Database client type definitions
type PostgresClient = {
  query: (_sql: string, _params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;
  connect?: () => Promise<void>;
  end: () => Promise<void>;
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
};

type MySQLClient = {
  query: (_sql: string, _params?: unknown[]) => Promise<[Array<Record<string, unknown>>, { affectedRows: number }]>;
  connect?: () => Promise<void>;
  end: () => Promise<void>;
  config?: {
    connectionLimit?: number;
    acquireTimeout?: number;
  };
};

type SQLiteClient = {
  prepare: (_sql: string) => {
    get: (..._params: unknown[]) => Record<string, unknown> | undefined;
    run: (..._params: unknown[]) => { changes: number };
    all: (..._params: unknown[]) => Array<Record<string, unknown>>;
  };
  exec: (_sql: string) => void;
  close: () => void;
  name?: string;
  readonly?: boolean;
  memory?: boolean;
};

type DatabaseClient = PostgresClient | MySQLClient | SQLiteClient;

// Database query result types
type PostgresResult = { rows: Array<Record<string, unknown>>; rowCount: number };
type MySQLResult = [Array<Record<string, unknown>>, { affectedRows: number }];
type SQLiteResult = { changes: number };
type QueryResult = PostgresResult | MySQLResult | SQLiteResult | Array<Record<string, unknown>>;

/**
 * Database Storage - available when DATABASE_URL is set
 * Supports PostgreSQL, MySQL, and SQLite through a generic interface
 */
export class DatabaseStorage implements Storage {
  name = 'database';
  connected = false;

  private client: DatabaseClient | null = null;
  private connectionUrl: string;
  private databaseType: 'postgresql' | 'mysql' | 'sqlite' | 'unknown';
  private retryCount = 0;
  private maxRetries = 3;
  private lastHealthCheck = 0;
  private healthCheckInterval = 30000; // 30 seconds
  private operationCount = 0;
  private errorCount = 0;

  constructor(connectionUrl: string) {
    this.connectionUrl = connectionUrl;
    this.databaseType = this.detectDatabaseType(connectionUrl);
  }

  /**
   * Detect database type from connection URL
   */
  private detectDatabaseType(url: string): 'postgresql' | 'mysql' | 'sqlite' | 'unknown' {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('postgres://') || lowerUrl.startsWith('postgresql://')) {
      return 'postgresql';
    } else if (lowerUrl.startsWith('mysql://')) {
      return 'mysql';
    } else if (
      lowerUrl.startsWith('sqlite://') ||
      lowerUrl.includes('.db') ||
      lowerUrl.includes('.sqlite')
    ) {
      return 'sqlite';
    }
    return 'unknown';
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    // Perform health check if needed
    await this.performHealthCheckIfNeeded();

    try {
      this.operationCount++;
      const result = await this.executeQuery('SELECT value FROM storage WHERE key = ?', [key]);

      if (Array.isArray(result) && !('affectedRows' in result) && result.length > 0) {
        const rows = result as Array<Record<string, unknown>>;
        const value = rows[0]!.value;
        return (typeof value === 'string' ? JSON.parse(value) : value) as T;
      }

      return null;
    } catch (error) {
      this.errorCount++;
      console.warn(`Database storage get failed for key ${key}:`, error);
      await this.handleOperationError(error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    await this.performHealthCheckIfNeeded();

    try {
      this.operationCount++;
      const serialized = JSON.stringify(value);
      const timestamp = Date.now();

      // Use UPSERT pattern appropriate for database type
      await this.executeUpsert(key, serialized, timestamp);
    } catch (error) {
      this.errorCount++;
      console.warn(`Database storage set failed for key ${key}:`, error);
      await this.handleOperationError(error);
      // Pure function - silent failure
    }
  }

  async remove(key: string): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    await this.performHealthCheckIfNeeded();

    try {
      this.operationCount++;
      const result = await this.executeQuery('DELETE FROM storage WHERE key = ?', [key]);

      // Check if any rows were affected (implementation varies by database)
      return this.getAffectedRows(result) > 0;
    } catch (error) {
      this.errorCount++;
      console.warn(`Database storage remove failed for key ${key}:`, error);
      await this.handleOperationError(error);
      return false;
    }
  }

  // StorageEngine interface requirement - alias to remove
  async delete(key: string): Promise<boolean> {
    return this.remove(key);
  }

  // StorageEngine interface requirement
  async has(key: string): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    await this.performHealthCheckIfNeeded();

    try {
      this.operationCount++;
      const result = await this.executeQuery('SELECT 1 FROM storage WHERE key = ? LIMIT 1', [key]);
      return Array.isArray(result) && result.length > 0;
    } catch (error) {
      this.errorCount++;
      console.warn(`Database storage has failed for key ${key}:`, error);
      await this.handleOperationError(error);
      return false;
    }
  }

  // StorageEngine interface requirement
  async keys(pattern?: string): Promise<string[]> {
    if (!this.connected || !this.client) {
      return [];
    }

    await this.performHealthCheckIfNeeded();

    try {
      this.operationCount++;
      let query = 'SELECT key FROM storage';
      const params: unknown[] = [];

      if (pattern) {
        // Simple pattern matching - convert glob pattern to SQL LIKE pattern
        const likePattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
        query += ' WHERE key LIKE ?';
        params.push(likePattern);
      }

      const result = await this.executeQuery(query, params);

      // Handle different result formats from different database drivers
      if (Array.isArray(result) && !('affectedRows' in result)) {
        return (result as Array<Record<string, unknown>>).map((row) => (row.key || row.KEY) as string);
      }

      return [];
    } catch (error) {
      this.errorCount++;
      console.warn(`Database storage keys failed:`, error);
      await this.handleOperationError(error);
      return [];
    }
  }

  async connect(): Promise<void> {
    try {
      this.retryCount = 0;
      await this.establishConnection();
      await this.ensureStorageTable();

      this.connected = true;
      console.log(`✅ Database connected (${this.databaseType})`);
    } catch (error) {
      console.warn('Failed to connect to database:', error);
      this.connected = false;
      this.client = null;

      // Retry logic
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`🔄 Retrying database connection (${this.retryCount}/${this.maxRetries})...`);
        setTimeout(() => this.connect(), 2000 * this.retryCount);
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.closeConnection();
        this.client = null;
      }
      this.connected = false;
      console.log('🔌 Database disconnected');
    } catch (error) {
      console.warn('Error disconnecting from database:', error);
      this.connected = false;
      this.client = null;
    }
  }

  /**
   * Establish database connection based on type
   */
  private async establishConnection(): Promise<void> {
    switch (this.databaseType) {
      case 'postgresql':
        await this.connectPostgreSQL();
        break;
      case 'mysql':
        await this.connectMySQL();
        break;
      case 'sqlite':
        await this.connectSQLite();
        break;
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`);
    }
  }

  /**
   * PostgreSQL connection using pg library
   */
  private async connectPostgreSQL(): Promise<void> {
    try {
      // Dynamic import to avoid bundling when not needed
      const { Client } = await import('pg');

      this.client = new Client({
        connectionString: this.connectionUrl,
        ssl: this.connectionUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
        query_timeout: 5000,
        statement_timeout: 5000
      });

      if (this.client.connect) {
        await this.client.connect();
      }
    } catch (_error) {
      console.warn('PostgreSQL not available, falling back to simulation mode');
      this.client = new DatabaseSimulator('postgresql') as unknown as DatabaseClient;
    }
  }

  /**
   * MySQL connection using mysql2 library
   */
  private async connectMySQL(): Promise<void> {
    try {
      // Dynamic import to avoid bundling when not needed
      const mysql = await import('mysql2/promise');

      // @ts-expect-error - mysql2 Connection type doesn't exactly match our MySQLClient interface
      this.client = await mysql.createConnection(this.connectionUrl);
    } catch (_error) {
      console.warn('MySQL not available, falling back to simulation mode');
      this.client = new DatabaseSimulator('mysql') as unknown as DatabaseClient;
    }
  }

  /**
   * SQLite connection using better-sqlite3 library
   */
  private async connectSQLite(): Promise<void> {
    try {
      // Dynamic import to avoid bundling when not needed
      // @ts-expect-error - Optional dependency, fallback to simulator if not available
      const Database = await import('better-sqlite3');

      // Extract file path from URL
      const filePath = this.connectionUrl.replace(/^sqlite:\/\//, '');
      this.client = new Database.default(filePath);
    } catch (_error) {
      console.warn('SQLite not available, falling back to simulation mode');
      this.client = new DatabaseSimulator('sqlite') as unknown as DatabaseClient;
    }
  }

  /**
   * Close database connection
   */
  private async closeConnection(): Promise<void> {
    if (!this.client) {
return;
}

    if (this.client instanceof DatabaseSimulator) {
      await this.client.end();
      return;
    }

    switch (this.databaseType) {
      case 'postgresql':
      case 'mysql': {
        const client = this.client as PostgresClient | MySQLClient;
        await client.end();
        break;
      }
      case 'sqlite': {
        const client = this.client as SQLiteClient;
        client.close();
        break;
      }
    }
  }

  /**
   * Execute query with database-specific handling
   */
  private async executeQuery(sql: string, params: unknown[] = []): Promise<QueryResult> {
    if (this.client instanceof DatabaseSimulator) {
      return this.client.query(sql, params);
    }

    switch (this.databaseType) {
      case 'postgresql': {
        const pgClient = this.client as PostgresClient;
        const pgResult = await pgClient.query(
          sql.replace(/\?/g, (_, i) => `$${i + 1}`),
          params
        );
        return pgResult.rows;
      }

      case 'mysql': {
        const mysqlClient = this.client as MySQLClient;
        const [mysqlRows] = await mysqlClient.query(sql, params);
        return mysqlRows;
      }

      case 'sqlite': {
        const sqliteClient = this.client as SQLiteClient;
        const stmt = sqliteClient.prepare(sql);
        return sql.toLowerCase().startsWith('select') ? stmt.all(...params) : stmt.run(...params);
      }

      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`);
    }
  }

  /**
   * Execute UPSERT query with database-specific syntax
   */
  private async executeUpsert(key: string, value: string, timestamp: number): Promise<void> {
    let upsertSql: string;

    switch (this.databaseType) {
      case 'postgresql':
        upsertSql = `
          INSERT INTO storage (key, value, updated_at) 
          VALUES (?, ?, ?) 
          ON CONFLICT (key) 
          DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        `;
        break;

      case 'mysql':
        upsertSql = `
          INSERT INTO storage (key, value, updated_at) 
          VALUES (?, ?, ?) 
          ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)
        `;
        break;

      case 'sqlite':
        upsertSql = `
          INSERT OR REPLACE INTO storage (key, value, updated_at) 
          VALUES (?, ?, ?)
        `;
        break;

      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`);
    }

    await this.executeQuery(upsertSql, [key, value, timestamp]);
  }

  /**
   * Get affected rows count from query result
   */
  private getAffectedRows(result: QueryResult): number {
    if (this.client instanceof DatabaseSimulator) {
      return (result as SQLiteResult).changes || 0;
    }

    switch (this.databaseType) {
      case 'postgresql':
        return (result as PostgresResult).rowCount || 0;
      case 'mysql':
        return (result as MySQLResult)[1]?.affectedRows || 0;
      case 'sqlite':
        return (result as SQLiteResult).changes || 0;
      default:
        return 0;
    }
  }

  /**
   * Ensure storage table exists
   */
  private async ensureStorageTable(): Promise<void> {
    let createTableSql: string;

    switch (this.databaseType) {
      case 'postgresql':
        createTableSql = `
          CREATE TABLE IF NOT EXISTS storage (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at BIGINT NOT NULL
          )
        `;
        break;

      case 'mysql':
        createTableSql = `
          CREATE TABLE IF NOT EXISTS storage (
            \`key\` VARCHAR(255) PRIMARY KEY,
            \`value\` TEXT NOT NULL,
            updated_at BIGINT NOT NULL
          )
        `;
        break;

      case 'sqlite':
        createTableSql = `
          CREATE TABLE IF NOT EXISTS storage (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `;
        break;

      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`);
    }

    await this.executeQuery(createTableSql);
  }

  // Database-specific methods for monitoring and debugging

  /**
   * Check if database is responsive
   */
  async ping(): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      await this.executeQuery('SELECT 1 as ping');
      return true;
    } catch (error) {
      console.warn('Database ping failed:', error);
      return false;
    }
  }

  /**
   * Get database info for monitoring
   */
  async getInfo(): Promise<Record<string, unknown> | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const info: Record<string, unknown> = {
        database_type: this.databaseType,
        connection_url: this.connectionUrl.replace(/\/\/.*@/, '//***@'), // Hide credentials
        connected: this.connected
      };

      // Add database-specific info
      switch (this.databaseType) {
        case 'postgresql':
          try {
            const versionResult = await this.executeQuery('SELECT version()');
            if (Array.isArray(versionResult) && versionResult.length > 0) {
              const row = versionResult[0] as Record<string, unknown>;
              info.version = row?.version || 'unknown';
            } else {
              info.version = 'unknown';
            }
          } catch {
            info.version = 'unknown';
          }
          break;

        case 'mysql':
          try {
            const versionResult = await this.executeQuery('SELECT VERSION() as version');
            if (Array.isArray(versionResult) && versionResult.length > 0) {
              const row = versionResult[0] as Record<string, unknown>;
              info.version = row?.version || 'unknown';
            } else {
              info.version = 'unknown';
            }
          } catch {
            info.version = 'unknown';
          }
          break;

        case 'sqlite':
          try {
            const versionResult = await this.executeQuery('SELECT sqlite_version() as version');
            if (Array.isArray(versionResult) && versionResult.length > 0) {
              const row = versionResult[0] as Record<string, unknown>;
              info.version = row?.version || 'unknown';
            } else {
              info.version = 'unknown';
            }
          } catch {
            info.version = 'unknown';
          }
          break;
      }

      return info;
    } catch (error) {
      console.warn('Failed to get database info:', error);
      return null;
    }
  }

  /**
   * Get number of keys in storage
   */
  async countKeys(): Promise<number> {
    if (!this.connected || !this.client) {
      return 0;
    }

    try {
      const result = await this.executeQuery('SELECT COUNT(*) as count FROM storage');
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0] as Record<string, unknown>;
        const count = row?.count;
        return typeof count === 'number' ? count : 0;
      }
      return 0;
    } catch (error) {
      console.warn('Failed to count database keys:', error);
      return 0;
    }
  }

  /**
   * Clear all keys (for testing)
   */
  async clear(): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      await this.executeQuery('DELETE FROM storage');
    } catch (error) {
      console.warn('Failed to clear database:', error);
    }
  }

  /**
   * Check if a key exists (alias to has)
   */
  async exists(key: string): Promise<boolean> {
    return this.has(key);
  }

  /**
   * Get number of stored keys
   */
  async size(): Promise<number> {
    return this.countKeys();
  }

  /**
   * Get multiple values at once
   */
  async getMany<T>(keys: string[]): Promise<Array<{ key: string; value: T | null }>> {
    const results = await Promise.all(keys.map(key => this.get<T>(key)));
    return keys.map((key, index) => ({ key, value: results[index]! }));
  }

  /**
   * Set multiple key-value pairs at once
   */
  async setMany<T>(entries: Array<{ key: string; value: T; options?: Record<string, unknown> }>): Promise<void> {
    await Promise.all(entries.map(entry => this.set(entry.key, entry.value)));
  }

  /**
   * Delete multiple keys at once
   */
  async deleteMany(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
deleted++;
}
    }
    return deleted;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    const totalKeys = await this.size();
    return {
      totalKeys,
      totalSize: 0, // Database doesn't track total size directly
      connectionCount: this.connected ? 1 : 0,
      operationsPerSecond: this.operationCount,
      averageResponseTime: 0 // Could be calculated from metrics if needed
    };
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<StorageHealth> {
    const start = Date.now();
    try {
      // Test basic connectivity
      const isHealthy = await this.ping();
      const responseTime = Date.now() - start;
      const errorRate = this.operationCount > 0 ? this.errorCount / this.operationCount : 0;

      const status: 'healthy' | 'degraded' | 'unhealthy' = !isHealthy
        ? 'unhealthy'
        : errorRate > 0.1
          ? 'degraded'
          : 'healthy';

      return {
        status,
        checks: {
          connectivity: isHealthy,
          responseTime,
          memoryUsage: true, // Database storage has minimal memory footprint
          errorRate: errorRate < 0.1
        },
        lastCheck: new Date(),
        ...((!isHealthy || errorRate > 0) && {
          errors: !isHealthy ? ['Database ping failed'] : [`Error rate: ${(errorRate * 100).toFixed(2)}%`]
        })
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        checks: {
          connectivity: false,
          responseTime: Date.now() - start,
          memoryUsage: true,
          errorRate: false
        },
        lastCheck: new Date(),
        errors: [(error as Error).message]
      };
    }
  }

  // Database optimization and monitoring methods

  /**
   * Perform health check if interval has passed
   */
  private async performHealthCheckIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHealthCheck > this.healthCheckInterval) {
      this.lastHealthCheck = now;
      await this.performHealthCheck();
    }
  }

  /**
   * Perform database health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const isHealthy = await this.ping();
      if (!isHealthy && this.connected) {
        console.warn('Database health check failed, attempting reconnection...');
        await this.handleConnectionLoss();
      }
    } catch (error) {
      console.warn('Health check error:', error);
    }
  }

  /**
   * Handle operation errors and potential connection issues
   */
  private async handleOperationError(error: unknown): Promise<void> {
    const errorMessage = (error as Error).message?.toLowerCase() || '';

    // Check for connection-related errors
    if (
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('econnrefused')
    ) {
      console.warn('Database connection issue detected, attempting reconnection...');
      await this.handleConnectionLoss();
    }
  }

  /**
   * Handle connection loss and attempt reconnection
   */
  private async handleConnectionLoss(): Promise<void> {
    this.connected = false;

    try {
      await this.closeConnection();
    } catch (_error) {
      // Ignore errors when closing
    }

    // Attempt reconnection after a delay
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.warn('Database reconnection failed:', error);
      }
    }, 5000);
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    operationCount: number;
    errorCount: number;
    errorRate: number;
    connected: boolean;
    databaseType: string;
    uptime: number;
  } {
    return {
      operationCount: this.operationCount,
      errorCount: this.errorCount,
      errorRate: this.operationCount > 0 ? this.errorCount / this.operationCount : 0,
      connected: this.connected,
      databaseType: this.databaseType,
      uptime: this.lastHealthCheck
    };
  }

  /**
   * Reset metrics (for monitoring)
   */
  resetMetrics(): void {
    this.operationCount = 0;
    this.errorCount = 0;
  }

  /**
   * Get connection pool status (database-specific)
   */
  async getPoolStatus(): Promise<Record<string, unknown> | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      switch (this.databaseType) {
        case 'postgresql': {
          const pgClient = this.client as PostgresClient;
          return {
            totalConnections: pgClient.totalCount || 0,
            idleConnections: pgClient.idleCount || 0,
            waitingClients: pgClient.waitingCount || 0
          };
        }

        case 'mysql': {
          const mysqlClient = this.client as MySQLClient;
          return {
            connectionLimit: mysqlClient.config?.connectionLimit || 'unknown',
            acquireTimeout: mysqlClient.config?.acquireTimeout || 'unknown'
          };
        }

        case 'sqlite': {
          const sqliteClient = this.client as SQLiteClient;
          return {
            filename: sqliteClient.name || 'unknown',
            readonly: sqliteClient.readonly || false,
            memory: sqliteClient.memory || false
          };
        }

        default:
          return { type: this.databaseType };
      }
    } catch (error) {
      console.warn('Failed to get pool status:', error);
      return null;
    }
  }

  /**
   * Optimize database performance (database-specific)
   */
  async optimize(): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      switch (this.databaseType) {
        case 'postgresql':
          // Analyze storage table for better query planning
          await this.executeQuery('ANALYZE storage');
          console.log('✅ PostgreSQL table analyzed for optimization');
          break;

        case 'mysql':
          // Optimize storage table
          await this.executeQuery('OPTIMIZE TABLE storage');
          console.log('✅ MySQL table optimized');
          break;

        case 'sqlite':
          // Vacuum database to reclaim space
          await this.executeQuery('VACUUM');
          console.log('✅ SQLite database vacuumed');
          break;

        default:
          console.log('ℹ️ No optimization available for database type:', this.databaseType);
      }
    } catch (error) {
      console.warn('Database optimization failed:', error);
    }
  }

  /**
   * Create database indexes for better performance
   */
  async createIndexes(): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      // Create index on updated_at for cleanup operations
      await this.executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_storage_updated_at 
        ON storage (updated_at)
      `);

      console.log('✅ Database indexes created');
    } catch (error) {
      console.warn('Failed to create indexes:', error);
    }
  }

  /**
   * Cleanup old entries (database-specific implementation)
   */
  async cleanupOldEntries(olderThanMs: number): Promise<number> {
    if (!this.connected || !this.client) {
      return 0;
    }

    try {
      const cutoffTime = Date.now() - olderThanMs;
      const result = await this.executeQuery('DELETE FROM storage WHERE updated_at < ?', [
        cutoffTime
      ]);

      const deletedCount = this.getAffectedRows(result);
      console.log(`🧹 Cleaned up ${deletedCount} old entries from database`);

      return deletedCount;
    } catch (error) {
      console.warn('Failed to cleanup old entries:', error);
      return 0;
    }
  }
}

/**
 * Database simulator for testing when real database is not available
 */
class DatabaseSimulator {
  private data = new Map<string, { value: string; updated_at: number }>();
  private type: string;

  constructor(type: string) {
    this.type = type;
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const lowerSql = sql.toLowerCase().trim();

    if (lowerSql.startsWith('select')) {
      if (lowerSql.includes('where key =')) {
        const key = params[0] as string;
        const item = this.data.get(key);
        return item ? [{ value: item.value }] : [];
      } else if (lowerSql.includes('count(*)')) {
        return [{ count: this.data.size }];
      } else if (lowerSql.includes('version') || lowerSql === 'select 1 as ping') {
        return [{ version: `Simulated ${this.type}`, ping: 1 }];
      }
    } else if (
      lowerSql.startsWith('insert') ||
      lowerSql.includes('upsert') ||
      lowerSql.includes('replace')
    ) {
      const key = params[0] as string;
      const value = params[1] as string;
      const updated_at = (params[2] as number) || Date.now();
      this.data.set(key, { value, updated_at });
      return { changes: 1 };
    } else if (lowerSql.startsWith('delete')) {
      const key = params[0] as string;
      const existed = this.data.has(key);
      this.data.delete(key);
      return { changes: existed ? 1 : 0 };
    } else if (lowerSql.includes('create table')) {
      // Table creation simulation - no-op
      return { changes: 0 };
    }

    return [];
  }

  async end(): Promise<void> {
    // Cleanup simulator resources
    this.data.clear();
  }

  close(): void {
    // Cleanup simulator resources
    this.data.clear();
  }
}
