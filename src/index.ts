import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { Database } from './config/database.js';
import { GoogleCalendarService } from './services/googleCalendar.js';
import { BotService } from './services/botService.js';
import { AuthServer } from './server.js';

dotenv.config();

async function main() {
  // Validate environment variables
  const requiredEnvVars = ['BOT_TOKEN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars);
    process.exit(1);
  }

  try {
    // Initialize services
    const db = new Database(process.env.DB_PATH || './tennis_bookings.db');
    await db.init();
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
