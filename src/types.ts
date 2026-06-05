export interface MonthlyPayment {
  id: string;
  month: string;
  amount: string;
  status: 'paid' | 'pending';
  paidDate?: string;
  remindersCount?: number;     // ⚡ අලුතින් එක් කළා: ඇඩ්මින් යැවූ රිමයින්ඩර් ගණන
  reminderMessage?: string;    // ⚡ අලුතින් එක් කළා: ඇඩ්මින් එවූ පණිවිඩය
}

export interface ResourceLink {
  id: string;
  title: string;
  url: string;
  classType: string;
  targetMonth: string;
  date: string;
}

// ⚡ සජීවී පන්ති සහ විභාග/ඇටෙන්ෂන් පද්ධති සඳහා යාවත්කාලීන කරන ලදී
export interface ScheduledLive {
  id: string;
  title: string;
  videoUrl: string; // YouTube link/embed හෝ Zoom link
  classType: string;
  scheduledAt: string; // ISO datetime
  videoType?: 'youtube' | 'zoom'; // ⚡ අලුතින් එක් කළා: වීඩියෝ වර්ගය හඳුනා ගැනීමට
  isExamActive?: boolean;          // ⚡ අලුතින් එක් කළා: මේ මොහොතේ පේපර් එකක් පුෂ් කර ඇත්නම් true වේ
  activeExamId?: string;           // ⚡ අලුතින් එක් කළා: පුෂ් කර ඇති විභාගයේ ID එක
  attentionTrigger?: boolean;      // ⚡ අලුතින් එක් කළා: ඇටෙන්ෂන් බටන් එක සිසුන්ට පෙන්වීමට true වේ
  targetMonth?: string;            // ⚡ අලුතින් එක් කළා: අදාළ මාසය
}

export interface Student {
  username: string;
  name: string; 
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
  freeMonths?: string[];
  remindersCount?: number;     // ⚡ ප්‍රොෆයිල් එක ළඟ පෙන්වීමට පහසු වන සේ මෙතනටද එක් කරන ලදී
  reminderMessage?: string;    // ⚡ ප්‍රොෆයිල් එක ළඟ පෙන්වීමට පහසු වන සේ මෙතනටද එක් කරන ලදී
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
  classRatesText?: string;
  classScheduleText?: string;
  directorImage: string;
  directorTitle: string;
}

/* ========================================================
   👇 සිසු ඩෑෂ්බෝඩ් එකේ අලුත් වැඩ කොටස් සඳහා නව Interfaces 👇
   ======================================================== */

// 1. ඔන්ලයින් විභාග පේපර්ස් ගබඩා කිරීමට
export interface OnlineExam {
  id: string;
  title: string;
  classType: string;
  pdfUrl: string;
  durationMinutes: number;
  totalQuestions: number;
  year?: string;
  month?: string;
}

// 2. සිසුන්ගේ විභාග ලකුණු සහ ප්‍රගතිය සුරැකීමට (ඇඩ්මින් රිපෝට් සහ ස්ටුඩන්ට් ඩෑෂ්බෝඩ් සඳහා)
export interface ExamResult {
  id: string;
  username: string;
  examId: string;
  examTitle: string;
  classType: string;
  score: number;
  totalQuestions: number;
  submittedAt: string; // ISO Datetime
  year: string;
  month: string;
  date: string;
  answersJson?: string; // සිසුවා ලකුණු කළ පිළිතුරු ලැයිස්තුව (e.g. {"1":3, "2":5})
}

// 3. රෙකෝඩින් සහ ටියුට්ස් සිසුන් නරඹා ඇති ප්‍රමාණය (New / Partial / Completed / Downloaded) සුරැකීමට
export interface ResourceProgress {
  id: string;
  username: string;
  resourceId: string; // ResourceLink හෝ Video ID එක
  status: 'new' | 'partial' | 'completed' | 'downloaded';
  lastPosition?: number; // බාගෙට බලපු වීඩියෝ නැවත එතැන සිට ප්ලේ කිරීමට (තත්පර ගණන)
  updatedAt: string;
}