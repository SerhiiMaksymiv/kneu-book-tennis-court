import { DatabaseConnection } from './connection.js';
import { Booking } from '../types/index.js';

export class BookingRepository {
  private dbConnection: DatabaseConnection;
  private db: any;

  constructor(dbConnection: DatabaseConnection) {
    this.dbConnection = dbConnection;
    this.db = dbConnection.getDatabase();
  }

  // Prepared statements for better performance
  private statements = {
    createBooking: null as any,
    getBookingsByUser: null as any,
    getBookingById: null as any,
    updateBooking: null as any,
    getActiveBookings: null as any,
    getBookingsByDateRange: null as any
  };

  private initializeStatements() {
    if (!this.statements.createBooking) {
      this.statements.createBooking = this.db.prepare(`
        INSERT INTO bookings 
        (telegramUserId, username, phoneNumber, sessionDate, sessionTime, googleEventId, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this.statements.getBookingsByUser = this.db.prepare(`
        SELECT * FROM bookings 
        WHERE telegramUserId = ? AND status = 'active'
        ORDER BY sessionDate, sessionTime
      `);

      this.statements.getBookingById = this.db.prepare(`
        SELECT * FROM bookings WHERE id = ?
      `);

      this.statements.getActiveBookings = this.db.prepare(`
        SELECT * FROM bookings 
        WHERE status = 'active' AND sessionDate >= date('now')
        ORDER BY sessionDate, sessionTime
      `);

      this.statements.getBookingsByDateRange = this.db.prepare(`
        SELECT * FROM bookings 
        WHERE sessionDate BETWEEN ? AND ? 
        ORDER BY sessionDate, sessionTime
      `);
    }
  }

  async createBooking(booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    this.initializeStatements();
    
    try {
      const result = this.statements.createBooking.run(
        booking.telegramUserId,
        booking.username,
        booking.phoneNumber,
        booking.sessionDate,
        booking.sessionTime,
        booking.googleEventId,
        booking.status,
        (booking as any).notes || null
      );

      // Log booking creation
      await this.logBookingHistory(result.lastInsertRowid, 'created', null, booking, booking.telegramUserId);
      
      return result.lastInsertRowid;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('This time slot is already booked');
      }
      throw error;
    }
  }

  async getBookingsByUser(telegramUserId: string): Promise<Booking[]> {
    this.initializeStatements();
    return this.statements.getBookingsByUser.all(telegramUserId);
  }

  async getBookingById(id: number): Promise<Booking | null> {
    this.initializeStatements();
    return this.statements.getBookingById.get(id) || null;
  }

  async updateBooking(id: number, updates: Partial<Booking>, performedBy: string): Promise<void> {
    const oldBooking = await this.getBookingById(id);
    if (!oldBooking) {
      throw new Error('Booking not found');
    }

    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);

    const updateStmt = this.db.prepare(`
      UPDATE bookings 
      SET ${fields}, updatedAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    updateStmt.run(...values, id);

    // Log the update
    await this.logBookingHistory(id, 'modified', oldBooking, { ...oldBooking, ...updates }, performedBy);
  }

  async cancelBooking(id: number, performedBy: string): Promise<void> {
    const oldBooking = await this.getBookingById(id);
    if (!oldBooking) {
      throw new Error('Booking not found');
    }

    await this.updateBooking(id, { status: 'cancelled' }, performedBy);
    await this.logBookingHistory(id, 'cancelled', oldBooking, { ...oldBooking, status: 'cancelled' }, performedBy);
  }

  async getActiveBookings(): Promise<Booking[]> {
    this.initializeStatements();
    return this.statements.getActiveBookings.all();
  }

  async getBookingsByDateRange(startDate: string, endDate: string): Promise<Booking[]> {
    this.initializeStatements();
    return this.statements.getBookingsByDateRange.all(startDate, endDate);
  }

  async getBookingStatistics(days: number = 30): Promise<any> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as totalBookings,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as activeBookings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelledBookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedBookings,
        COUNT(DISTINCT telegramUserId) as uniqueUsers,
        AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) as completionRate
      FROM bookings 
      WHERE createdAt >= ?
    `).get(cutoffDate.toISOString());

    return stats;
  }

  private async logBookingHistory(
    bookingId: number, 
    action: string, 
    oldValues: any, 
    newValues: any, 
    performedBy: string
  ): Promise<void> {
    const historyStmt = this.db.prepare(`
      INSERT INTO booking_history (bookingId, action, oldValues, newValues, performedBy)
      VALUES (?, ?, ?, ?, ?)
    `);

    historyStmt.run(
      bookingId,
      action,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      performedBy
    );
  }
}