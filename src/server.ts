import express from 'express';
import { GoogleCalendarService } from './services/googleCalendar.js';

export class AuthServer {
  private app: express.Application;
  private calendar: GoogleCalendarService;

  constructor(calendar: GoogleCalendarService) {
    this.app = express();
    this.calendar = calendar;
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.get('/auth', (req, res) => {
      const authUrl = this.calendar.getAuthUrl();
      res.redirect(authUrl);
    });

    this.app.get('/auth/callback', async (req, res) => {
      const { code } = req.query;
      
      if (!code) {
        res.status(400).send('Authorization code not found');
        return;
      }

      try {
        await this.calendar.handleAuthCallback(code as string);
        res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: green;">✅ Authorization Successful!</h1>
              <p>Google Calendar has been connected to your tennis booking bot.</p>
              <p>You can now close this window and use the bot.</p>
            </body>
          </html>
        `);
      } catch (error) {
        console.error('Auth callback error:', error);
        res.status(500).send('Authorization failed');
      }
    });

    this.app.get('/', (req, res) => {
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>🎾 Tennis Booking Bot</h1>
            <p>Bot is running successfully!</p>
            <a href="/auth" style="background: #0088cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Authorize Google Calendar
            </a>
          </body>
        </html>
      `);
    });
  }

  start(port: number = 3000) {
    this.app.listen(port, () => {
      console.log(`🌐 Auth server running on http://localhost:${port}`);
      console.log(`📊 Visit http://localhost:${port}/auth to authorize Google Calendar`);
    });
  }
}
