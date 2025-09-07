import { Context, Telegraf, Markup } from 'telegraf';
import { callbackQuery } from "telegraf/filters";
import { Database } from '../config/database.js';
import { GoogleCalendarService } from './googleCalendar.js';
import { TimeSlot, DayTimeSlot } from '../types/index.js';
import moment from 'moment';

export class BotService {
  private bot: Telegraf;
  private db: Database;
  private calendar: GoogleCalendarService;

  constructor(bot: Telegraf, db: Database, calendar: GoogleCalendarService) {
    this.bot = bot;
    this.db = db;
    this.calendar = calendar;
    this.setupCommands();
  }

  private setupCommands() {
    this.bot.start((ctx) => this.handleStart(ctx));
    this.bot.command('book', (ctx) => this.handleBook(ctx));
    this.bot.command('mybookings', (ctx) => this.handleMyBookings(ctx));
    // this.bot.command('cancel', (ctx) => this.handleCancelCommand(ctx));
    
    this.bot.action(/^book_(.+)$/, (ctx) => this.handleBookSlot(ctx));
    // this.bot.action(/^cancel_(\d+)$/, (ctx) => this.handleCancelBooking(ctx));
    // this.bot.action(/^modify_(\d+)$/, (ctx) => this.handleModifyBooking(ctx));
    this.bot.action('show_available_slots', (ctx) => this.showAvailableSlots(ctx));
    this.bot.action('show_available_day_slots', (ctx) => this.showAvailableDaySlots(ctx));
    this.bot.action('main_menu', (ctx) => this.showMainMenu(ctx));
  }

  private async handleStart(ctx: Context) {
    const welcomeMessage = `
🎾 Welcome to Tennis Session Booking Bot!

I can help you:
• 📅 Book tennis sessions
• 👀 View your bookings
• ✏️ Modify or cancel bookings

Let's get started!`;
    await ctx.reply(welcomeMessage, this.getMainMenuKeyboard());
  }

  private async handleBook(ctx: Context) {
    await this.showAvailableSlots(ctx);
  }

  private async showAvailableDaySlots(ctx: Context) {
    try {
      await ctx.reply('🔍 Checking available slots...');
      
      const slots = await this.calendar.getAvailableDaySlots(14);
      
      if (slots.length === 0) {
        await ctx.reply('😔 No available slots found for the next 14 days. Please try again later.', 
          Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'main_menu')]]));
        return;
      }

      const keyboard = this.createDaySlotsKeyboard(slots);
      await ctx.reply('🎾 Available tennis sessions:\n\nSelect day to book:', keyboard);
    } catch (error) {
      console.error('Error showing available slots:', error);
      await ctx.reply('❌ Sorry, I had trouble fetching available slots. Please try again later.',
        Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'main_menu')]]));
    }
  }

  private async showAvailableSlots(ctx: Context) {
    try {
      await ctx.reply('🔍 Checking available slots...');
      
      const slots = await this.calendar.getAvailableSlots(14);
      
      if (slots.length === 0) {
        await ctx.reply('😔 No available slots found for the next 7 days. Please try again later.', 
          Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'main_menu')]]));
        return;
      }

      const keyboard = this.createSlotsKeyboard(slots);
      await ctx.reply('🎾 Available tennis sessions:\n\nSelect a time slot to book:', keyboard);
    } catch (error) {
      console.error('Error showing available slots:', error);
      await ctx.reply('❌ Sorry, I had trouble fetching available slots. Please try again later.',
        Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'main_menu')]]));
    }
  }

  private createDaySlotsKeyboard(slots: DayTimeSlot[]) {
    const buttons = slots.slice(0, 20).map(slot => {
      const displayDate = moment(`${slot.date}`).format('MMM DD');
      return Markup.button.callback(`📅 ${displayDate}`, `book_day_${slot.date}`)
    });

    buttons.push(Markup.button.callback('🏠 Main Menu', 'main_menu'));
    return Markup.inlineKeyboard(buttons, { columns: 2 })
  }

  private createSlotsKeyboard(slots: TimeSlot[]) {
    const buttons = slots.slice(0, 20).map(slot => {
      const displayDate = moment(`${slot.date}`).format('MMM DD');
      return Markup.button.callback(`📅 ${displayDate}`, `book_${slot.date}`)
    });

    buttons.push(Markup.button.callback('🏠 Main Menu', 'main_menu'));
    return Markup.inlineKeyboard(buttons, { columns: 2 })
  }

  private async handleBookSlot(ctx: Context) {
    if (ctx.has(callbackQuery("data"))) {
      const callbackData = ctx.callbackQuery?.data;
      if (!callbackData) return;

      const [, date, time] = callbackData.split('_');
      const userId = ctx.from?.id.toString();
      const username = ctx.from?.username;

      if (!userId) {
        await ctx.reply('❌ Unable to identify user. Please try again.');
        return;
      }

      try {
        // Create Google Calendar event
        const startDateTime = moment(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
        const endDateTime = startDateTime.clone().add(1, 'hour');

        const calendarEvent = {
          summary: `Tennis Session - @${username || 'Unknown'}`,
          description: `Tennis session booked by ${username || userId}\nTelegram ID: ${userId}`,
          start: {
            dateTime: startDateTime.toISOString(),
            timeZone: 'Europe/Kiev'
          },
          end: {
            dateTime: endDateTime.toISOString(),
            timeZone: 'Europe/Kiev'
          }
        };

        const googleEventId = await this.calendar.createEvent(calendarEvent);

        // Save to database
        const bookingId = await this.db.createBooking({
          telegramUserId: userId,
          username,
          phoneNumber: ctx.from?.username, // Telegram doesn't expose phone numbers directly
          sessionDate: date,
          sessionTime: time,
          googleEventId,
          status: 'active'
        });

        const displayDateTime = startDateTime.format('MMMM DD, YYYY at HH:mm');
        
        await ctx.reply(`✅ Successfully booked!
        
  🎾 **Tennis Session Details:**
  📅 Date & Time: ${displayDateTime}
  👤 Player: @${username || 'You'}
  🆔 Booking ID: #${bookingId}

  Your session has been added to the coach's calendar. You'll receive a reminder before your session.`,
          Markup.inlineKeyboard([
            [Markup.button.callback('📋 My Bookings', 'my_bookings')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ]));

        // Notify coach
        await this.notifyCoach(`🎾 New booking!\n👤 Player: @${username || userId}\n📅 ${displayDateTime}\n🆔 Booking #${bookingId}`);

      } catch (error) {
        console.error('Error booking slot:', error);
        await ctx.reply('❌ Sorry, there was an error booking your session. The slot might no longer be available. Please try another time.',
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Try Again', 'show_available_day_slots')]]));
      }

    }
  }

  private async handleMyBookings(ctx: Context) {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const bookings = await this.db.getBookingsByUser(userId);
      
      if (bookings.length === 0) {
        await ctx.reply('📋 You have no active bookings.',
          Markup.inlineKeyboard([
            [Markup.button.callback('🎾 Book Session', 'show_available_day_slots')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ]));
        return;
      }

      let message = '📋 **Your Active Bookings:**\n\n';
      const keyboard = [];

      for (const booking of bookings) {
        const displayDateTime = moment(`${booking.sessionDate} ${booking.sessionTime}`).format('MMM DD, YYYY at HH:mm');
        message += `🎾 **Booking #${booking.id}**\n📅 ${displayDateTime}\n\n`;
        
        keyboard.push([
          Markup.button.callback(`✏️ Modify #${booking.id}`, `modify_${booking.id}`),
          Markup.button.callback(`❌ Cancel #${booking.id}`, `cancel_${booking.id}`)
        ]);
      }

      keyboard.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

      await ctx.reply(message, Markup.inlineKeyboard(keyboard));
    } catch (error) {
      console.error('Error fetching bookings:', error);
      await ctx.reply('❌ Error fetching your bookings. Please try again later.');
    }
  }

  private async handleCancelCommand(ctx: Context) {
    await this.handleMyBookings(ctx);
  }

  private async handleCancelBooking(ctx: Context) {
    if (ctx.has(callbackQuery("data"))) {
      const callbackData = ctx.callbackQuery?.data;
      if (!callbackData) return;

      const bookingId = parseInt(callbackData.split('_')[1]);
      
      try {
        const booking = await this.db.getBookingById(bookingId);
        if (!booking || booking.telegramUserId !== ctx.from?.id.toString()) {
          await ctx.reply('❌ Booking not found or not authorized.');
          return;
        }

        // Delete from Google Calendar
        if (booking.googleEventId) {
          await this.calendar.deleteEvent(booking.googleEventId);
        }

        // Cancel in database
        // await this.db.cancelBooking(bookingId);

        const displayDateTime = moment(`${booking.sessionDate} ${booking.sessionTime}`).format('MMMM DD, YYYY at HH:mm');
        
        await ctx.reply(`❌ **Booking Cancelled**

  🎾 Session: ${displayDateTime}
  🆔 Booking #${bookingId}

  Your booking has been cancelled and removed from the coach's calendar.`,
          Markup.inlineKeyboard([
            [Markup.button.callback('🎾 Book New Session', 'show_available_day_slots')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ]));

        // Notify coach
        await this.notifyCoach(`❌ Booking cancelled\n👤 Player: @${booking.username || booking.telegramUserId}\n📅 ${displayDateTime}\n🆔 Booking #${bookingId}`);

      } catch (error) {
        console.error('Error cancelling booking:', error);
        await ctx.reply('❌ Error cancelling booking. Please try again.');
      }
  }
  }

  private async handleModifyBooking(ctx: Context) {
    if (ctx.has(callbackQuery("data"))) {
      const callbackData = ctx.callbackQuery?.data;
      if (!callbackData) return;

      const bookingId = parseInt(callbackData.split('_')[1]);
      
      await ctx.reply(`🔄 To modify booking #${bookingId}, please:

  1️⃣ Cancel your current booking
  2️⃣ Book a new time slot

  This ensures the calendar stays accurate and the coach is properly notified.`,
        Markup.inlineKeyboard([
          [Markup.button.callback(`❌ Cancel #${bookingId}`, `cancel_${bookingId}`)],
          [Markup.button.callback('🎾 View Available Slots', 'show_available_day_slots')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ]));
    }
  }

  private getMainMenuKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🎾 Book Session', 'show_available_day_slots')],
      [Markup.button.callback('📋 My Bookings', 'my_bookings')]
    ]);
  }

  private async showMainMenu(ctx: Context) {
    await ctx.reply('🏠 **Main Menu**\n\nWhat would you like to do?', 
      this.getMainMenuKeyboard());
  }

  private async notifyCoach(message: string) {
    const coachId = process.env.COACH_TELEGRAM_ID;
    if (coachId) {
      try {
        await this.bot.telegram.sendMessage(coachId, `🎾 **Tennis Bot Notification**\n\n${message}`, 
          { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Error notifying coach:', error);
      }
    }
  }
}
