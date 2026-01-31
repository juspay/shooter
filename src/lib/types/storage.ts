/**
 * Storage and Data Management Types
 * Comprehensive type definitions for storage systems, data persistence, and caching
 */

// Core storage interfaces
export interface StorageEngine {
  name: string;
  connected: boolean;
  get<T>(_key: string): Promise<T | null>;
  set<T>(_key: string, _value: T, _options?: StorageSetOptions): Promise<void>;
  delete(_key: string): Promise<boolean>;
  remove?(_key: string): Promise<boolean>; // Alias for delete
  clear(): Promise<void>;
  keys(_pattern?: string): Promise<string[]>;
  exists(_key: string): Promise<boolean>;
  size(): Promise<number>;
  
  // Batch operations
  getMany<T>(_keys: string[]): Promise<Array<{ key: string; value: T | null }>>;
  setMany<T>(_entries: Array<{ key: string; value: T; options?: StorageSetOptions }>): Promise<void>;
  deleteMany(_keys: string[]): Promise<number>;
  
  // Metadata and health
  getStats(): Promise<StorageStats>;
  healthCheck(): Promise<StorageHealth>;
  
  // Lifecycle
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
}

export interface StorageSetOptions {
  ttl?: number; // Time to live in milliseconds
  tags?: string[]; // For cache invalidation
  compress?: boolean; // Enable compression
  metadata?: Record<string, unknown>; // Custom metadata
}

export interface StorageStats {
  totalKeys: number;
  totalSize: number; // in bytes
  hitRate?: number; // cache hit rate percentage
  missRate?: number; // cache miss rate percentage
  memoryUsage?: number; // memory usage in bytes
  connectionCount?: number; // active connections
  operationsPerSecond?: number;
  averageResponseTime?: number; // in milliseconds
}

export interface StorageHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    connectivity: boolean;
    responseTime: number;
    memoryUsage: boolean;
    errorRate: boolean;
  };
  lastCheck: Date;
  errors?: string[];
}

// Storage configuration types
export interface StorageConfig {
  engine: StorageEngineType;
  connection: StorageConnectionConfig;
  options: StorageOptions;
  fallback?: StorageConfig;
}

export type StorageEngineType = 
  | 'memory'
  | 'file'
  | 'redis'
  | 'postgresql'
  | 'mongodb'
  | 'sqlite'
  | 'indexeddb'
  | 'localstorage'
  | 'sessionstorage';

export interface StorageConnectionConfig {
  // Common connection settings
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  
  // Connection pooling
  maxConnections?: number;
  minConnections?: number;
  connectionTimeout?: number;
  idleTimeout?: number;
  
  // SSL/TLS
  ssl?: boolean;
  sslOptions?: {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  
  // Redis specific
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  
  // File system specific
  basePath?: string;
  createDirs?: boolean;
  
  // Browser specific
  storageQuota?: number;
}

export interface StorageOptions {
  // Serialization
  serializer?: StorageSerializer;
  compression?: CompressionConfig;
  
  // Caching
  defaultTTL?: number;
  maxSize?: number;
  evictionPolicy?: EvictionPolicy;
  
  // Performance
  batchSize?: number;
  concurrency?: number;
  enableMetrics?: boolean;
  
  // Error handling
  retryAttempts?: number;
  retryDelay?: number;
  errorHandler?: (_error: Error, _operation: string, _key?: string) => void;
  
  // Consistency
  consistencyLevel?: ConsistencyLevel;
  replication?: ReplicationConfig;
}

export interface StorageSerializer {
  encode<T>(_value: T): string | Buffer;
  decode<T>(_data: string | Buffer): T;
  name: string;
}

export interface CompressionConfig {
  enabled: boolean;
  algorithm: 'gzip' | 'deflate' | 'brotli' | 'lz4';
  level?: number;
  threshold?: number; // minimum size to compress
}

export type EvictionPolicy = 'lru' | 'lfu' | 'ttl' | 'fifo' | 'random' | 'none';
export type ConsistencyLevel = 'eventual' | 'strong' | 'weak';

export interface ReplicationConfig {
  enabled: boolean;
  factor: number;
  strategy: 'sync' | 'async';
  nodes?: string[];
}

// Multi-layer storage system
export interface LayeredStorage {
  layers: StorageLayer[];
  fallbackStrategy: FallbackStrategy;
  
  // Operations cascade through layers
  get<T>(_key: string): Promise<T | null>;
  set<T>(_key: string, _value: T, _options?: StorageSetOptions): Promise<void>;
  delete(_key: string): Promise<boolean>;
  
  // Layer management
  addLayer(_layer: StorageLayer, _position?: number): void;
  removeLayer(_name: string): void;
  getLayer(_name: string): StorageLayer | undefined;
  
  // Cache management
  warm(_keys: string[]): Promise<void>;
  invalidate(_pattern: string): Promise<void>;
  flush(_layerName?: string): Promise<void>;
}

export interface StorageLayer {
  name: string;
  engine: StorageEngine;
  priority: number; // lower = higher priority
  capabilities: StorageCapabilities;
  
  // Layer-specific behavior
  writeThrough?: boolean; // write to this and lower priority layers
  readThrough?: boolean; // read from higher priority on miss
  maxEntries?: number;
  entryTTL?: number;
}

export interface StorageCapabilities {
  persistent: boolean; // survives app restart
  distributed: boolean; // shared across instances
  transactional: boolean; // supports transactions
  queryable: boolean; // supports complex queries
  observable: boolean; // supports change notifications
  compressible: boolean; // can compress values
  encrypted: boolean; // encrypts data at rest
}

export type FallbackStrategy = 
  | 'cascade' // try each layer in order
  | 'parallel' // try all layers simultaneously
  | 'circuit-breaker' // skip failing layers
  | 'weighted'; // use based on layer weights

// Document and collection storage
export interface DocumentStorage<T = unknown> {
  // Document operations
  findById(_id: string): Promise<T | null>;
  findOne(_query: Query<T>): Promise<T | null>;
  findMany(_query: Query<T>): Promise<T[]>;
  findPage(_query: Query<T>, _pagination: Pagination): Promise<PageResult<T>>;
  
  // Mutations
  create(_document: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(_id: string, _updates: Partial<T>): Promise<T>;
  upsert(_document: Partial<T> & { id: string }): Promise<T>;
  delete(_id: string): Promise<boolean>;
  
  // Bulk operations
  createMany(_documents: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<T[]>;
  updateMany(_query: Query<T>, _updates: Partial<T>): Promise<number>;
  deleteMany(_query: Query<T>): Promise<number>;
  
  // Indexes and optimization
  createIndex(_fields: (keyof T)[], _options?: IndexOptions): Promise<void>;
  dropIndex(_name: string): Promise<void>;
  getIndexes(): Promise<IndexInfo[]>;
  
  // Collections management
  exists(): Promise<boolean>;
  count(_query?: Query<T>): Promise<number>;
  clear(): Promise<void>;
  drop(): Promise<void>;
}

export interface Query<T> {
  where?: QueryWhere<T>;
  select?: (keyof T)[];
  sort?: QuerySort<T>;
  limit?: number;
  offset?: number;
}

export type QueryWhere<T> = {
  [K in keyof T]?: QueryCondition<T[K]> | T[K];
};

export interface QueryCondition<V> {
  $eq?: V;
  $ne?: V;
  $gt?: V;
  $gte?: V;
  $lt?: V;
  $lte?: V;
  $in?: V[];
  $nin?: V[];
  $exists?: boolean;
  $regex?: string;
  $and?: QueryCondition<V>[];
  $or?: QueryCondition<V>[];
  $not?: QueryCondition<V>;
}

export type QuerySort<T> = {
  [_K in keyof T]?: 'asc' | 'desc' | 1 | -1;
};

export interface Pagination {
  page: number;
  limit: number;
  sort?: Record<string, 'asc' | 'desc'>;
}

export interface PageResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface IndexOptions {
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  expireAfterSeconds?: number;
}

export interface IndexInfo {
  name: string;
  fields: string[];
  unique: boolean;
  sparse: boolean;
  size: number;
}

// Blob and file storage
export interface BlobStorage {
  // Basic operations
  put(_key: string, _data: Buffer | Uint8Array | string, _options?: BlobPutOptions): Promise<BlobInfo>;
  get(_key: string): Promise<BlobData | null>;
  getStream(_key: string): Promise<ReadableStream | null>;
  delete(_key: string): Promise<boolean>;
  exists(_key: string): Promise<boolean>;
  
  // Metadata operations
  getInfo(_key: string): Promise<BlobInfo | null>;
  setMetadata(_key: string, _metadata: Record<string, unknown>): Promise<void>;
  
  // List operations
  list(_prefix?: string, _options?: BlobListOptions): Promise<BlobInfo[]>;
  
  // Advanced operations
  copy(_sourceKey: string, _destKey: string): Promise<void>;
  move(_sourceKey: string, _destKey: string): Promise<void>;
  
  // Batch operations
  putMany(_items: Array<{ key: string; data: Buffer | string; options?: BlobPutOptions }>): Promise<BlobInfo[]>;
  deleteMany(_keys: string[]): Promise<number>;
  
  // Storage management
  getUsage(): Promise<BlobStorageUsage>;
  cleanup(_olderThan?: Date): Promise<number>;
}

export interface BlobPutOptions {
  contentType?: string;
  contentEncoding?: string;
  metadata?: Record<string, unknown>;
  tags?: Record<string, string>;
  encryption?: BlobEncryption;
  acl?: BlobACL;
  expires?: Date;
}

export interface BlobData {
  data: Buffer | Uint8Array;
  info: BlobInfo;
}

export interface BlobInfo {
  key: string;
  size: number;
  contentType?: string;
  contentEncoding?: string;
  etag: string;
  lastModified: Date;
  metadata?: Record<string, unknown>;
  tags?: Record<string, string>;
  url?: string; // public URL if available
}

export interface BlobListOptions {
  limit?: number;
  marker?: string; // pagination marker
  recursive?: boolean; // include nested paths
  includeMetadata?: boolean;
}

export interface BlobEncryption {
  algorithm: 'AES256' | 'AES128';
  key?: string; // if not provided, service-managed key is used
}

export interface BlobACL {
  read: BlobPermission[];
  write: BlobPermission[];
}

export type BlobPermission = 'public' | 'authenticated' | string; // string for specific user/role

export interface BlobStorageUsage {
  totalObjects: number;
  totalSize: number;
  storageClass?: Record<string, { objects: number; size: number }>;
  lastUpdated: Date;
}

// Transaction management
export interface Transaction {
  id: string;
  status: TransactionStatus;
  operations: TransactionOperation[];
  
  // Transaction operations
  get<T>(_key: string): Promise<T | null>;
  set<T>(_key: string, _value: T, _options?: StorageSetOptions): Promise<void>;
  delete(_key: string): Promise<void>;
  
  // Lifecycle
  commit(): Promise<void>;
  rollback(): Promise<void>;
  
  // Metadata
  getInfo(): TransactionInfo;
}

export type TransactionStatus = 'active' | 'committed' | 'aborted' | 'failed';

export interface TransactionOperation {
  type: 'get' | 'set' | 'delete';
  key: string;
  value?: unknown;
  options?: StorageSetOptions;
  timestamp: Date;
}

export interface TransactionInfo {
  id: string;
  status: TransactionStatus;
  startTime: Date;
  endTime?: Date;
  operationCount: number;
  isolationLevel: IsolationLevel;
}

export type IsolationLevel = 'read-uncommitted' | 'read-committed' | 'repeatable-read' | 'serializable';

// Event and observation system
export interface StorageObserver {
  // Event subscription
  on(_event: StorageEvent, _handler: StorageEventHandler): void;
  off(_event: StorageEvent, _handler?: StorageEventHandler): void;
  once(_event: StorageEvent, _handler: StorageEventHandler): void;
  
  // Key-specific subscriptions
  watch(_key: string, _handler: StorageWatchHandler): StorageWatcher;
  watchPattern(_pattern: string, _handler: StorageWatchHandler): StorageWatcher;
  
  // Event emission (for storage implementations)
  emit(_event: StorageEvent, _data: StorageEventData): void;
}

export type StorageEvent = 
  | 'set' 
  | 'delete' 
  | 'expire' 
  | 'evict' 
  | 'connect' 
  | 'disconnect' 
  | 'error' 
  | 'clear';

export interface StorageEventData {
  key?: string;
  value?: unknown;
  oldValue?: unknown;
  timestamp: Date;
  source: string; // which storage layer/instance
  metadata?: Record<string, unknown>;
}

export type StorageEventHandler = (_event: StorageEvent, _data: StorageEventData) => void;
export type StorageWatchHandler = (_key: string, _newValue: unknown, _oldValue: unknown) => void;

export interface StorageWatcher {
  key: string;
  active: boolean;
  unwatch(): void;
}

// Migration and versioning
export interface StorageMigration {
  version: string;
  description: string;
  up: (_storage: StorageEngine) => Promise<void>;
  down: (_storage: StorageEngine) => Promise<void>;
  
  // Migration metadata
  dependencies?: string[]; // required migrations
  reversible: boolean;
  estimatedDuration?: number; // in seconds
}

export interface MigrationRunner {
  // Migration execution
  migrate(_targetVersion?: string): Promise<MigrationResult>;
  rollback(_steps?: number): Promise<MigrationResult>;
  
  // Migration management
  addMigration(_migration: StorageMigration): void;
  getCurrentVersion(): Promise<string>;
  getPendingMigrations(): Promise<StorageMigration[]>;
  getMigrationHistory(): Promise<MigrationRecord[]>;
  
  // Validation
  validateMigrations(): Promise<ValidationResult>;
  dryRun(_targetVersion?: string): Promise<MigrationPlan>;
}

export interface MigrationResult {
  success: boolean;
  migrationsRun: string[];
  errors?: MigrationError[];
  duration: number;
  fromVersion: string;
  toVersion: string;
}

export interface MigrationRecord {
  version: string;
  description: string;
  appliedAt: Date;
  duration: number;
  checksum?: string;
}

export interface MigrationError {
  migration: string;
  error: Error;
  rollbackSucceeded: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface MigrationPlan {
  currentVersion: string;
  targetVersion: string;
  migrations: StorageMigration[];
  estimatedDuration: number;
  warnings: string[];
}

// Backup and recovery
export interface StorageBackup {
  // Backup operations
  createBackup(_options?: BackupOptions): Promise<BackupInfo>;
  restoreBackup(_backupId: string, _options?: RestoreOptions): Promise<void>;
  
  // Backup management
  listBackups(): Promise<BackupInfo[]>;
  deleteBackup(_backupId: string): Promise<void>;
  
  // Incremental backups
  createIncremental(_baseBackupId?: string): Promise<BackupInfo>;

  // Export/Import
  exportData(_query?: unknown): Promise<ExportResult>;
  importData(_data: ImportData, _options?: ImportOptions): Promise<ImportResult>;
}

export interface BackupOptions {
  includeMetadata?: boolean;
  compression?: boolean;
  encryption?: BackupEncryption;
  incremental?: boolean;
  baseBackupId?: string;
  filters?: BackupFilters;
}

export interface BackupInfo {
  id: string;
  type: 'full' | 'incremental';
  createdAt: Date;
  size: number;
  status: 'creating' | 'completed' | 'failed';
  metadata: {
    totalKeys: number;
    checksum: string;
    version: string;
    baseBackupId?: string;
  };
}

export interface RestoreOptions {
  overwriteExisting?: boolean;
  keyPrefix?: string;
  filters?: BackupFilters;
  dryRun?: boolean;
}

export interface BackupEncryption {
  algorithm: 'AES256';
  key: string;
}

export interface BackupFilters {
  keyPatterns?: string[];
  excludePatterns?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  tags?: string[];
}

export interface ExportResult {
  data: ExportData;
  metadata: {
    exportedAt: Date;
    totalRecords: number;
    format: 'json' | 'csv' | 'binary';
    checksum: string;
  };
}

export interface ImportResult {
  success: boolean;
  importedRecords: number;
  skippedRecords: number;
  errors: ImportError[];
  duration: number;
}

export interface ImportError {
  record: number;
  key?: string;
  error: string;
}

export type ExportData = Array<{ key: string; value: unknown; metadata?: unknown }>;
export type ImportData = ExportData;

export interface ImportOptions {
  overwriteExisting?: boolean;
  validateSchema?: boolean;
  batchSize?: number;
  continueOnError?: boolean;
  dryRun?: boolean;
}

// Type guards and utilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isStorageEngine(obj: any): obj is StorageEngine {
  return obj &&
    typeof obj.get === 'function' &&
    typeof obj.set === 'function' &&
    typeof obj.delete === 'function';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDocumentStorage<T>(obj: any): obj is DocumentStorage<T> {
  return obj &&
    typeof obj.findById === 'function' &&
    typeof obj.create === 'function' &&
    typeof obj.update === 'function';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isBlobStorage(obj: any): obj is BlobStorage {
  return obj &&
    typeof obj.put === 'function' &&
    typeof obj.get === 'function' &&
    typeof obj.getStream === 'function';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isTransaction(obj: any): obj is Transaction {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.commit === 'function' &&
    typeof obj.rollback === 'function';
}

// Utility functions
export function createStorageKey(prefix: string, ...parts: (string | number)[]): string {
  return [prefix, ...parts.map(p => String(p))].join(':');
}

export function parseStorageKey(key: string, separator = ':'): string[] {
  return key.split(separator);
}

export function calculateStorageSize(value: unknown): number {
  if (typeof value === 'string') {
    return new Blob([value]).size;
  }

  if (value instanceof Buffer || value instanceof ArrayBuffer) {
    return value.byteLength;
  }

  // Rough JSON size estimation
  return new Blob([JSON.stringify(value)]).size;
}

export function createExpirationDate(ttl: number): Date {
  return new Date(Date.now() + ttl);
}

export function isExpired(expiresAt: Date): boolean {
  return expiresAt <= new Date();
}

export function sanitizeKey(key: string): string {
  // Remove or replace invalid characters for storage keys
  return key.replace(/[^\w\-.:]/g, '_');
}

export function generateStorageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function compressValue<T>(value: T, _algorithm: CompressionConfig['algorithm']): Promise<Buffer> {
  // Implementation would depend on the compression algorithm
  // This is a placeholder for the actual compression logic
  const data = JSON.stringify(value);
  return Promise.resolve(Buffer.from(data));
}

export function decompressValue<T>(data: Buffer, _algorithm: CompressionConfig['algorithm']): Promise<T> {
  // Implementation would depend on the compression algorithm
  // This is a placeholder for the actual decompression logic
  const jsonString = data.toString();
  return Promise.resolve(JSON.parse(jsonString));
}

export function createChecksum(data: string | Buffer): string {
  // Simple checksum implementation - in production, use crypto.createHash
  let hash = 0;
  const str = typeof data === 'string' ? data : data.toString();
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(16);
}