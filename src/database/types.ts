export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionTimeout?: number;
  maxConnections?: number;
}

export interface SQLiteConfig {
  dbPath: string;
  backupPath: string;
  maxConnections: number;
  timeout: number;
  autoBackup: boolean;
  backupInterval: number;
  retentionDays: number;
  logQueries: boolean;
}

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
  timestamp: Date;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  timestamp: Date;
  checksum: string;
}