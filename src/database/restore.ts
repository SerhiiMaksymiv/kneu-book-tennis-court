import dotenv from 'dotenv';
import { DatabaseConnection } from './connection.js';
import { SQLiteConfig } from './types.js';
import readline from 'readline';
import fs from 'fs-extra';

dotenv.config();

async function performRestore() {
  const backupPath = process.argv[3];
  
  if (!backupPath) {
    console.error('❌ Please provide backup file path');
    console.log('Usage: npm run db:restore -- /path/to/backup.db');
    process.exit(1);
  }

  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Backup file not found: ${backupPath}`);
    process.exit(1);
  }

  // Confirm restoration
  const confirmed = await confirmRestore(backupPath);
  if (!confirmed) {
    console.log('❌ Restore cancelled');
    return;
  }

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
    
    // Create backup of current database before restore
    console.log('📦 Creating backup of current database...');
    const currentBackup = await dbConnection.backup();
    console.log(`✅ Current database backed up as: ${currentBackup.filename}`);
    
    // Perform restore
    console.log('🔄 Restoring database...');
    await dbConnection.restore(backupPath);
    
    // Verify restore
    const health = await dbConnection.healthCheck();
    if (health.status === 'healthy') {
      console.log('✅ Database restored successfully');
      console.log('🔍 Health check passed');
    } else {
      console.error('❌ Database restore completed but health check failed');
    }
    
    dbConnection.close();
  } catch (error) {
    console.error('❌ Restore failed:', error);
    process.exit(1);
  }
}

async function confirmRestore(backupPath: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('⚠️  WARNING: This will replace your current database!');
    console.log(`   Restoring from: ${backupPath}`);
    console.log('   A backup of your current database will be created first.\n');
    
    rl.question('Are you sure you want to continue? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

if (require.main === module) {
  performRestore();
}