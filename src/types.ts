export interface MonthlyPayment {
  id: string;
  month: string;
  amount: string;
  status: 'paid' | 'pending';
  paidDate?: string;
}

export interface ResourceLink {
  id: string;
  title: string;
  url: string;
  classType: string;
  targetMonth: string;
  date: string;
}

export interface ScheduledLive {
  id: string;
  title: string;
  videoUrl: string; // youtube
  classType: string;
  scheduledAt: string; // ISO datetime
}

export interface Student {
  username: string;
  name: string; // Combined or for compatibility
  firstName: string;
  lastName: string;
  nic: string;
  password?: string;
  classTypes: string[]; // e.g. ["2027 Theory", "2027 Revision"]
  district: string;
  whatsapp: string;
  mobile: string;
  isPaid: boolean;
  activeMonths: string[]; // e.g. ["2026-05", "2026-06"]
  payments?: MonthlyPayment[];
  joinedAt: string;
}

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  status: 'active' | 'past' | 'cancelled';
  warningMessage?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
  type: 'public' | 'private';
  targetUser?: string; // username of student
}

export interface SiteConfig {
  heroTitle: string;
  heroSubtitle: string;
  logoUrl: string;
  heroImage1: string;
  heroImage2: string;
  heroImage3: string;
  heroImage4: string;
  contactPhone: string;
}
