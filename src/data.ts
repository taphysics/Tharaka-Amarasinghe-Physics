import { Student, CalendarEvent, Announcement, SiteConfig } from './types';

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  heroTitle: "තාරක අමරසිංහ",
  heroSubtitle: "දිවයිනේ ප්‍රමුඛතම භෞතික විද්‍යා පන්ති",
  logoUrl: "https://cdn.pixabay.com/photo/2014/12/21/23/28/physics-575630_1280.png",
  heroImage1: "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?q=80&w=1200&auto=format&fit=crop",
  heroImage2: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1200&auto=format&fit=crop",
  heroImage3: "https://images.unsplash.com/photo-1507668077129-56e32842fceb?q=80&w=1200&auto=format&fit=crop",
  heroImage4: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop",
  contactPhone: "071 915 2128"
};

export const DEFAULT_STUDENTS: Student[] = [
  {
    username: 'KAPE7882',
    name: 'Kasun Perera',
    firstName: 'Kasun',
    lastName: 'Perera',
    nic: '200412345678', // ends in 78
    classTypes: ['2027 Theory', '2027 Revision'],
    district: 'Colombo',
    whatsapp: '0779152182', // ends in 82
    mobile: '0712345678',
    isPaid: true,
    activeMonths: ['2026-05', '2026-06'],
    joinedAt: '2026-05-15T09:00:00Z'
  },
  {
    username: 'NIFE7072',
    name: 'Nipun Fernando',
    firstName: 'Nipun',
    lastName: 'Fernando',
    nic: '200512345670', // ends in 70
    classTypes: ['2028 Theory'],
    district: 'Gampaha',
    whatsapp: '0719152172', // ends in 72
    mobile: '0778765432',
    isPaid: false,
    activeMonths: [],
    joinedAt: '2026-05-20T10:30:00Z'
  }
];

export const DEFAULT_CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: 'cal-1',
    date: '2026-05-24', // Past/Expired
    title: 'Mechanics Theory - Unit 2',
    description: 'Discussion on Friction & Static Equilibrium. Live classes link active inside.',
    status: 'past'
  },
  {
    id: 'cal-2',
    date: '2026-05-28', // Upcoming
    title: 'Kinematics Advanced Seminar',
    description: 'Comprehensive paper discussion and exam techniques. Glowing highlight.',
    status: 'active'
  },
  {
    id: 'cal-3',
    date: '2026-05-31', // Cancelled
    title: 'Fluid Dynamics Introduction',
    description: 'Postponed due to Wesak festival holiday. See warning details.',
    status: 'cancelled',
    warningMessage: '⚠️ Class Postponed: This session has been rescheduled. Replacement date will be updated soon!'
  },
  {
    id: 'cal-4',
    date: '2026-06-04', // Next month
    title: 'Rotational Motion Advanced Problems',
    description: 'Special session for 2027 Revision students.',
    status: 'active'
  }
];

export const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    title: 'Special Live Seminar for New Students',
    content: 'All registered 2027 and 2028 students are welcome to join our Free introductory seminar on Physics Fundamentals next Saturday at 8:00 AM.',
    date: '2026-05-23',
    type: 'public'
  },
  {
    id: 'ann-2',
    title: 'Urgent: Paper Pack 03 Uploaded!',
    content: 'Paid students can now download the PDF paper pack from the Tute & Papers sections. Make sure to solve it before the next live session.',
    date: '2026-05-25',
    type: 'public'
  },
  {
    id: 'ann-3',
    title: 'Welcome active student announcement',
    content: 'Welcome! Your account is active and verified. Feel free to explore live classes and notes.',
    date: '2026-05-25',
    type: 'private',
    targetUser: 'KAPE7882'
  },
  {
    id: 'ann-4',
    title: 'Fee Reminder Notice',
    content: 'Your monthly access is currently on Hold. Please send your slip scan to WhatsApp admin +94719152128 to complete verification.',
    date: '2026-05-25',
    type: 'private',
    targetUser: 'NIFE7072'
  }
];

export const SRI_LANKA_DISTRICTS = [
  'Colombo',
  'Gampaha',
  'Kalutara',
  'Avissawella', // Special inclusion
  'Kandy',
  'Matale',
  'Nuwara Eliya',
  'Galle',
  'Matara',
  'Hambantota',
  'Jaffna',
  'Mannar',
  'Vavuniya',
  'Mullaitivu',
  'Kilinochchi',
  'Batticaloa',
  'Ampara',
  'Trincomalee',
  'Kurunegala',
  'Puttalam',
  'Anuradhapura',
  'Polonnaruwa',
  'Badulla',
  'Moneragala',
  'Ratnapura',
  'Kegalle'
];
