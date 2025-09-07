export interface Booking {
  id?: number;
  telegramUserId: string;
  username?: string;
  phoneNumber?: string;
  sessionDate: string;
  sessionTime: string;
  googleEventId?: string;
  status: 'active' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface TimeSlot {
  date: string;
  time: string;
  available: boolean;
}

export interface DayTimeSlot {
  date: string;
  available: boolean;
}

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
}
