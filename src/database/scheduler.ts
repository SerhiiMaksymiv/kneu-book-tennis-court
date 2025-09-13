import cron from 'node-cron';
import { DatabaseConnection } from './connection.js';
import { BookingRepository } from './repository.js';

export class DatabaseScheduler {
  private dbConnection: DatabaseConnection;
  private bookingRepo: BookingRepository;

  constructor(dbConnection: DatabaseConnection, bookingRepo: BookingRepository) {
    this.dbConnection = dbConnection;
    this.bookingRepo = bookingRepo;
  }

  start() {
    // Daily backup at 2 AM
    if (process.env.DB_AUTO_BACKUP === 'true') {
      cron.schedule('0 2 * * *', async () => {
        console.log('🔄 Starting scheduled backup...');
        try {
          await this.dbConnection.backup();
          await this.dbConnection.cleanupOldBackups();
          console.log('✅ Scheduled backup completed');
        } catch (error) {
          console.error('❌ Scheduled backup failed:', error);
        }
      });
    }

    // Mark past sessions as completed (every hour)
    cron.schedule('0 * * * *', async () => {
      try {
        await this.markPastSessionsCompleted();
      } catch (error) {
        console.error('❌ Error marking past sessions:', error);
      }
    });

    // Database health check (every 6 hours)
    cron.schedule('0 */6 * * *', async () => {
      const health = await this.dbConnection.healthCheck();
      if (health.status === 'unhealthy') {
        console.error('🚨 Database health check failed:', health.details);
      } else {
        console.log('💚 Database health check passed');
      }
    });

    console.log('⏰ Database scheduler started');
  }

  private async markPastSessionsCompleted(): Promise<void> {
    const db = this.dbConnection.getDatabase();
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().substring(0, 5);

    const result = db.prepare(`
      UPDATE bookings 
      SET status = 'completed', updatedAt = CURRENT_TIMESTAMP
      WHERE status = 'active' 
        AND (sessionDate < ? OR (sessionDate = ? AND sessionTime < ?))
    `).run(currentDate, currentDate, currentTime);

    if (result.changes > 0) {
      console.log(`📝 Marked ${result.changes} past sessions as completed`);
    }
  }
}
