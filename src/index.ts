import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { Database } from './config/database.js';
import { GoogleCalendarService } from './services/googleCalendar.js';
import { BotService } from './services/botService.js';
import { AuthServer } from './server.js';
import { SQLiteConfig } from './database/types.js';

dotenv.config();

async function main() {
  // Validate environment variables
  const requiredEnvVars = ['BOT_TOKEN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars);
    process.exit(1);
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
    // Initialize services
    // const db = new Database(process.env.DB_PATH || './tennis_bookings.db');
    // await db.init();
    const db = new Database();
    const calendar = new GoogleCalendarService(db);
    const bot = new Telegraf(process.env.BOT_TOKEN!);
    
    // Initialize bot service
    new BotService(bot, db, calendar);

    // Start auth server
    const authServer = new AuthServer(calendar);
    authServer.start(parseInt(process.env.PORT || '3000'));

    // Start bot
    await bot.launch();
    console.log('🎾 Tennis booking bot started successfully!');
    console.log('📱 Bot username:', (await bot.telegram.getMe()).username);

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

main().catch(console.error);
