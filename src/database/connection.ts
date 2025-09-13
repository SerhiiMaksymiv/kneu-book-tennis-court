import Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { SQLiteConfig, BackupInfo } from './types.js';

export class DatabaseConnection {
  private db: Database.Database;
  private config: SQLiteConfig;
  private isConnected: boolean = false;

  constructor(config: SQLiteConfig) {
    this.db = new Database(config.dbPath, {
      timeout: config.timeout,
      verbose: config.logQueries ? console.log : undefined
    });
    this.config = config;
    this.ensureDirectoryExists();
    this.initializeConnection();
  }

  private ensureDirectoryExists() {
    const dbDir = path.dirname(this.config.dbPath);
    const backupDir = this.config.backupPath;
    
    fs.ensureDirSync(dbDir);
    fs.ensureDirSync(backupDir);
    
    console.log(`📁 Database directory: ${dbDir}`);
    console.log(`📁 Backup directory: ${backupDir}`);
  }

  private initializeConnection() {
    try {
      this.db = new Database(this.config.dbPath, {
        timeout: this.config.timeout,
        verbose: this.config.logQueries ? console.log : undefined
      });

      // Configure SQLite for better performance and reliability
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('temp_store = memory');
      this.db.pragma('mmap_size = 268435456'); // 256MB

      this.isConnected = true;
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  getDatabase(): Database.Database {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const result = this.db.prepare('SELECT 1 as test').get();
      const stats = fs.statSync(this.config.dbPath);
      
      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          dbPath: this.config.dbPath,
          size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          lastModified: stats.mtime,
          testQuery: result
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  async backup(): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `tennis_bookings_${timestamp}.db`;
    const backupPath = path.join(this.config.backupPath, filename);

    try {
      // Create backup using SQLite backup API
      await this.db.backup(backupPath);
      const stats = fs.statSync(backupPath);
      const checksum = await this.calculateChecksum(backupPath);

      const backupInfo: BackupInfo = {
        filename,
        path: backupPath,
        size: stats.size,
        timestamp: new Date(),
        checksum
      };

      console.log(`✅ Backup created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      return backupInfo;
    } catch (error) {
      console.error('❌ Backup failed:', error);
      throw error;
    }
  }

  async restore(backupPath: string): Promise<void> {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Verify backup integrity
      const isValid = await this.verifyBackup(backupPath);
      if (!isValid) {
        throw new Error('Backup file is corrupted');
      }

      // Close current connection
      this.close();

      // Replace database file
      fs.copyFileSync(backupPath, this.config.dbPath);

      // Reconnect
      this.initializeConnection();

      console.log(`✅ Database restored from: ${backupPath}`);
    } catch (error) {
      console.error('❌ Restore failed:', error);
      throw error;
    }
  }

  async cleanupOldBackups(): Promise<void> {
    try {
      const backupFiles = fs.readdirSync(this.config.backupPath)
        .filter(file => file.startsWith('tennis_bookings_') && file.endsWith('.db'))
        .map(file => ({
          name: file,
          path: path.join(this.config.backupPath, file),
          stats: fs.statSync(path.join(this.config.backupPath, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      let deletedCount = 0;
      for (const backup of backupFiles) {
        if (backup.stats.mtime < cutoffDate) {
          fs.unlinkSync(backup.path);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`🗑️ Cleaned up ${deletedCount} old backup(s)`);
      }
    } catch (error) {
      console.error('❌ Backup cleanup failed:', error);
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async verifyBackup(backupPath: string): Promise<boolean> {
    try {
      const testDb = new Database(backupPath, { readonly: true });
      testDb.prepare('SELECT COUNT(*) FROM sqlite_master').get();
      testDb.close();
      return true;
    } catch (error) {
      return false;
    }
  }

  close(): void {
    if (this.db && this.isConnected) {
      this.db.close();
      this.isConnected = false;
      console.log('🔌 Database connection closed');
    }
  }
}