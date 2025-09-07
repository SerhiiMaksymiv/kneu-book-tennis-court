import dotenv from 'dotenv';
import { DatabaseConnection } from './connection.js';
import { SQLiteConfig } from './types.js';
import path from 'path';
import fs from 'fs-extra';

dotenv.config();

async function performBackup() {
  const config: SQLiteConfig = {
    dbPath: process.env.SQLITE_DB_PATH || './data/tennis_bookings.db',
    backupPath: process.env.SQLITE_BACKUP_PATH || './data/backups/',
    maxConnections: parseInt(process.env.SQLITE_MAX_CONNECTIONS || '10'),
    timeout: parseInt(process.env.SQLITE_TIMEOUT || '30000'),
    autoBackup: process.env.DB_AUTO_BACKUP === 'true',
    backupInterval: parseInt(process.env.DB_BACKUP_INTERVAL || '24'),
    retentionDays: parseInt(process.env.DB_RETENTION_DAYS || '30'),
    logQueries: process.env.DB_LOG_QUERIES === 'true'
  };

  try {
    const dbConnection = new DatabaseConnection(config);
    
    console.log('📦 Starting database backup...');
    const backupInfo = await dbConnection.backup();
    
    console.log('✅ Backup completed successfully:');
    console.log(`   File: ${backupInfo.filename}`);
    console.log(`   Size: ${(backupInfo.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Path: ${backupInfo.path}`);
    console.log(`   Checksum: ${backupInfo.checksum}`);
    
    // Cleanup old backups
    await dbConnection.cleanupOldBackups();
    
    dbConnection.close();
  } catch (error) {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  }
}

async function listBackups() {
  const backupPath = process.env.SQLITE_BACKUP_PATH || './data/backups/';
  
  try {
    const backupFiles = fs.readdirSync(backupPath)
      .filter(file => file.startsWith('tennis_bookings_') && file.endsWith('.db'))
      .map(file => {
        const fullPath = path.join(backupPath, file);
        const stats = fs.statSync(fullPath);
        return {
          name: file,
          path: fullPath,
          size: stats.size,
          created: stats.mtime
        };
      })
      .sort((a, b) => b.created.getTime() - a.created.getTime());

    console.log(`📁 Available backups (${backupFiles.length}):\n`);
    
    backupFiles.forEach((backup, index) => {
      const sizeInMB = (backup.size / 1024 / 1024).toFixed(2);
      const dateStr = backup.created.toLocaleString();
      console.log(`${index + 1}. ${backup.name}`);
      console.log(`   Size: ${sizeInMB} MB`);
      console.log(`   Created: ${dateStr}`);
      console.log(`   Path: ${backup.path}\n`);
    });
  } catch (error) {
    console.error('❌ Failed to list backups:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'create':
      performBackup();
      break;
    case 'list':
      listBackups();
      break;
    default:
      console.log('Usage: npm run db:backup [create|list]');
      process.exit(1);
  }
}