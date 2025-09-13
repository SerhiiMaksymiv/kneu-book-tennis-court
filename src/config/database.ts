import { DatabaseConnection } from '../database/connection.js';
import { BookingRepository } from '../database/repository.js';
import { MigrationManager } from '../database/migration.js';
import { DatabaseScheduler } from '../database/scheduler.js';
import { SQLiteConfig } from '../database/types.js';
import { Booking } from '../types/index.js';

export class Database {
  private dbConnection: DatabaseConnection;
  private bookingRepo: BookingRepository;
  private migrationManager: MigrationManager;
  private scheduler: DatabaseScheduler;

  constructor(config: SQLiteConfig) {
    this.dbConnection = new DatabaseConnection(config);
    this.bookingRepo = new BookingRepository(this.dbConnection);
    this.migrationManager = new MigrationManager(this.dbConnection);
    this.scheduler = new DatabaseScheduler(this.dbConnection, this.bookingRepo);
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing database system...');
    
    // Run migrations
    await this.migrationManager.runMigrations();
    
    // Start scheduler for maintenance tasks
    this.scheduler.start();
    
    // Perform health check
    const health = await this.dbConnection.healthCheck();
    if (health.status === 'unhealthy') {
      throw new Error(`Database health check failed: ${JSON.stringify(health.details)}`);
    }
    
    console.log('✅ Database system initialized successfully');
  }

  // Legacy methods for backward compatibility
  async createBooking(booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    return this.bookingRepo.createBooking(booking);
  }

  async getBookingsByUser(telegramUserId: string): Promise<Booking[]> {
    return this.bookingRepo.getBookingsByUser(telegramUserId);
  }

  async getBookingById(id: number): Promise<Booking | null> {
    return this.bookingRepo.getBookingById(id);
  }

  async updateBooking(id: number, updates: Partial<Booking>): Promise<void> {
    // Default to system user if not specified
    await this.bookingRepo.updateBooking(id, updates, updates.telegramUserId || 'system');
  }

  async cancelBooking(id: number): Promise<void> {
    const booking = await this.bookingRepo.getBookingById(id);
    if (!booking) {
      throw new Error('Booking not found');
    }
    await this.bookingRepo.cancelBooking(id, booking.telegramUserId);
  }

  async getActiveBookings(): Promise<Booking[]> {
    return this.bookingRepo.getActiveBookings();
  }

  // Token management methods
  async storeTokens(accessToken: string, refreshToken: string, expiryDate: number): Promise<void> {
    const db = this.dbConnection.getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO auth_tokens (id, accessToken, refreshToken, expiryDate, updatedAt)
      VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(accessToken, refreshToken, expiryDate);
  }

  async getTokens(): Promise<{ accessToken: string; refreshToken: string; expiryDate: number } | null> {
    const db = this.dbConnection.getDatabase();
    const stmt = db.prepare(`SELECT accessToken, refreshToken, expiryDate FROM auth_tokens WHERE id = 1`);
    return stmt.get() || null as any;
  }

  // Enhanced methods
  getBookingRepository(): BookingRepository {
    return this.bookingRepo;
  }

  getDatabaseConnection(): DatabaseConnection {
    return this.dbConnection;
  }

  async getStatistics(days: number = 30): Promise<any> {
    return this.bookingRepo.getBookingStatistics(days);
  }

  async performBackup(): Promise<void> {
    await this.dbConnection.backup();
  }

  async healthCheck(): Promise<any> {
    return this.dbConnection.healthCheck();
  }

  close(): void {
    this.dbConnection.close();
  }
}
