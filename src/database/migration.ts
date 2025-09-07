import { Migration } from './types.js';
import { DatabaseConnection } from './connection.js';

export class MigrationManager {
  private dbConnection: DatabaseConnection;

  constructor(dbConnection: DatabaseConnection) {
    this.dbConnection = dbConnection;
    this.initializeMigrationsTable();
  }

  private initializeMigrationsTable() {
    const db = this.dbConnection.getDatabase();
    
    db.prepare(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      )
    `).run();
  }

  private getMigrations(): Migration[] {
    return [
      {
        version: 1,
        name: 'initial_schema',
        timestamp: new Date(),
        up: `
          CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegramUserId TEXT NOT NULL,
            username TEXT,
            phoneNumber TEXT,
            sessionDate TEXT NOT NULL,
            sessionTime TEXT NOT NULL,
            googleEventId TEXT,
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
            notes TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_session UNIQUE (sessionDate, sessionTime)
          );

          CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(telegramUserId);
          CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(sessionDate, sessionTime);
          CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
        `,
        down: `
          DROP TABLE IF EXISTS bookings;
        `
      },
      {
        version: 2,
        name: 'auth_tokens_table',
        timestamp: new Date(),
        up: `
          CREATE TABLE IF NOT EXISTS auth_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            accessToken TEXT NOT NULL,
            refreshToken TEXT NOT NULL,
            expiryDate INTEGER NOT NULL,
            scope TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: `
          DROP TABLE IF EXISTS auth_tokens;
        `
      },
      {
        version: 3,
        name: 'user_preferences_table',
        timestamp: new Date(),
        up: `
          CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegramUserId TEXT NOT NULL UNIQUE,
            timezone TEXT DEFAULT 'Europe/Kiev',
            notifications BOOLEAN DEFAULT true,
            language TEXT DEFAULT 'en',
            preferredTimes TEXT, -- JSON array of preferred hours
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_preferences(telegramUserId);
        `,
        down: `
          DROP TABLE IF EXISTS user_preferences;
        `
      },
      {
        version: 4,
        name: 'booking_history_table',
        timestamp: new Date(),
        up: `
          CREATE TABLE IF NOT EXISTS booking_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bookingId INTEGER NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('created', 'modified', 'cancelled', 'completed')),
            oldValues TEXT, -- JSON of old values for modifications
            newValues TEXT, -- JSON of new values for modifications
            performedBy TEXT NOT NULL, -- telegramUserId who performed the action
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (bookingId) REFERENCES bookings(id)
          );

          CREATE INDEX IF NOT EXISTS idx_history_booking ON booking_history(bookingId);
          CREATE INDEX IF NOT EXISTS idx_history_timestamp ON booking_history(timestamp);
        `,
        down: `
          DROP TABLE IF EXISTS booking_history;
        `
      }
    ];
  }

  async runMigrations(): Promise<void> {
    const db = this.dbConnection.getDatabase();
    const migrations = this.getMigrations();

    // Get current version
    const currentVersionRow = db.prepare(`
      SELECT MAX(version) as version FROM migrations
    `).get() as { version: number | null };
    
    const currentVersion = currentVersionRow?.version || 0;

    console.log(`📊 Current database version: ${currentVersion}`);

    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date');
      return;
    }

    console.log(`🔄 Running ${pendingMigrations.length} migration(s)...`);

    for (const migration of pendingMigrations) {
      try {
        console.log(`📝 Applying migration ${migration.version}: ${migration.name}`);
        
        // Start transaction
        const transaction = db.transaction(() => {
          // Execute migration
          db.exec(migration.up);
          
          // Record migration
          db.prepare(`
            INSERT INTO migrations (version, name, checksum)
            VALUES (?, ?, ?)
          `).run(migration.version, migration.name, this.calculateMigrationChecksum(migration));
        });

        transaction();
        console.log(`✅ Migration ${migration.version} completed`);
      } catch (error) {
        console.error(`❌ Migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    console.log('🎉 All migrations completed successfully');
  }

  async rollback(targetVersion: number): Promise<void> {
    const db = this.dbConnection.getDatabase();
    const migrations = this.getMigrations().reverse();

    const currentVersionRow = db.prepare(`
      SELECT MAX(version) as version FROM migrations
    `).get() as { version: number | null };
    
    const currentVersion = currentVersionRow?.version || 0;

    if (targetVersion >= currentVersion) {
      console.log('❌ Target version must be lower than current version');
      return;
    }

    const migrationsToRollback = migrations.filter(m => 
      m.version > targetVersion && m.version <= currentVersion
    );

    console.log(`🔄 Rolling back ${migrationsToRollback.length} migration(s)...`);

    for (const migration of migrationsToRollback) {
      try {
        console.log(`📝 Rolling back migration ${migration.version}: ${migration.name}`);
        
        const transaction = db.transaction(() => {
          db.exec(migration.down);
          db.prepare(`DELETE FROM migrations WHERE version = ?`).run(migration.version);
        });

        transaction();
        console.log(`✅ Rollback ${migration.version} completed`);
      } catch (error) {
        console.error(`❌ Rollback ${migration.version} failed:`, error);
        throw error;
      }
    }

    console.log('🎉 Rollback completed successfully');
  }

  private calculateMigrationChecksum(migration: Migration): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(migration.up + migration.down)
      .digest('hex');
  }
}