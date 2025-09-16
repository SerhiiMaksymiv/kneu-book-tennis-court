import { google } from 'googleapis';
import { Database } from '../config/database.js';
import { GoogleCalendarEvent, TimeSlot, DayTimeSlot } from '../types/index.js';
import moment from 'moment';

export class GoogleCalendarService {
  private auth: any;
  private calendar: any;
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    this.calendar = google.calendar({ version: 'v3', auth: this.auth });
    this.initializeAuth();
  }

  private async initializeAuth() {
    try {
      const tokens = await this.db.getTokens();
      if (tokens) {
        this.auth.setCredentials({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expiry_date: tokens.expiryDate
        });
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    }
  }

  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.calendarlist',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];
    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  async handleAuthCallback(code: string): Promise<void> {
    const { tokens } = await this.auth.getToken(code);
    this.auth.setCredentials(tokens);
    
    await this.db.storeTokens(
      tokens.access_token!,
      tokens.refresh_token!,
      tokens.expiry_date!
    );
  }

  async refreshTokenIfNeeded(): Promise<void> {
    try {
      const { credentials } = await this.auth.refreshAccessToken();
      this.auth.setCredentials(credentials);
      
      await this.db.storeTokens(
        credentials.access_token!,
        credentials.refresh_token!,
        credentials.expiry_date!
      );
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new Error('Authentication failed. Please re-authenticate.');
    }
  }

  async getAvailableDaySlots(duration: string, daysAhead: number = 7): Promise<DayTimeSlot[]> {
    try {
      await this.refreshTokenIfNeeded();
      
      const now = moment();
      const endDate = moment().add(daysAhead, 'days');
      
      const response = await this.calendar.events.list({
        calendarId: process.env.CALENDAR_ID || 'primary',
        timeMin: now.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const busySlots = new Set(
        response.data.items?.map((event: any) => 
          moment(event.start.dateTime).format('YYYY-MM-DD')
        ) || []
      );

      const availableSlots: DayTimeSlot[] = [];
      
      for (let day = 0; day < daysAhead; day++) {
        const currentDate = moment().add(day, 'days').format('YYYY-MM-DD');
        
        availableSlots.push({
          duration: duration,
          date: currentDate,
          available: !busySlots.has(currentDate)
        });
      }

      return availableSlots.filter(slot => slot.available);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      throw error;
    }
  }

  async getAvailableTimeSlots(time: string): Promise<TimeSlot[]> {
    try {
      await this.refreshTokenIfNeeded();

      const [, hour, day] = time.split('_');
      const date = moment(day).format('YYYY-MM-DD HH:mm');
      const now = moment()
      const bookingDate = moment(date);
      
      const response = await this.calendar.events.list({
        calendarId: process.env.CALENDAR_ID || 'primary',
        timeMin: bookingDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const busySlots = new Set(
        response.data.items?.map((event: any) => 
          moment(event.start.dateTime).format('YYYY-MM-DD HH:mm')
        ) || []
      );

      const availableSlots: TimeSlot[] = [];
      const workingHours = [8, 9, 10, 11, 14, 15, 16, 17, 18, 19]; // 9AM-12PM, 2PM-8PM
      
      for (const hour of workingHours) {
        const slotTime = bookingDate.clone().hour(hour).minute(0);
        
        // Skip past times for today
        if (slotTime.isBefore(now)) continue;
        
        const slotKey = slotTime.format('YYYY-MM-DD HH:mm');
        availableSlots.push({
          date: slotTime.format('YYYY-MM-DD'),
          time: slotTime.format('HH:mm'),
          available: !busySlots.has(slotKey)
        });
      }

      return availableSlots.filter(slot => slot.available);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      throw error;
    }
  }

  async getAvailableDurationSlots(day: string): Promise<TimeSlot[]> {
    try {
      await this.refreshTokenIfNeeded();

      const date = moment(day.replace('book_day_', '')).format('YYYY-MM-DD HH:mm');
      const now = moment()
      const bookingDate = moment(date);
      
      const response = await this.calendar.events.list({
        calendarId: process.env.CALENDAR_ID || 'primary',
        timeMin: bookingDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const busySlots = new Set(
        response.data.items?.map((event: any) => 
          moment(event.start.dateTime).format('YYYY-MM-DD HH:mm')
        ) || []
      );

      const availableSlots: TimeSlot[] = [];
      const workingHours = [8, 9, 10, 11, 14, 15, 16, 17, 18, 19]; // 9AM-12PM, 2PM-8PM
      
      for (const hour of workingHours) {
        const slotTime = bookingDate.clone().hour(hour).minute(0);
        
        // Skip past times for today
        if (slotTime.isBefore(now)) continue;
        
        const slotKey = slotTime.format('YYYY-MM-DD HH:mm');
        availableSlots.push({
          date: slotTime.format('YYYY-MM-DD'),
          time: slotTime.format('HH:mm'),
          available: !busySlots.has(slotKey)
        });
      }

      return availableSlots.filter(slot => slot.available);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      throw error;
    }
  }

  async getAvailableSlots(daysAhead: number = 7): Promise<TimeSlot[]> {
    try {
      await this.refreshTokenIfNeeded();
      
      const now = moment();
      const endDate = moment().add(daysAhead, 'days');
      
      const response = await this.calendar.events.list({
        calendarId: process.env.CALENDAR_ID || 'primary',
        timeMin: now.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const busySlots = new Set(
        response.data.items?.map((event: any) => 
          moment(event.start.dateTime).format('YYYY-MM-DD HH:mm')
        ) || []
      );

      const availableSlots: TimeSlot[] = [];
      const workingHours = [8, 9, 10, 11, 14, 15, 16, 17, 18, 19]; // 9AM-12PM, 2PM-8PM
      
      for (let day = 0; day < daysAhead; day++) {
        const currentDate = moment().add(day, 'days');
        
        // Skip past dates and Sundays
        if (currentDate.isBefore(now, 'day') || currentDate.day() === 0) continue;
        
        for (const hour of workingHours) {
          const slotTime = currentDate.clone().hour(hour).minute(0);
          
          // Skip past times for today
          if (slotTime.isBefore(now)) continue;
          
          const slotKey = slotTime.format('YYYY-MM-DD HH:mm');
          availableSlots.push({
            date: slotTime.format('YYYY-MM-DD'),
            time: slotTime.format('HH:mm'),
            available: !busySlots.has(slotKey)
          });
        }
      }

      return availableSlots.filter(slot => slot.available);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      throw error;
    }
  }

  async createEvent(event: GoogleCalendarEvent): Promise<string> {
    try {
      await this.refreshTokenIfNeeded();
      
      const response = await this.calendar.events.insert({
        calendarId: process.env.CALENDAR_ID || 'primary',
        requestBody: event
      });

      return response.data.id;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  async updateEvent(eventId: string, event: Partial<GoogleCalendarEvent>): Promise<void> {
    try {
      await this.refreshTokenIfNeeded();
      
      await this.calendar.events.patch({
        calendarId: process.env.CALENDAR_ID || 'primary',
        eventId,
        requestBody: event
      });
    } catch (error) {
      console.error('Error updating calendar event:', error);
      throw error;
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      await this.refreshTokenIfNeeded();
      
      await this.calendar.events.delete({
        calendarId: process.env.CALENDAR_ID || 'primary',
        eventId
      });
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      throw error;
    }
  }
}
