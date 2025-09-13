import dotenv from 'dotenv';
import { DatabaseConnection } from './connection.js';
import { BookingRepository } from './repository.js';
import { SQLiteConfig } from './types.js';

dotenv.config();

async function performHealthCheck() {
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
    const bookingRepo = new BookingRepository(dbConnection);

    // Basic health check
    const health = await dbConnection.healthCheck();
    console.log('📊 Database Health Check Results:');
    console.log('Status:', health.status);
    console.log('Details:', JSON.stringify(health.details, null, 2));

    // Statistics
    const stats = await bookingRepo.getBookingStatistics(30);
    console.log('\n📈 Booking Statistics (Last 30 days):');
    console.log('Total Bookings:', stats.totalBookings);
    console.log('Active Bookings:', stats.activeBookings);
    console.log('Cancelled Bookings:', stats.cancelledBookings);
    console.log('Completed Bookings:', stats.completedBookings);
    console.log('Unique Users:', stats.uniqueUsers);
    console.log('Completion Rate:', (stats.completionRate * 100).toFixed(2) + '%');

    dbConnection.close();
  } catch (error) {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  performHealthCheck();
}