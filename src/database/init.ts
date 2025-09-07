import dotenv from 'dotenv';
import { DatabaseConnection } from './connection';
import { MigrationManager } from './migration';
import { SQLiteConfig } from './types.js';

dotenv.config();

async function initializeDatabase() {
  console.log('🚀 Initializing database...');

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
    const migrationManager = new MigrationManager(dbConnection);

    await migrationManager.runMigrations();

    // Test the connection
    const health = await dbConnection.healthCheck();
    console.log('🔍 Database health:', health);

    // Create initial backup
    if (config.autoBackup) {
      console.log('📦 Creating initial backup...');
      await dbConnection.backup();
    }

    console.log('✅ Database initialization completed successfully');
    
    dbConnection.close();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  initializeDatabase();
}