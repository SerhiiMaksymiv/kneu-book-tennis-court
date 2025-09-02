import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { Booking } from '../types/index.js';

export class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
  }

  async init() {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegramUserId TEXT NOT NULL,
        username TEXT,
        phoneNumber TEXT,
        sessionDate TEXT NOT NULL,
        sessionTime TEXT NOT NULL,
        googleEventId TEXT,
        status TEXT DEFAULT 'active',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        accessToken TEXT NOT NULL,
        refreshToken TEXT NOT NULL,
        expiryDate INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async createBooking(booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const run = promisify(this.db.run.bind(this.db));
    const result = await run(`
      INSERT INTO bookings 
      (telegramUserId, username, phoneNumber, sessionDate, sessionTime, googleEventId, status)
      VALUES ( ${booking.telegramUserId}, ${booking.username}, ${booking.phoneNumber}, ${booking.sessionDate}, ${booking.sessionTime}, ${booking.googleEventId}, ${booking.status})`);
    return (result as any).lastID;
  }

  async getBookingsByUser(telegramUserId: string): Promise<Booking[]> {
    const all = promisify(this.db.all.bind(this.db));
    return await all(`
      SELECT * FROM bookings 
      WHERE telegramUserId = ${telegramUserId} AND status = 'active'
      ORDER BY sessionDate, sessionTime
    `) as Promise<Booking[]>;
  }

  async getBookingById(id: number): Promise<Booking | null> {
    const get = promisify(this.db.get.bind(this.db));
    return await get(`SELECT * FROM bookings WHERE id = ${id}`) as Promise<Booking | null>;
  }

  async updateBooking(id: number, updates: Partial<Booking>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);

    new Promise((res, rej) => {
      return res(this.db.run(`
        UPDATE bookings 
        SET ${fields}, updatedAt = CURRENT_TIMESTAMP 
        WHERE id = ?`, [...values, id]
      ))
    })
  }

  async cancelBooking(id: number): Promise<void> {
    await this.updateBooking(id, { status: 'cancelled' });
  }

  async getActiveBookings(): Promise<Booking[]> {
    const all = promisify(this.db.all.bind(this.db));
    return await all(`
      SELECT * FROM bookings 
      WHERE status = 'active'
      ORDER BY sessionDate, sessionTime
    `) as Promise<Booking[]>;
  }

  async storeTokens(accessToken: string, refreshToken: string, expiryDate: number): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    await run(`DELETE FROM auth_tokens`); // Keep only latest token
    await run(`
      INSERT INTO auth_tokens (accessToken, refreshToken, expiryDate)
      VALUES (${accessToken}, ${refreshToken}, ${expiryDate})`);
  }

  async getTokens(): Promise<{ accessToken: string; refreshToken: string; expiryDate: number } | null> {
    const get = promisify(this.db.get.bind(this.db));
    return get(`SELECT * FROM auth_tokens ORDER BY id DESC LIMIT 1`) as Promise<{ accessToken: string; refreshToken: string; expiryDate: number } | null>;
  }
}
