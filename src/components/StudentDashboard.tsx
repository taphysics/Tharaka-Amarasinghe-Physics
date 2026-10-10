import React, { useEffect, useState, useRef } from 'react';
import { 
  Bell, AlertTriangle, Video, BookOpen, Download, LogOut, FileText, X, User, 
  Phone, MapPin, Book, RefreshCw, CheckCircle2, XCircle, CalendarDays, History,
  ChevronLeft, ChevronRight, Clock, Calendar, Play, ExternalLink, Menu,
  Trophy, Award, PenTool, Package, Radio, ArrowLeft, Check, Sparkles, Layers,
  ChevronDown, AlertCircle, ShieldAlert, CreditCard, QrCode, Copy, Maximize2, MessageCircle
} from 'lucide-react';
import { 
  PendingPaymentRequest, 
  fetchAllPendingPayments, 
  submitClassJoinPayment 
} from '../pendingPaymentsService';
import { BankAccount, fetchBankAccounts } from '../bankAccountsService';
import { subscribeRealtimeEvents } from '../realtimeSync';

import LiveClassPlayer from './LiveClassPlayer';
import StudentRecordings from './StudentRecordings';
import TutsPapersManager from './TutsPapersManager';
import OnlineExamsHistory from './OnlineExamsHistory';

type TabType = "live" | "recordings" | "tutes" | "exams" | "calendar" | "history" | null;

interface StudentDashboardProps {
  currentStudent: any;
  handleStudentLogout: () => void;
  dashboardTab: TabType | string;
  setDashboardTab: React.Dispatch<React.SetStateAction<any>>;
  showWelcomeBanner?: boolean;
  closeWelcomeActiveBanner?: () => void;
  studentAlerts?: any[];
  siteConfig?: any;
  calendarEvents?: any[];
  announcements?: any[];
  scheduledLives?: any[];
  resourceLinks?: any[];
  isCurrentMonthPaid?: boolean;
  filterMonth?: string;
  setFilterMonth?: any;
  supabase: any; 
  lang?: 'si' | 'en';
  setLang?: (l: 'si' | 'en') => void;
}

const SafeComponent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  try {
    return <>{children}</>;
  } catch (e) {
    return (
      <div className="p-6 bg-red-950/30 border border-red-500/30 text-red-400 rounded-2xl flex items-center gap-3">
        <AlertTriangle />
        <div>
          <p className="font-bold">Component එක ලෝඩ් වීමේ දෝෂයකි!</p>
          <p className="text-xs text-slate-400">Database සම්බන්ධතාවය පරික්ෂා කරන්න.</p>
        </div>
      </div>
    );
  }
};

const StudentDashboard: React.FC<StudentDashboardProps> = ({ 
  currentStudent, 
  handleStudentLogout, 
  dashboardTab, 
  setDashboardTab,
  showWelcomeBanner,
  closeWelcomeActiveBanner,
  studentAlerts = [], 
  siteConfig,
  calendarEvents: parentCalendarEvents,
  announcements: parentAnnouncements,
  scheduledLives,
  resourceLinks,
  isCurrentMonthPaid: parentPaidStatus,
  filterMonth,
  setFilterMonth,
  supabase,
  lang = 'si',
  setLang
}) => {
  const activeLang = lang || ((localStorage.getItem('physics_hub_lang') as 'si' | 'en') || 'si');
  const [dbReminders, setDbReminders] = useState<any[]>([]);
  const [paymentReminders, setPaymentReminders] = useState<any[]>([]);
  const [totalRemindersCount, setTotalRemindersCount] = useState<number>(0);
  const [recordingsCount, setRecordingsCount] = useState<number>(0);
  const [examsCount, setExamsCount] = useState<number>(0);
  const [availableExamsCount, setAvailableExamsCount] = useState<number>(0);
  const [completedExamsCount, setCompletedExamsCount] = useState<number>(0);
  const [tutesCount, setTutesCount] = useState<number>(0);
  const [isPaidCurrentMonth, setIsPaidCurrentMonth] = useState<boolean>(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Mobile sidebar and notifications modal drawer
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isNotificationsDrawerOpen, setIsNotificationsDrawerOpen] = useState(false);

  const [liveStudentData, setLiveStudentData] = useState<any>(currentStudent);
  const [classPaymentStatuses, setClassPaymentStatuses] = useState<{name: string, status: 'Paid' | 'Free' | 'Unpaid' | 'Absent'}[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<Record<string, { monthKey: string, monthName: string, status: 'Paid' | 'Free' | 'Unpaid' | 'Absent' }[]>>({});
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<any | null>(null);

  const mainContentRef = useRef<HTMLDivElement>(null);

  // Sri Lanka Timezone calculation
  const getSLDateInfo = () => {
    const slDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
    const year = slDate.getFullYear();
    const monthNum = slDate.getMonth() + 1;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[slDate.getMonth()];
    return {
      year,
      monthNum,
      monthPadded: String(monthNum).padStart(2, '0'),
      monthName,
      key: `${year}-${String(monthNum).padStart(2, '0')}`
    };
  };

  const { year: cYear, monthNum: cMonthNum, monthPadded: cMonthPadded, monthName: cMonthName, key: currentMonthKey } = getSLDateInfo();

  const [calendarViewYear, setCalendarViewYear] = useState<number>(cYear);
  const [calendarViewMonth, setCalendarViewMonth] = useState<number>(cMonthNum);

  // Pending Class Payments State & Cart Modal
  const [studentPendingRequests, setStudentPendingRequests] = useState<PendingPaymentRequest[]>([]);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [selectedClassToJoin, setSelectedClassToJoin] = useState<{ id: string; name: string; fee: number } | null>(null);
  const [joinPaymentMethod, setJoinPaymentMethod] = useState<'bank' | 'qr'>('bank');
  const [joinTransactionId, setJoinTransactionId] = useState('');
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [joinSuccessMessage, setJoinSuccessMessage] = useState<string | null>(null);
  const [joinErrorMessage, setJoinErrorMessage] = useState<string | null>(null);
  const [copiedBankInfo, setCopiedBankInfo] = useState<string | null>(null);

  // Dynamic Bank Accounts & Database Class Types
  const [bankAccountsList, setBankAccountsList] = useState<BankAccount[]>([]);
  const [dbClassTypes, setDbClassTypes] = useState<any[]>([]);
  const [isQrZoomModalOpen, setIsQrZoomModalOpen] = useState(false);

  // Real-time live notifications for payment approval/rejection
  interface LiveAlert {
    id: string;
    type: 'approved' | 'rejected';
    title: string;
    message: string;
    time: string;
  }
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);

  const handleDismissAlert = (id: string) => {
    setLiveAlerts(prev => prev.filter(a => a.id !== id));
    dismissNotification(id);
  };

  // Dismissed notifications (in sessionStorage so it disappears when student leaves)
  const [dismissedNotifIds, setDismissedNotifIds] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem('physics_hub_dismissed_notifications');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const dismissNotification = (id: string) => {
    setDismissedNotifIds(prev => {
      const updated = [...prev, id];
      try {
        sessionStorage.setItem('physics_hub_dismissed_notifications', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Calendar real-time check interval so that finished class on current date is automatically removed
  const [, setCalendarTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setCalendarTick(t => t + 1);
    }, 30000); // Check every 30 seconds
    return () => clearInterval(timer);
  }, []);

  const loadStudentPendingPayments = async () => {
    try {
      const allReqs = await fetchAllPendingPayments();
      const sUsername = liveStudentData?.username || currentStudent?.username;
      const mine = allReqs.filter(r => r.username === sUsername);
      setStudentPendingRequests(mine);

      // Check for approved or rejected alerts that haven't been dismissed in this session
      const dismissedRaw = sessionStorage.getItem('physics_hub_dismissed_notifications');
      const dismissed: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];

      const newAlerts: LiveAlert[] = [];
      mine.forEach(m => {
        if (m.status === 'approved') {
          const aId = `app_${m.id}`;
          if (!dismissed.includes(aId)) {
            newAlerts.push({
              id: aId,
              type: 'approved',
              title: '🎉 පන්ති ලියාපදිංචිය අනුමත විය! (Class Approved)',
              message: `ඔබගේ [${m.class_type}] පන්තිය සඳහා සිදුකළ ගෙවීම ඇඩ්මින් විසින් අනුමත කර ඇත. පන්තිය දැන් සක්‍රියයි!`,
              time: new Date(m.created_at).toLocaleTimeString()
            });
          }
        } else if (m.status === 'rejected') {
          const aId = `rej_${m.id}`;
          if (!dismissed.includes(aId)) {
            newAlerts.push({
              id: aId,
              type: 'rejected',
              title: '⚠️ පන්ති ගෙවීම ප්‍රතික්ෂේප විය (Payment Rejected)',
              message: `ඔබගේ [${m.class_type}] පන්තිය සඳහා සිදුකළ ගෙවීම ප්‍රතික්ෂේප විය. ${m.admin_notes ? `හේතුව: ${m.admin_notes}` : 'කරුණාකර නැවත උත්සාහ කරන්න.'}`,
              time: new Date(m.created_at).toLocaleTimeString()
            });
          }
        }
      });

      if (newAlerts.length > 0) {
        setLiveAlerts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const toAdd = newAlerts.filter(a => !existingIds.has(a.id));
          return [...prev, ...toAdd];
        });
      }
    } catch (e) {}
  };

  const loadBankAccounts = async () => {
    try {
      const accounts = await fetchBankAccounts();
      setBankAccountsList(accounts.filter(a => a.is_active));
    } catch (e) {}
  };

  const fetchDbClassConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('class_types_config')
        .select('*');
      if (!error && data && data.length > 0) {
        setDbClassTypes(data);
      }
    } catch (e) {}
  };

  // Realtime Subscriptions (Both Supabase & BroadcastChannel)
  useEffect(() => {
    fetchDashboardData();
    loadStudentPendingPayments();
    loadBankAccounts();
    fetchDbClassConfigs();

    const unsubRealtime = subscribeRealtimeEvents((type, payload) => {
      fetchDashboardData();
      loadStudentPendingPayments();

      if (type === 'bank_accounts_updated') {
        loadBankAccounts();
      }
      if (type === 'class_types_updated') {
        fetchDbClassConfigs();
      }

      const sUsername = liveStudentData?.username || currentStudent?.username;
      const sId = liveStudentData?.id || currentStudent?.id;
      const p = payload as any;

      if (type === 'payment_approved' && p) {
        if (p.username === sUsername || p.student_id === sId) {
          const aId = `app_${p.id || Date.now()}`;
          const dismissedRaw = sessionStorage.getItem('physics_hub_dismissed_notifications');
          const dismissed: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
          if (!dismissed.includes(aId)) {
            setLiveAlerts(prev => [
              {
                id: aId,
                type: 'approved',
                title: '🎉 පන්ති ලියාපදිංචිය අනුමත විය! (Class Approved)',
                message: `ඔබගේ [${p.class_type || 'පන්තිය'}] පන්තිය සඳහා සිදුකළ ගෙවීම ඇඩ්මින් විසින් අනුමත කර ඇත. පන්තිය දැන් සක්‍රියයි!`,
                time: new Date().toLocaleTimeString()
              },
              ...prev.filter(a => a.id !== aId)
            ]);
          }
        }
      }

      if (type === 'payment_rejected' && p) {
        if (p.username === sUsername || p.student_id === sId) {
          const aId = `rej_${p.id || Date.now()}`;
          const dismissedRaw = sessionStorage.getItem('physics_hub_dismissed_notifications');
          const dismissed: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
          if (!dismissed.includes(aId)) {
            setLiveAlerts(prev => [
              {
                id: aId,
                type: 'rejected',
                title: '⚠️ පන්ති ගෙවීම ප්‍රතික්ෂේප විය (Payment Rejected)',
                message: `ඔබගේ [${p.class_type || 'පන්තිය'}] පන්තිය සඳහා සිදුකළ ගෙවීම ප්‍රතික්ෂේප විය. ${p.reason ? `හේතුව: ${p.reason}` : 'කරුණාකර නැවත උත්සාහ කරන්න.'}`,
                time: new Date().toLocaleTimeString()
              },
              ...prev.filter(a => a.id !== aId)
            ]);
          }
        }
      }
    });

    if (supabase) {
      const channel = supabase.channel('student_dashboard_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
          fetchDashboardData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `id=eq.${currentStudent.id}` }, () => {
          fetchDashboardData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
          fetchDashboardData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => {
          fetchDashboardData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
          fetchDashboardData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results' }, () => {
          fetchDashboardData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_payments' }, () => {
          loadStudentPendingPayments();
        })
        .subscribe();

      const broadcastChannel = supabase.channel(`student_dashboard_${currentStudent.id}`)
        .on('broadcast', { event: 'reminder_updated' }, () => {
          fetchDashboardData();
        })
        .on('broadcast', { event: 'payment_updated' }, () => {
          fetchDashboardData();
        })
        .subscribe();

      return () => {
        unsubRealtime();
        supabase.removeChannel(channel);
        supabase.removeChannel(broadcastChannel);
      };
    }

    return () => {
      unsubRealtime();
    };
  }, [currentStudent.id, supabase]);

  const fetchDashboardData = async () => {
    setIsRefreshing(true);
    
    if (supabase) {
      try {
        // 1. Fetch live student record
        const { data: freshStudentData } = await supabase
          .from('students')
          .select('*')
          .eq('id', currentStudent.id)
          .single();

        const studentToUse = freshStudentData || currentStudent;
        setLiveStudentData(studentToUse);

        let enrolledClasses: string[] = [];
        if (studentToUse.class_types) {
          if (Array.isArray(studentToUse.class_types)) enrolledClasses = studentToUse.class_types;
          else if (typeof studentToUse.class_types === 'string') {
            try { enrolledClasses = JSON.parse(studentToUse.class_types); } catch(e) { enrolledClasses = [studentToUse.class_types]; }
          }
        }

        const isFreeStudent = studentToUse.is_paid === false || studentToUse.free_months?.includes(currentMonthKey);

        // 2. Fetch payments & reminders from `payments` table
        const { data: paymentData } = await supabase
          .from('payments')
          .select('*')
          .or(`student_id.eq.${studentToUse.id},username.eq.${studentToUse.username}`);

        let statuses: {name: string, status: 'Paid' | 'Free' | 'Unpaid' | 'Absent'}[] = [];
        let extractedReminders: any[] = [];
        let pHistory: Record<string, { monthKey: string, monthName: string, status: 'Paid' | 'Free' | 'Unpaid' | 'Absent' }[]> = {};
        let activeRemindersSum = 0;

        const isCurrentMonthMatch = (dbMonthValue: any) => {
          if (!dbMonthValue) return false;
          const clean = dbMonthValue.toString().trim().toLowerCase();
          const cNameLower = cMonthName.toLowerCase();
          return (
            clean === `${cYear}-${cMonthPadded}` || 
            clean === `${cYear}-${cMonthNum}` ||    
            clean === `${cYear}/${cMonthPadded}` || 
            clean === `${cYear}/${cMonthNum}` ||    
            clean === cNameLower ||                 
            clean.includes(cNameLower)              
          );
        };

        let explicitPaymentReminders: any[] = [];
        if (paymentData && paymentData.length > 0) {
          paymentData.forEach((p: any) => {
            const isUnpaid = p.status?.toLowerCase() === 'unpaid' || (!['paid', 'free', 'absent', 'disabled'].includes(p.status?.toLowerCase()));
            const isReminderFlagged = p.reminder_sent === true || p.reminder_sent === 'true' || (p.reminder_massage && p.reminder_massage.trim() !== '');

            if (isReminderFlagged && isUnpaid) {
              const classType = p.class_type || p.class_name || 'පන්තිය';
              const monthVal = p.month || p.target_month || currentMonthKey;

              let monthDisplayName = monthVal;
              if (monthVal && monthVal.includes('-')) {
                const parts = monthVal.split('-');
                const y = parts[0];
                const mIdx = parseInt(parts[1], 10) - 1;
                const mNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                const sinhalaMNames = ["ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි", "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්"];
                if (mIdx >= 0 && mIdx < 12) {
                  monthDisplayName = `${y} ${mNames[mIdx]} (${sinhalaMNames[mIdx]})`;
                }
              }

              const reminderObj = {
                id: p.record_id || `rem_${p.month}_${classType}`,
                title: `⚠️ පන්ති ගාස්තු සිහිකැඳවීමයි! (${monthDisplayName})`,
                message: p.reminder_massage?.trim() || `ඔබගේ ${monthDisplayName} මාසයේ [${classType}] පන්තිය සඳහා ගාස්තු ගෙවා නොමැත. කරුණාකර මුදල් ගෙවා සජීවී පන්තිය හා පහසුකම් ලබාගන්න.`,
                classType: classType,
                month: monthDisplayName,
                monthKey: monthVal,
                amount: p.amount || null,
                isPaymentReminder: true,
                count: p.reminders_count || 1
              };
              extractedReminders.push(reminderObj);
              explicitPaymentReminders.push(reminderObj);
              activeRemindersSum += p.reminders_count || 1;
            } else if (p.reminder_massage && p.reminder_massage.trim() !== '') {
              extractedReminders.push({
                title: `Payment Reminder`,
                message: p.reminder_massage,
                isPaymentReminder: true
              });
              activeRemindersSum += p.reminders_count || 1;
            }
          });

          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const yearMonths = monthNames.map((name, index) => {
            const pad = String(index + 1).padStart(2, '0');
            return { key: `${cYear}-${pad}`, name, monthIndex: index + 1 };
          }).filter(m => m.monthIndex <= cMonthNum);

          let deactivatedList: string[] = [];
          if (studentToUse.deactivated_months) {
            if (Array.isArray(studentToUse.deactivated_months)) deactivatedList = studentToUse.deactivated_months;
            else if (typeof studentToUse.deactivated_months === 'string') {
              try { deactivatedList = JSON.parse(studentToUse.deactivated_months); } catch(e) { deactivatedList = [studentToUse.deactivated_months]; }
            }
          }

          enrolledClasses.forEach((cls) => {
            pHistory[cls] = [];
            yearMonths.forEach((m) => {
              const isDeactivatedForClass = deactivatedList.some((d: any) => {
                if (typeof d === 'string') return d.toLowerCase() === m.key.toLowerCase() || d.toLowerCase() === m.name.toLowerCase();
                if (typeof d === 'object' && d !== null) {
                  const matchesMonth = (d.month || '').toLowerCase() === m.key.toLowerCase() || (d.month || '').toLowerCase() === m.name.toLowerCase();
                  const matchesClass = !d.class || d.class.toString().trim().toLowerCase() === cls.toString().trim().toLowerCase();
                  return matchesMonth && matchesClass;
                }
                return false;
              });

              const paymentRecord = paymentData.find((p: any) => {
                const pClass = (p.class_name || p.class_type || '').toString().trim().toLowerCase();
                const sClass = cls.toString().trim().toLowerCase();
                const classMatches = pClass === sClass;
                const pMonth = (p.month || p.target_month || '').toString().trim().toLowerCase();
                const monthMatches = pMonth === m.key.toLowerCase() || pMonth === m.name.toLowerCase();
                return classMatches && monthMatches;
              });

              let statusValue: 'Paid' | 'Free' | 'Unpaid' | 'Absent' = 'Unpaid';
              if (paymentRecord) {
                if (paymentRecord.status?.toLowerCase() === 'paid') statusValue = 'Paid';
                else if (paymentRecord.status?.toLowerCase() === 'free') statusValue = 'Free';
                else if (paymentRecord.status?.toLowerCase() === 'absent' || paymentRecord.status?.toLowerCase() === 'disabled') statusValue = 'Absent';
              } else if (isDeactivatedForClass) {
                statusValue = 'Absent';
              } else {
                const isMonthFree = isFreeStudent || studentToUse.free_months?.includes(m.key) || studentToUse.free_months?.includes(m.name);
                if (isMonthFree) statusValue = 'Free';
              }
              pHistory[cls].push({ monthKey: m.key, monthName: m.name, status: statusValue });
            });
          });

          const currentMonthPayments = paymentData.filter((p: any) => isCurrentMonthMatch(p.month || p.target_month));
          if (currentMonthPayments.length === 0) {
            statuses = enrolledClasses.map(cls => ({ name: cls, status: isFreeStudent ? 'Free' : 'Unpaid' }));
            setIsPaidCurrentMonth(isFreeStudent);
          } else {
            statuses = enrolledClasses.map(cls => {
              if (isFreeStudent) return { name: cls, status: 'Free' };
              const paymentRecord = currentMonthPayments.find((p: any) => {
                const pClass = (p.class_name || p.class_type || '').toString().trim().toLowerCase();
                const sClass = cls.toString().trim().toLowerCase();
                return pClass === sClass;
              });

              let statusValue: 'Paid' | 'Free' | 'Unpaid' | 'Absent' = 'Unpaid';
              if (paymentRecord) {
                if (paymentRecord.status?.toLowerCase() === 'paid') statusValue = 'Paid';
                else if (paymentRecord.status?.toLowerCase() === 'free') statusValue = 'Free';
                else if (paymentRecord.status?.toLowerCase() === 'absent' || paymentRecord.status?.toLowerCase() === 'disabled') statusValue = 'Absent';
              }
              return { name: cls, status: statusValue };
            });

            const hasUnpaidClass = statuses.some(s => s.status === 'Unpaid');
            setIsPaidCurrentMonth(enrolledClasses.length === 0 ? true : !hasUnpaidClass);
          }
        } else {
          statuses = enrolledClasses.map(cls => ({ name: cls, status: isFreeStudent ? 'Free' : 'Unpaid' }));
          setIsPaidCurrentMonth(isFreeStudent);
          
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const yearMonths = monthNames.map((name, index) => {
            const pad = String(index + 1).padStart(2, '0');
            return { key: `${cYear}-${pad}`, name };
          });
          
          let deactivatedList: string[] = [];
          if (studentToUse.deactivated_months) {
            if (Array.isArray(studentToUse.deactivated_months)) deactivatedList = studentToUse.deactivated_months;
            else if (typeof studentToUse.deactivated_months === 'string') {
              try { deactivatedList = JSON.parse(studentToUse.deactivated_months); } catch(e) { deactivatedList = [studentToUse.deactivated_months]; }
            }
          }

          enrolledClasses.forEach((cls) => {
            pHistory[cls] = [];
            yearMonths.forEach((m) => {
              const isDeactivatedForClass = deactivatedList.some((d: any) => {
                if (typeof d === 'string') return d.toLowerCase() === m.key.toLowerCase() || d.toLowerCase() === m.name.toLowerCase();
                if (typeof d === 'object' && d !== null) {
                  const matchesMonth = (d.month || '').toLowerCase() === m.key.toLowerCase() || (d.month || '').toLowerCase() === m.name.toLowerCase();
                  const matchesClass = !d.class || d.class.toString().trim().toLowerCase() === cls.toString().trim().toLowerCase();
                  return matchesMonth && matchesClass;
                }
                return false;
              });

              if (isDeactivatedForClass) {
                pHistory[cls].push({ monthKey: m.key, monthName: m.name, status: 'Absent' });
              } else {
                const isMonthFree = studentToUse.is_paid === false || studentToUse.free_months?.includes(m.key) || studentToUse.free_months?.includes(m.name);
                pHistory[cls].push({ monthKey: m.key, monthName: m.name, status: isMonthFree ? 'Free' : 'Unpaid' });
              }
            });
          });
        }
        
        setClassPaymentStatuses(statuses);
        setPaymentHistory(pHistory);

        // 3. Announcements from `announcements` table
        const { data: announcementData } = await supabase
          .from('announcements')
          .select('*')
          .or(`target_user.eq.${studentToUse.username},target_user.eq.all`);

        if (announcementData) {
          announcementData.forEach((a: any) => {
            const alreadyExists = extractedReminders.some(r => r.message === a.content);
            if (!alreadyExists) {
              const isFee = (a.title || '').includes('සිහිකැඳවීම') || (a.content || '').includes('ගාස්තු') || (a.content || '').includes('ගෙවා නොමැත');
              const annObj = {
                id: a.id || `ann_${Date.now()}_${Math.random()}`,
                title: a.title || 'විශේෂ නිවේදනයයි',
                message: a.content,
                date: a.date,
                isPaymentReminder: isFee,
                classType: a.target_class_type || null,
                month: null
              };
              extractedReminders.push(annObj);
              if (isFee) {
                explicitPaymentReminders.push(annObj);
                activeRemindersSum += 1;
              }
            }
          });
        }

        setDbReminders(extractedReminders);
        setPaymentReminders(explicitPaymentReminders);
        setTotalRemindersCount(activeRemindersSum);

        // 4. Fetch counts (Recordings, Exams, Completed Exam Results, Tutes, Calendar)
        const [calRes, livesRes, recRes, examRes, tuteRes, resultsRes] = await Promise.all([
          supabase.from('calendar_events').select('*').order('date', { ascending: true }),
          supabase.from('scheduled_lives').select('*').order('date', { ascending: true }),
          supabase.from('recordings').select('id, class_type'),
          supabase.from('exams').select('id, title, status, class_type, target_class_type'),
          supabase.from('class_resources').select('id, type, target_classes').in('type', ['tute', 'paper']),
          supabase.from('exam_results').select('id, exam_id, score, submitted_at').or(`username.eq.${studentToUse.username},student_id.eq.${studentToUse.id}`)
        ]);

        // Recordings Count
        if (recRes.data) {
          const count = recRes.data.filter((r: any) => {
            if (enrolledClasses.length === 0) return true;
            return enrolledClasses.some(c => (r.class_type || '').toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes((r.class_type || '').toLowerCase()));
          }).length;
          setRecordingsCount(count);
        }

        // Exams & Completed calculation
        let computedExamsCount = 0;
        if (examRes.data) {
          const matchingExams = examRes.data.filter((e: any) => {
            if (enrolledClasses.length === 0) return true;
            const tClass = (e.target_class_type || e.class_type || '').toLowerCase();
            if (!tClass || tClass === 'all' || tClass === 'general') return true;
            return enrolledClasses.some(c => tClass.includes(c.toLowerCase()) || c.toLowerCase().includes(tClass));
          });
          computedExamsCount = matchingExams.length;
          setExamsCount(computedExamsCount);
        }

        let completedCount = 0;
        if (resultsRes.data) {
          const completedSet = new Set(resultsRes.data.map((r: any) => r.exam_id).filter(Boolean));
          completedCount = completedSet.size;
          setCompletedExamsCount(completedCount);
        }
        setAvailableExamsCount(Math.max(0, computedExamsCount - completedCount));

        // Tutes Count
        if (tuteRes.data) {
          const count = tuteRes.data.filter((t: any) => {
            if (enrolledClasses.length === 0) return true;
            const tc = t.target_classes || [];
            if (tc.length === 0) return true;
            const tcArr = Array.isArray(tc) ? tc : [tc];
            return tcArr.some((c: string) => enrolledClasses.some(ec => ec.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(ec.toLowerCase())));
          }).length;
          setTutesCount(count);
        }

        // Unified Calendar & Live Classes
        const rawCalEvents = calRes.data || [];
        const rawLives = livesRes.data || [];
        const unifiedMap = new Map<string, any>();

        rawLives.forEach((l: any) => {
          const classType = l.target_class_type || (Array.isArray(l.target_classes) ? l.target_classes[0] : null) || l.class_type || 'General';
          const eventKey = `${l.date}_${(l.title || 'Live').trim().toLowerCase()}`;
          unifiedMap.set(eventKey, {
            id: l.id,
            title: l.title || 'Zoom Live Class',
            date: l.date,
            start_time: l.time || '18:00',
            class_type: classType,
            status: l.status || (l.is_active ? 'live' : 'scheduled'),
            description: `Zoom Live Session - ${classType}`,
            zoom_link: l.link || l.zoom_join_url,
            meeting_id: l.zoom_meeting_id,
            source: 'scheduled_lives'
          });
        });

        rawCalEvents.forEach((c: any) => {
          const classType = c.target_class_type || c.class_type || 'General';
          const eventKey = `${c.date}_${(c.title || 'Event').trim().toLowerCase()}`;
          if (!unifiedMap.has(eventKey)) {
            unifiedMap.set(eventKey, {
              id: c.id,
              title: c.title,
              date: c.date,
              start_time: c.start_time || '18:00',
              class_type: classType,
              status: c.status || 'scheduled',
              description: c.description || `Class Session - ${classType}`,
              rescheduled_to: c.rescheduled_to,
              warning_message: c.warning_message,
              source: 'calendar_events'
            });
          }
        });

        const allUnifiedEvents = Array.from(unifiedMap.values());
        const studentFilteredEvents = allUnifiedEvents.filter(ev => {
          if (!enrolledClasses || enrolledClasses.length === 0) return true;
          const evTypeLower = (ev.class_type || '').toLowerCase().trim();
          if (evTypeLower === 'general' || evTypeLower === 'all') return true;
          return enrolledClasses.some(c => {
            const cLower = c.toLowerCase().trim();
            return evTypeLower.includes(cLower) || cLower.includes(evTypeLower);
          });
        });

        setCalendarEvents(studentFilteredEvents);

      } catch (error) {
        console.error("Dashboard Data Fetch Error:", error);
      }
    }
    setIsRefreshing(false);
  };

  const handleTabChange = (tab: TabType) => {
    setDashboardTab(tab);
    setTimeout(() => {
      mainContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const capitalize = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
  const fName = capitalize(liveStudentData?.first_name || liveStudentData?.name || '');
  const lName = capitalize(liveStudentData?.last_name || '');
  const studentDisplayName = fName || lName ? `${fName} ${lName}`.trim() : liveStudentData?.username || 'Student';
  const studentInitials = (liveStudentData?.name || liveStudentData?.username || 'ST').substring(0, 2).toUpperCase();

  const enrolledClasses: string[] = Array.isArray(liveStudentData?.class_types)
    ? liveStudentData.class_types
    : typeof liveStudentData?.class_types === 'string'
    ? [liveStudentData.class_types]
    : liveStudentData?.class ? [liveStudentData.class] : [];

  const allReminders = [...dbReminders, ...studentAlerts];

  // Class Type Meta Helper
  const getClassTypeMeta = (rawType: string) => {
    const norm = (rawType || '').toLowerCase().trim();
    if (norm.includes('2026') && norm.includes('theory')) {
      return {
        label: rawType || '2026 Theory',
        sticker: '📘 2026 Theory',
        stickerShort: '📘 Theory',
        bgPill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        cellBadge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-500/30',
      };
    }
    if (norm.includes('2026') && norm.includes('revision')) {
      return {
        label: rawType || '2026 Revision',
        sticker: '⚡ 2026 Revision',
        stickerShort: '⚡ Revision',
        bgPill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        cellBadge: 'bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/30',
      };
    }
    if (norm.includes('2027') && norm.includes('theory')) {
      return {
        label: rawType || '2027 Theory',
        sticker: '🔭 2027 Theory',
        stickerShort: '🔭 Theory',
        bgPill: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
        cellBadge: 'bg-purple-500/15 text-purple-700 dark:text-purple-200 border-purple-500/30',
      };
    }
    if (norm.includes('2027') && norm.includes('revision')) {
      return {
        label: rawType || '2027 Revision',
        sticker: '🚀 2027 Revision',
        stickerShort: '🚀 Revision',
        bgPill: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
        cellBadge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200 border-cyan-500/30',
      };
    }
    if (norm.includes('paper')) {
      return {
        label: rawType || 'Paper Class',
        sticker: '📝 Paper Class',
        stickerShort: '📝 Paper',
        bgPill: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        cellBadge: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-500/30',
      };
    }
    return {
      label: rawType || 'Physics Session',
      sticker: `🎓 ${rawType || 'Class'}`,
      stickerShort: `🎓 ${rawType ? rawType.slice(0, 10) : 'Class'}`,
      bgPill: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
      cellBadge: 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border-blue-500/30',
    };
  };

  const sinhalaMonths = [
    "ජනවාරි (January)", "පෙබරවාරි (February)", "මාර්තු (March)", 
    "අප්‍රේල් (April)", "මැයි (May)", "ජූනි (June)", 
    "ජූලි (July)", "අගෝස්තු (August)", "සැප්තැම්බර් (September)", 
    "ඔක්තෝබර් (October)", "නොවැම්බර් (November)", "දෙසැම්බර් (December)"
  ];

  const handlePrevMonth = () => {
    if (calendarViewMonth === 1) {
      setCalendarViewYear(y => y - 1);
      setCalendarViewMonth(12);
    } else {
      setCalendarViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarViewMonth === 12) {
      setCalendarViewYear(y => y + 1);
      setCalendarViewMonth(1);
    } else {
      setCalendarViewMonth(m => m + 1);
    }
  };

  const handleTodayMonth = () => {
    setCalendarViewYear(cYear);
    setCalendarViewMonth(cMonthNum);
  };

  // Nav Menu Definitions
  const navMenuItems = [
    { id: null, label: 'Hub Overview', sinhala: 'ප්‍රධාන පිටුව', icon: Layers, badge: null, color: 'blue' },
    { id: 'exams', label: 'Exams', sinhala: 'ඔන්ලයින් විභාග', icon: PenTool, badge: examsCount > 0 ? `${examsCount}` : null, color: 'blue' },
    { id: 'recordings', label: 'Recordings', sinhala: 'පන්ති රෙකෝඩින්', icon: Video, badge: recordingsCount > 0 ? `${recordingsCount}` : null, color: 'amber' },
    { id: 'tutes', label: 'Documents', sinhala: 'ටියුට් & Papers', icon: FileText, badge: tutesCount > 0 ? `${tutesCount}` : null, color: 'slate' },
    { id: 'live', label: 'Live Classes', sinhala: 'සජීවී පන්තිය', icon: Radio, badge: 'LIVE', isLive: true, color: 'rose' },
    { id: 'calendar', label: 'Class Timetable', sinhala: 'කාලසටහන', icon: CalendarDays, badge: null, color: 'purple' },
    { id: 'history', label: 'Other Classes', sinhala: 'වෙනත් පන්ති (Other Classes)', icon: Package, badge: null, color: 'emerald' },
  ];

  // Dynamically resolve custom menu tab names configured by admin and respect active language
  const getMenuItemLabel = (item: { id: string | null; label: string; sinhala: string }) => {
    const key = item.id === null ? 'overview' : item.id;
    const custom = siteConfig?.menuNames?.[key] || siteConfig?.[`menu_${key}`];
    if (custom && String(custom).trim()) {
      return String(custom).trim();
    }
    return activeLang === 'si' ? item.sinhala : item.label;
  };

  // Helper to check if a class session has ended (removes past dates & finished class on current date)
  const isClassSessionFinished = (ev: any): boolean => {
    if (!ev || !ev.date) return false;
    const statusLower = (ev.status || '').toLowerCase().trim();
    if (statusLower === 'ended' || statusLower === 'finished' || statusLower === 'completed' || statusLower === 'past') {
      return true;
    }

    const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
    const todayDateStr = `${slNow.getFullYear()}-${String(slNow.getMonth() + 1).padStart(2, '0')}-${String(slNow.getDate()).padStart(2, '0')}`;

    // If date is before today, it is strictly in the past
    if (ev.date < todayDateStr) return true;

    // If date is today, check if class session time has finished
    if (ev.date === todayDateStr) {
      const currentMinutes = slNow.getHours() * 60 + slNow.getMinutes();

      // 1. Explicit end_time exists e.g. "20:30"
      if (ev.end_time) {
        const [endH, endM] = String(ev.end_time).split(':').map(Number);
        if (!isNaN(endH)) {
          const finishMinutes = endH * 60 + (endM || 0);
          if (currentMinutes >= finishMinutes) return true;
        }
      }

      // 2. start_time contains range e.g. "18:00 - 20:30"
      const timeStr = String(ev.start_time || '');
      if (timeStr.includes('-')) {
        const endPart = timeStr.split('-')[1].trim();
        const endParts = endPart.split(':');
        const endH = parseInt(endParts[0], 10);
        const endM = parseInt(endParts[1] || '0', 10);
        if (!isNaN(endH)) {
          let finishMinutes = endH * 60 + endM;
          if (endPart.toLowerCase().includes('pm') && endH < 12) finishMinutes += 12 * 60;
          if (currentMinutes >= finishMinutes) return true;
        }
      } else if (timeStr) {
        // 3. start_time single value e.g. "18:00" -> standard physics class runs for 2.5 hours (150 min)
        const startParts = timeStr.split(':');
        const startH = parseInt(startParts[0], 10);
        const startM = parseInt(startParts[1] || '0', 10);
        if (!isNaN(startH)) {
          let classStartMinutes = startH * 60 + startM;
          if (timeStr.toLowerCase().includes('pm') && startH < 12) classStartMinutes += 12 * 60;
          const finishMinutes = classStartMinutes + 150;
          if (currentMinutes >= finishMinutes) return true;
        }
      }
    }

    return false;
  };

  // Render Calendar View
  const renderCalendar = () => {
    const daysInMonth = new Date(calendarViewYear, calendarViewMonth, 0).getDate();
    const firstDayIndex = new Date(calendarViewYear, calendarViewMonth - 1, 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    // Filter out finished classes so calendar automatically removes finished classes on current date
    const activeCalendarEvents = calendarEvents.filter(ev => !isClassSessionFinished(ev));

    return (
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-4 md:p-6 shadow-2xl max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300 text-white">
        
        {/* Top Calendar Header with Month Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/15 border border-purple-500/30 rounded-xl text-purple-400">
              <CalendarDays size={22} />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-black text-white flex items-center gap-2">
                පන්ති කාලසටහන (Timetable)
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {sinhalaMonths[calendarViewMonth - 1]} {calendarViewYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition cursor-pointer"
              title="පෙර මාසය"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleTodayMonth}
              className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-bold rounded-xl border border-purple-500/30 transition cursor-pointer"
            >
              අද (Today)
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition cursor-pointer"
              title="ඊළඟ මාසය"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-[11px]">
          <span className="text-slate-400 font-semibold mr-1">පන්ති වර්ග:</span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
            📘 2026 Theory
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
            ⚡ 2026 Revision
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
            🔭 2027 Theory
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
            🚀 2027 Revision
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
            📝 Paper Class
          </span>
        </div>
        
        {/* Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 border-b lg:border-b-0 lg:border-r border-slate-800 pb-6 lg:pb-0 lg:pr-6">
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-extrabold text-slate-400 mb-2 uppercase tracking-wider">
              <div className="text-rose-400">Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div className="text-cyan-400">Sat</div>
            </div>
            
            <div className="grid grid-cols-7 gap-2">
              {days.map((day, index) => {
                if (day === null) return <div key={`empty-${index}`} className="p-2 min-h-[85px] bg-slate-950/20 rounded-xl border border-slate-900/50"></div>;
                
                const paddedDay = String(day).padStart(2, '0');
                const paddedMonth = String(calendarViewMonth).padStart(2, '0');
                const dateStr = `${calendarViewYear}-${paddedMonth}-${paddedDay}`;
                const dayEvents = activeCalendarEvents.filter(e => e.date === dateStr);
                const isToday = day === new Date().getDate() && calendarViewMonth === (new Date().getMonth() + 1) && calendarViewYear === new Date().getFullYear();

                return (
                  <div 
                    key={index} 
                    onClick={() => {
                      if (dayEvents.length > 0) setSelectedCalendarEvent(dayEvents[0]);
                    }}
                    className={`min-h-[85px] p-2 rounded-2xl border flex flex-col justify-between transition-all select-none ${
                      isToday 
                        ? 'bg-purple-950/40 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.25)] ring-1 ring-purple-400/50' 
                        : dayEvents.length > 0
                        ? 'bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/70 cursor-pointer shadow-md'
                        : 'bg-slate-950/30 border-slate-800/60 hover:border-slate-700/80 hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-lg ${
                        isToday ? 'bg-purple-500 text-white' : dayEvents.length > 0 ? 'bg-slate-700/80 text-white' : 'text-slate-400'
                      }`}>
                        {day}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      )}
                    </div>

                    <div className="mt-1 space-y-1 w-full overflow-y-auto max-h-[52px]">
                      {dayEvents.map((ev, i) => {
                        const meta = getClassTypeMeta(ev.class_type);
                        return (
                          <div 
                            key={i} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCalendarEvent(ev);
                            }}
                            className={`text-[9px] px-1.5 py-0.5 rounded-md border font-bold flex items-center justify-between gap-1 transition-transform hover:scale-[1.02] cursor-pointer ${meta.cellBadge}`}
                          >
                            <span className="truncate flex-1 font-bold">{meta.stickerShort}</span>
                            <span className="text-[8px] font-mono shrink-0 opacity-80">{ev.start_time || ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Upcoming Stream */}
          <div className="lg:col-span-4 flex flex-col justify-start space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={13} className="text-purple-400" /> ඉදිරි &amp; අද පන්ති
              </h4>
              <span className="text-[10px] text-purple-400 font-mono font-bold bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                {(() => {
                  const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
                  const todayDateStr = `${slNow.getFullYear()}-${String(slNow.getMonth() + 1).padStart(2, '0')}-${String(slNow.getDate()).padStart(2, '0')}`;
                  return activeCalendarEvents.filter(ev => ev.date >= todayDateStr).length;
                })()} Sessions
              </span>
            </div>

            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {(() => {
                const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
                const todayDateStr = `${slNow.getFullYear()}-${String(slNow.getMonth() + 1).padStart(2, '0')}-${String(slNow.getDate()).padStart(2, '0')}`;
                const filteredUpcoming = activeCalendarEvents
                  .filter(ev => ev.date >= todayDateStr)
                  .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''));

                if (filteredUpcoming.length === 0) {
                  return (
                    <div className="text-xs text-slate-500 italic text-center py-12 bg-slate-950/30 rounded-2xl border border-slate-800/50">
                      ඔබ තෝරාගෙන ඇති පන්ති සඳහා අද හෝ ඉදිරි දිනවල නියමිත පන්ති කිසිවක් හමු නොවීය.
                    </div>
                  );
                }

                return filteredUpcoming.map((ev, idx) => {
                  const meta = getClassTypeMeta(ev.class_type);
                  const isLive = ev.status === 'live' || ev.status === 'active';
                  const isTodayClass = ev.date === todayDateStr;

                  return (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedCalendarEvent(ev)}
                      className={`p-3.5 bg-slate-950/70 border rounded-2xl transition cursor-pointer space-y-2 group ${
                        isTodayClass ? 'border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/30' : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 ${meta.bgPill}`}>
                          {meta.sticker}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isTodayClass && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
                              🔴 TODAY
                            </span>
                          )}
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full uppercase font-bold border ${
                            isLive ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {isLive ? '🔴 LIVE' : ev.status}
                          </span>
                        </div>
                      </div>

                      <h5 className="text-xs font-bold text-white group-hover:text-purple-300 transition truncate" title={ev.title}>
                        {ev.title}
                      </h5>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                        <span className="font-mono flex items-center gap-1 text-slate-300">
                          <Calendar size={11} className="text-purple-400" /> {ev.date}
                        </span>
                        <span className="font-mono font-bold flex items-center gap-1 text-purple-300">
                          <Clock size={11} /> {ev.start_time || '18:00'}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Selected Event Modal */}
        {selectedCalendarEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
              <button 
                onClick={() => setSelectedCalendarEvent(null)}
                className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={16} />
              </button>

              <div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 mb-2 ${getClassTypeMeta(selectedCalendarEvent.class_type).bgPill}`}>
                  {getClassTypeMeta(selectedCalendarEvent.class_type).sticker}
                </span>
                <h3 className="text-base font-extrabold text-white">
                  {selectedCalendarEvent.title}
                </h3>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">දිනය:</span>
                  <span className="text-white font-mono font-bold">{selectedCalendarEvent.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">වේලාව:</span>
                  <span className="text-purple-300 font-mono font-bold">{selectedCalendarEvent.start_time || '18:00'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">තත්වය:</span>
                  <span className="text-emerald-400 font-bold uppercase">{selectedCalendarEvent.status}</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                {(() => {
                  const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
                  const todayDateStr = `${slNow.getFullYear()}-${String(slNow.getMonth() + 1).padStart(2, '0')}-${String(slNow.getDate()).padStart(2, '0')}`;
                  const isFutureDate = selectedCalendarEvent.date > todayDateStr;
                  const isTodayDate = selectedCalendarEvent.date === todayDateStr;
                  const isCurrentlyLive = selectedCalendarEvent.status === 'live' || selectedCalendarEvent.status === 'active';

                  if (isFutureDate || (!isCurrentlyLive && !isTodayDate)) {
                    return (
                      <div className="p-3.5 bg-purple-950/40 border border-purple-500/30 rounded-2xl text-center space-y-1.5">
                        <div className="flex items-center justify-center gap-1.5 text-purple-300 font-bold text-xs">
                          <Clock size={15} />
                          <span>{activeLang === 'si' ? 'ඉදිරියේදී පැවැත්වීමට නියමිත පන්තියකි' : 'Upcoming Scheduled Class'}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {activeLang === 'si' 
                            ? `මෙම පන්තිය නියමිත දිනයේදී (${selectedCalendarEvent.date} ${selectedCalendarEvent.start_time || ''}) සජීවීව ආරම්භ වනු ඇත.`
                            : `This class is scheduled for ${selectedCalendarEvent.date} at ${selectedCalendarEvent.start_time || ''}.`}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <button 
                      onClick={() => {
                        setSelectedCalendarEvent(null);
                        handleTabChange('live');
                      }}
                      className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black py-3 rounded-2xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-900/40"
                    >
                      <Play size={15} /> {activeLang === 'si' ? 'සජීවී පන්තියට සම්බන්ධ වන්න (Join Live Player)' : 'Join Live Class Player'}
                    </button>
                  );
                })()}

                <button 
                  onClick={() => setSelectedCalendarEvent(null)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-2xl text-xs transition cursor-pointer"
                >
                  {activeLang === 'si' ? 'වසන්න (Close)' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Join Class Enrollment Handlers
  const handleOpenJoinModal = (cls: { id: string; name: string; fee: number }) => {
    setSelectedClassToJoin(cls);
    setJoinPaymentMethod('bank');
    setJoinTransactionId('');
    setJoinSuccessMessage(null);
    setJoinErrorMessage(null);
    setIsJoinModalOpen(true);
  };

  const handleJoinFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassToJoin) return;
    if (!joinTransactionId.trim()) {
      setJoinErrorMessage('කරුණාකර රිසීට් පතේ Transaction ID එක ඇතුළත් කරන්න.');
      return;
    }

    setJoinSubmitting(true);
    setJoinErrorMessage(null);
    setJoinSuccessMessage(null);

    try {
      const newReq = await submitClassJoinPayment({
        student: liveStudentData,
        classType: selectedClassToJoin.name,
        amount: selectedClassToJoin.fee,
        paymentMethod: joinPaymentMethod,
        transactionId: joinTransactionId.trim()
      });

      setStudentPendingRequests(prev => [newReq, ...prev.filter(p => p.id !== newReq.id)]);
      setJoinSuccessMessage(`ඔබගේ [${selectedClassToJoin.name}] පන්ති ගෙවීම් තොරතුරු සාර්ථකව යොමු කරන ලදී! ඇඩ්මින් විසින් අනුමත කළ විගස පන්තිය සක්‍රිය වේ.`);
      
      setTimeout(() => {
        setIsJoinModalOpen(false);
        setJoinSuccessMessage(null);
      }, 2500);
    } catch (err: any) {
      setJoinErrorMessage('සබ්මිට් කිරීමේදී දෝෂයක් මතු විය: ' + (err.message || ''));
    } finally {
      setJoinSubmitting(false);
    }
  };

  // Render Other Classes & Course Packages View (With Join Class Cart)
  const renderOtherClasses = () => {
    const defaultClasses = [
      { id: '1', name: '2026 Theory', fee: 3500 },
      { id: '2', name: '2026 Revision', fee: 3500 },
      { id: '3', name: '2027 Theory', fee: 3500 },
      { id: '4', name: '2027 Revision', fee: 3500 },
      { id: '5', name: '2027 Paper Class', fee: 3500 },
      { id: '6', name: '2028 Theory', fee: 3500 },
      { id: '7', name: '2028 Revision', fee: 3500 },
      { id: '8', name: '2028 Paper Class', fee: 3500 },
    ];

    // Read directly from Supabase class_types_config table with fallback
    const systemClasses = dbClassTypes.length > 0
      ? dbClassTypes
          .filter(c => c.is_active !== false)
          .map(c => ({
            id: c.id,
            name: (c.class_types || c.class_type || '').trim(),
            fee: Number(c.monthly_fee ?? 3500),
            whatsapp_link: c.whatsapp_link
          }))
          .filter(c => c.name)
      : defaultClasses;

    const unenrolledClasses = systemClasses.filter(sc => {
      return !enrolledClasses.some(ec => ec.toLowerCase().trim() === sc.name.toLowerCase().trim());
    });

    const sinhalaMonths = [
      'ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි',
      'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'
    ];
    const now = new Date();
    const currentMonthSinhala = sinhalaMonths[now.getMonth()];
    const currentYear = now.getFullYear();
    const currentMonthDisplay = `${currentYear} ${currentMonthSinhala}`;

    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
        
        {/* Top Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <Package size={26} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                වෙනත් පන්ති (Other Classes)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ඔබ තවමත් ලියාපදිංචි වී නොමැති අනෙකුත් පන්ති සඳහා මෙතැනින් පහසුවෙන් සම්බන්ධ වන්න.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 1: UNENROLLED CLASSES (JOIN BUTTON & PENDING BADGES) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" /> ලියාපදිංචි විය හැකි නව පන්ති (Available Classes to Join)
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              {unenrolledClasses.length} Classes Available
            </span>
          </div>

          {unenrolledClasses.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs">
              🎉 ඔබ පද්ධතියේ පවතින සියලුම පන්ති වර්ග සඳහා දැනටමත් ලියාපදිංචි වී ඇත!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {unenrolledClasses.map((cls) => {
                const pendingReq = studentPendingRequests.find(
                  p => p.class_type.toLowerCase().trim() === cls.name.toLowerCase().trim() && p.status === 'pending'
                );

                return (
                  <div
                    key={cls.id}
                    className="p-5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl flex flex-col justify-between gap-4 transition shadow-md"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          {cls.name}
                        </span>
                        <span className="text-sm font-black font-mono text-emerald-400">
                          රු. {cls.fee.toLocaleString()}/= <span className="text-[10px] font-sans text-slate-400 font-normal">/ මසකට</span>
                        </span>
                      </div>

                      <h4 className="text-base font-extrabold text-white">
                        {cls.name} Class Session
                      </h4>
                      <p className="text-xs text-slate-300 dark:text-slate-300 font-medium leading-relaxed">
                        <span className="text-emerald-400 font-bold">{currentMonthDisplay}</span> මාසය සඳහා සජීවී Zoom පන්ති, පන්ති රෙකෝඩින් සහ නිල Google Drive ටියුට්ස් සියල්ලම ඇතුළත් වේ.
                      </p>
                    </div>

                    {/* Pending State or Join Button */}
                    {pendingReq ? (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                          <Clock size={14} className="animate-spin" /> ⏳ අනුමැතිය පොරොත්තුවෙන් (Pending Approval)
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Transaction ID: <span className="text-amber-300 font-bold">{pendingReq.transaction_id}</span>
                        </p>
                        <p className="text-[10px] text-slate-500">
                          ඇඩ්මින් විසින් ගෙවීම් තහවුරු කළ විගස පන්තිය සක්‍රිය වේ.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenJoinModal(cls)}
                        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sparkles size={14} /> සම්බන්ධ වන්න (Join Class) →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: ENROLLED CLASSES & PAYMENT STATUS */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" /> ඔබ දැනට ලියාපදිංචි වී ඇති පන්ති (Enrolled Classes)
            </h4>
          </div>

          {Object.keys(paymentHistory).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(paymentHistory).map(([className, months]) => (
                <div key={className} className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80">
                  <p className="font-bold text-slate-200 mb-3 flex items-center gap-2 text-sm">
                    <Book size={15} className="text-cyan-400" /> {className}
                  </p>
                  <div className="flex flex-col gap-2">
                    {months.map((m, idx) => (
                      <div key={idx} className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all ${
                        m.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        m.status === 'Free' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        m.status === 'Absent' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        <span>{m.monthName} ({m.monthKey})</span>
                        <span className="text-[11px] mt-1 sm:mt-0 px-2 py-0.5 rounded-md bg-black/40 font-medium">
                          {m.status === 'Paid' && '🟢 Paid'}
                          {m.status === 'Free' && '🔵 Free Card'}
                          {m.status === 'Absent' && '🟡 Absent (ඇබ්සන්)'}
                          {m.status === 'Unpaid' && '🔴 Unpaid (ගෙවා නැත)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-500 text-xs">
              මෙතෙක් කිසිදු පන්තියක් සඳහා ලියාපදිංචි වී නොමැත.
            </div>
          )}
        </div>

      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f0f4f9] dark:bg-slate-950 text-slate-900 dark:text-white font-sans transition-colors pb-12">
      
      {/* 1. Student Profile Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#0b101e] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-[360px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30">
              <h3 className="font-bold text-sm text-slate-800 dark:text-white tracking-wide">Student Profile</h3>
              <button onClick={() => setIsProfileOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5">
              <div className="flex flex-col items-center mb-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-2xl font-black text-white mb-2 shadow-lg shadow-blue-500/20 ring-4 ring-slate-100 dark:ring-slate-900">
                  {studentInitials}
                </div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white text-center">
                  {studentDisplayName}
                </h2>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-bold tracking-wider mt-1 bg-blue-50 dark:bg-blue-500/10 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-500/20 font-mono">
                  ID: {liveStudentData?.username || 'ST-2222'}
                </p>
              </div>

              <div className="space-y-0 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">NIC:</span>
                  <span className="font-semibold text-slate-800 dark:text-white">{liveStudentData?.nic || 'N/A'}</span>
                </div>
                
                <div className="flex flex-col py-2.5 border-b border-slate-100 dark:border-slate-800/60 gap-1.5">
                  <span className="text-slate-400">Class:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {enrolledClasses.length > 0 ? (
                      enrolledClasses.map((c: string, i: number) => (
                        <span key={i} className="bg-blue-50 dark:bg-purple-600/20 text-blue-700 dark:text-purple-300 border border-blue-200 dark:border-purple-500/30 px-2.5 py-0.5 rounded-lg text-[11px] font-bold">
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400">No Classes</span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">District:</span>
                  <span className="font-semibold text-slate-800 dark:text-white">{capitalize(liveStudentData?.district || 'N/A')}</span>
                </div>
                
                <div className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">WhatsApp:</span>
                  <span className="font-semibold text-slate-800 dark:text-white font-mono">{liveStudentData?.WhatsApp || liveStudentData?.whatsapp || 'N/A'}</span>
                </div>
                
                <div className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">Mobile:</span>
                  <span className="font-semibold text-slate-800 dark:text-white font-mono">{liveStudentData?.mobile || 'N/A'}</span>
                </div>

                <div className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">Status:</span>
                  <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${isPaidCurrentMonth ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {isPaidCurrentMonth ? '🟢 Active (Paid)' : '🔴 Fees Due (Unpaid)'}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button 
                  onClick={() => setIsProfileOpen(false)} 
                  className="flex-1 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
                >
                  Close
                </button>
                <button 
                  onClick={() => { setIsProfileOpen(false); handleStudentLogout(); }} 
                  className="flex-1 py-2.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold hover:bg-rose-600 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={14} /> Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Notifications & Alerts Center Drawer */}
      {isNotificationsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 rounded-xl">
                  <Bell size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">සිහිකැඳවීම් සහ නිවේදන</h3>
                  <p className="text-[11px] text-slate-400">Database Realtime Notifications</p>
                </div>
              </div>
              <button 
                onClick={() => setIsNotificationsDrawerOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {paymentReminders.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-black uppercase text-rose-600 tracking-wider">
                    ⚠️ Payment Reminders ({paymentReminders.length})
                  </h4>
                  {paymentReminders.map((rem: any, idx: number) => (
                    <div key={idx} className="p-3.5 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-600 text-white uppercase">
                          {rem.classType || 'Class'}
                        </span>
                        {rem.month && (
                          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                            {rem.month}
                          </span>
                        )}
                      </div>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">{rem.title}</h5>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{rem.message}</p>
                      <button 
                        onClick={() => { setIsNotificationsDrawerOpen(false); handleTabChange('history'); }}
                        className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-extrabold hover:underline flex items-center gap-1"
                      >
                        ගෙවීම් තොරතුරු බලන්න →
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {allReminders.filter((r: any) => !r.isPaymentReminder).length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-[11px] font-black uppercase text-blue-600 tracking-wider">
                    📢 Teacher Announcements
                  </h4>
                  {allReminders.filter((r: any) => !r.isPaymentReminder).map((a: any, idx: number) => (
                    <div key={idx} className="p-3.5 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-2xl space-y-1">
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">{a.title}</h5>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{a.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {paymentReminders.length === 0 && allReminders.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-xs">
                  නව දැනුම්දීම් කිසිවක් නොමැත.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                onClick={() => setIsNotificationsDrawerOpen(false)}
                className="w-full py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
              >
                වසන්න (Close)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2.5 Join Class Cart & Payment Modal */}
      {isJoinModalOpen && selectedClassToJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 my-8 animate-in fade-in zoom-in duration-200">
            {/* Close Button */}
            <button
              onClick={() => setIsJoinModalOpen(false)}
              className="absolute top-5 right-5 p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X size={16} />
            </button>

            {/* Header info */}
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] font-bold mb-2">
                <Sparkles size={13} className="text-amber-400" /> පන්ති ලියාපදිංචි කාට් එක (Checkout Cart)
              </div>
              <h3 className="text-lg font-black text-white">
                {selectedClassToJoin.name} - නව පන්තියට සම්බන්ධ වන්න
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                ගෙවීම් සිදුකර රිසීට් පතේ Transaction ID එක සදහන් කර සබ්මිට් කරන්න.
              </p>
            </div>

            {/* Bill summary box */}
            <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">පන්තිය (Class):</span>
                <span className="font-bold text-white text-sm">{selectedClassToJoin.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">අදාළ මාසය:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {new Date().getFullYear()} {['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'][new Date().getMonth()]}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-800/80">
                <span className="text-slate-300 font-bold">ගෙවිය යුතු මාසික ගාස්තුව:</span>
                <span className="font-mono font-black text-base text-emerald-400">
                  රු. {selectedClassToJoin.fee.toLocaleString()}/=
                </span>
              </div>
            </div>

            {/* Payment Method Switcher */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setJoinPaymentMethod('bank')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  joinPaymentMethod === 'bank'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 ring-1 ring-blue-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard size={15} /> බැංකු තැන්පතු (Bank)
              </button>
              <button
                type="button"
                onClick={() => setJoinPaymentMethod('qr')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  joinPaymentMethod === 'qr'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 ring-1 ring-blue-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <QrCode size={15} /> LankaQR Pay
              </button>
            </div>

            {/* Method Details: Bank Deposit */}
            {joinPaymentMethod === 'bank' && (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {(bankAccountsList.length > 0 ? bankAccountsList : [
                  {
                    id: 'def_peoples',
                    bank_name: "People's Bank (මහජන බැංකුව)",
                    account_name: 'S K S Tharaka Amarasinghe',
                    account_number: '015200130036285',
                    branch: 'Ampara (අම්පාර)',
                    bank_logo: '/Peoples-bank-logo.jpg',
                    instructions: 'Online Banking හෝ CDM මඟින් තැන්පත් කළ හැක.'
                  }
                ]).map((acc: any) => (
                  <div key={acc.id} className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs flex items-center gap-2">
                        {acc.bank_name}
                      </span>
                      {acc.bank_logo && (
                        <img src={acc.bank_logo} alt={acc.bank_name} className="h-4.5 w-auto object-contain rounded" />
                      )}
                    </div>

                    <div className="bg-slate-900 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Account Number</span>
                        <span className="text-sm font-bold font-mono text-emerald-400 select-all tracking-wider">
                          {acc.account_number}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(acc.account_number);
                          setCopiedBankInfo(acc.id);
                          setTimeout(() => setCopiedBankInfo(null), 2000);
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg border border-slate-700 flex items-center gap-1 transition cursor-pointer"
                      >
                        {copiedBankInfo === acc.id ? (
                          <>
                            <Check size={12} className="text-emerald-400" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> Copy අංකය
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-400">
                      <div>නම: <span className="text-slate-200 font-medium">{acc.account_name}</span></div>
                      <div>ශාඛාව: <span className="text-slate-200">{acc.branch}</span></div>
                    </div>

                    {acc.instructions && (
                      <p className="text-[10px] text-slate-500 bg-slate-900/50 p-1.5 rounded border border-slate-800/40">
                        ℹ️ {acc.instructions}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Method Details: LankaQR */}
            {joinPaymentMethod === 'qr' && (
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-2">
                <div className="relative inline-block bg-white p-2.5 rounded-2xl border border-slate-800 mx-auto group">
                  <img
                    src="/qr-payment.PNG"
                    alt="LankaQR"
                    className="w-40 h-40 object-contain cursor-zoom-in"
                    onClick={() => setIsQrZoomModalOpen(true)}
                  />
                  <div
                    onClick={() => setIsQrZoomModalOpen(true)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition rounded-2xl cursor-pointer"
                  >
                    <Maximize2 size={16} />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  iPay, People's Wave, BOC, Commercial Q+ ආදී ඕනෑම LankaQR සහය දක්වන බැංකු ඇප් එකකින් ස්කෑන් කර ගෙවන්න.
                </p>
              </div>
            )}

            {/* Transaction ID input & Submit Form */}
            <form onSubmit={handleJoinFormSubmit} className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  මුදල් ගෙවූ රිසීට් පත්‍රයේ Transaction ID / Invoice අංකය *
                </label>
                <input
                  type="text"
                  value={joinTransactionId}
                  onChange={(e) => setJoinTransactionId(e.target.value)}
                  placeholder="උදා: TXN-89472619 / REF-12345"
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3.5 py-2.5 rounded-xl font-mono focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  රිසීට් පතේ ඇති Reference / Transaction අංකය නිවැරදිව මෙහි සදහන් කරන්න.
                </span>
              </div>

              {joinErrorMessage && (
                <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={15} /> {joinErrorMessage}
                </div>
              )}

              {joinSuccessMessage && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 size={15} /> {joinSuccessMessage}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  අවලංගු කරන්න (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={joinSubmitting || !joinTransactionId.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={14} className={joinSubmitting ? 'animate-spin' : ''} />
                  {joinSubmitting ? 'යොමු වෙමින් පවතී...' : 'ගෙවීම් තහවුරු කරන්න'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Zoom Modal */}
      {isQrZoomModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setIsQrZoomModalOpen(false)}>
          <button className="absolute top-4 right-4 text-slate-400 hover:text-white p-2" onClick={() => setIsQrZoomModalOpen(false)}>
            <X size={24} />
          </button>
          <div className="bg-white p-4 rounded-3xl max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src="/qr-payment.PNG" alt="QR Large" className="w-full h-auto object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* 3. Mobile Slide-out Drawer */}
      {isSidebarOpenMobile && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div 
            onClick={() => setIsSidebarOpenMobile(false)} 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-72 max-w-[80vw] bg-white dark:bg-slate-900 h-full p-5 shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-left duration-200">
            <div>
              {/* Branding: Logo & Name */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                {siteConfig?.logoUrl && siteConfig.logoUrl.trim() !== '' ? (
                  <img src={siteConfig.logoUrl} alt="Logo" className="w-9 h-9 rounded-xl object-cover shadow-sm ring-1 ring-blue-500/20" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-black text-base flex items-center justify-center shadow-sm">
                    Ω
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    Smart Physics
                  </h2>
                  <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 truncate">
                    තාරක අමරසිංහ
                  </p>
                </div>
              </div>

              {/* Profile Card Header */}
              <div 
                onClick={() => { setIsSidebarOpenMobile(false); setIsProfileOpen(true); }}
                className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3 cursor-pointer mb-5"
              >
                <div className="relative">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-blue-500/20">
                    {studentInitials}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {studentDisplayName}
                  </h3>
                  <p className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 truncate">
                    ID: {liveStudentData?.username || 'ST-2222'}
                  </p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsSidebarOpenMobile(false); }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Navigation Menu List */}
              <nav className="space-y-1">
                {navMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = dashboardTab === item.id;
                  return (
                    <button
                      key={String(item.id)}
                      onClick={() => {
                        handleTabChange(item.id as TabType);
                        setIsSidebarOpenMobile(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition text-left cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={16} />
                        <span>{getMenuItemLabel(item)}</span>
                      </div>
                      {item.badge && (
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          isActive 
                            ? 'bg-white/20 text-white' 
                            : item.isLive 
                            ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30 animate-pulse'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Logout Button */}
            <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800">
              <button
                onClick={() => { setIsSidebarOpenMobile(false); handleStudentLogout(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-600 hover:text-white transition shadow-sm cursor-pointer"
              >
                <LogOut size={16} /> Logout (පද්ධතියෙන් ඉවත් වන්න)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MAIN LAYOUT: DESKTOP LEFT SIDEBAR + RIGHT CONTENT AREA */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 md:pt-6">
        <div className="flex flex-col md:flex-row items-start gap-6">

          {/* ======================================================== */}
          {/* LEFT SIDEBAR (Desktop Fixed/Sticky)                     */}
          {/* ======================================================== */}
          <aside className="hidden md:flex flex-col justify-between w-64 lg:w-72 shrink-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-sm sticky top-6 min-h-[calc(100vh-3rem)]">
            <div>
              {/* BRANDING: Website Logo & Name */}
              <div className="flex items-center gap-3 px-1 mb-5 pb-4 border-b border-slate-200/80 dark:border-slate-800">
                {siteConfig?.logoUrl && siteConfig.logoUrl.trim() !== '' ? (
                  <img src={siteConfig.logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-cover shadow-sm ring-1 ring-blue-500/20" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black text-lg flex items-center justify-center shadow-sm">
                    Ω
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    Smart Physics
                  </h2>
                  <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 truncate">
                    තාරක අමරසිංහ
                  </p>
                </div>
              </div>

              {/* TOP LEFT: Profile Photo & Student Name & ID (Clickable) */}
              <div 
                onClick={() => setIsProfileOpen(true)}
                className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 flex items-center gap-3.5 cursor-pointer hover:bg-blue-50/70 dark:hover:bg-slate-800 transition group select-none shadow-sm"
                title="ප්‍රොෆයිල් විස්තර බැලීමට ක්ලික් කරන්න"
              >
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-extrabold text-base shadow-sm ring-2 ring-blue-500/20 group-hover:scale-105 transition-transform">
                    {studentInitials}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white truncate group-hover:text-blue-600 transition leading-snug">
                    {studentDisplayName}
                  </h3>
                  <p className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 truncate">
                    ID: {liveStudentData?.username || 'ST-2222'}
                  </p>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold group-hover:underline">
                    View Profile →
                  </span>
                </div>
              </div>

              {/* VERTICAL MENU LIST */}
              <div className="pt-5 pb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3">
                  DASHBOARD MENU
                </span>
              </div>

              <nav className="space-y-1.5 flex-1">
                {navMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = dashboardTab === item.id;
                  return (
                    <button
                      key={String(item.id)}
                      onClick={() => handleTabChange(item.id as TabType)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer group ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-extrabold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-xl transition ${
                          isActive 
                            ? 'bg-white/20 text-white' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:text-blue-600'
                        }`}>
                          <Icon size={16} />
                        </div>
                        <div className="truncate">
                          <span className="block truncate">{getMenuItemLabel(item)}</span>
                          <span className={`block text-[10px] font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                            {activeLang === 'si' ? item.label : item.sinhala}
                          </span>
                        </div>
                      </div>
                      {item.badge && (
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ml-1 shrink-0 ${
                          isActive 
                            ? 'bg-white/20 text-white' 
                            : item.isLive 
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* BOTTOM LEFT: LOGOUT BUTTON */}
            <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800">
              <button
                onClick={handleStudentLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white transition shadow-sm cursor-pointer"
              >
                <LogOut size={16} /> Logout (පද්ධතියෙන් ඉවත් වන්න)
              </button>
            </div>
          </aside>

          {/* ======================================================== */}
          {/* RIGHT CONTENT AREA (Matches User Screenshots)           */}
          {/* ======================================================== */}
          <main ref={mainContentRef} className="flex-1 min-w-0 w-full space-y-6">

            {/* Mobile Sidebar Trigger (Clean, space-efficient) */}
            <div className="md:hidden flex items-center justify-between bg-white dark:bg-slate-900 px-4 py-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <button
                onClick={() => setIsSidebarOpenMobile(true)}
                className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-blue-600 transition cursor-pointer"
              >
                <Menu size={16} />
                <span>මෙනුව (Menu)</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsNotificationsDrawerOpen(true)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 relative"
                  title="Notifications"
                >
                  <Bell size={14} />
                  {totalRemindersCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-black text-[8px] rounded-full h-3.5 min-w-[14px] px-1 flex items-center justify-center">
                      {totalRemindersCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400"
                >
                  Profile
                </button>
              </div>
            </div>

            {/* Real-time Approval/Rejection Notifications Stream (Dismissible & Disappears on Leave) */}
            {liveAlerts.length > 0 && (
              <div className="space-y-3">
                {liveAlerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-4 md:p-5 rounded-3xl border flex items-start justify-between gap-3 shadow-xl animate-in fade-in slide-in-from-top-3 duration-300 ${
                      alert.type === 'approved'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-100 dark:bg-emerald-950/40'
                        : 'bg-rose-500/15 border-rose-500/40 text-rose-100 dark:bg-rose-950/40'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-2xl mt-0.5 shrink-0 ${
                        alert.type === 'approved' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                      }`}>
                        {alert.type === 'approved' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-sm text-slate-900 dark:text-white">{alert.title}</h4>
                          <span className="text-[10px] opacity-70 font-mono text-slate-600 dark:text-slate-400">{alert.time}</span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                          {alert.message}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDismissAlert(alert.id)}
                      className="p-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition cursor-pointer shrink-0"
                      title="මෙම නිවේදනය ඉවත් කරන්න (Dismiss)"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW A: HUB OVERVIEW (When dashboardTab === null)         */}
            {/* ======================================================== */}
            {dashboardTab === null && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* 1. ROYAL BLUE GRADIENT HERO BANNER (Screenshot 1) */}
                <div className="relative rounded-3xl p-6 sm:p-8 md:p-10 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-800 text-white shadow-xl shadow-blue-900/15 overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute right-20 -top-20 w-48 h-48 bg-blue-400/10 rounded-full blur-xl pointer-events-none" />

                  <div className="relative z-10 space-y-2.5 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[11px] font-bold tracking-wider uppercase text-blue-100">
                      <span>WELCOME BACK, {studentDisplayName}!</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight">
                      Your learning hub, all in one place
                    </h1>
                    <p className="text-xs sm:text-sm text-blue-100/90 font-medium leading-relaxed pt-1">
                      Exams, recordings, live classes and study materials — everything you need for {siteConfig?.headerTitle || 'Physics Online Hub'}, built for your device.
                    </p>
                  </div>
                </div>

                {/* 2. OVERVIEW STATS CARDS (Screenshot 1: Total Exams, Available Now, Completed) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Card 1: Total Exams */}
                  <div 
                    onClick={() => handleTabChange('exams')}
                    className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-400/50 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                        <FileText size={18} />
                      </div>
                    </div>
                    <div className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                      {examsCount}
                    </div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                      Total Exams
                    </p>
                  </div>

                  {/* Card 2: Available Now */}
                  <div 
                    onClick={() => handleTabChange('exams')}
                    className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-emerald-400/50 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                        <CheckCircle2 size={18} />
                      </div>
                    </div>
                    <div className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                      {availableExamsCount}
                    </div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                      Available Now
                    </p>
                  </div>

                  {/* Card 3: Completed */}
                  <div 
                    onClick={() => handleTabChange('exams')}
                    className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-amber-400/50 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                        <Trophy size={18} />
                      </div>
                    </div>
                    <div className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                      {completedExamsCount}
                    </div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                      Completed
                    </p>
                  </div>
                </div>

                {/* 3. HIGH-PRIORITY NOTIFICATIONS & PAYMENT REMINDERS (From Supabase DB) */}
                {paymentReminders.length > 0 && (
                  <div className="space-y-3">
                    {paymentReminders.map((rem: any, idx: number) => (
                      <div 
                        key={idx}
                        className="p-5 bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-white dark:to-slate-900 border-2 border-rose-500/60 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="p-3 bg-rose-600 text-white rounded-2xl shrink-0 shadow-sm">
                            <AlertTriangle size={22} />
                          </div>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider">
                                ⚠️ PAYMENT REMINDER
                              </span>
                              {rem.classType && (
                                <span className="px-2.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-[11px]">
                                  📘 {rem.classType}
                                </span>
                              )}
                              {rem.month && (
                                <span className="px-2.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-bold text-[11px]">
                                  📅 {rem.month}
                                </span>
                              )}
                              {rem.amount && (
                                <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                                  Rs. {rem.amount}
                                </span>
                              )}
                            </div>
                            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
                              {rem.title}
                            </h4>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
                              {rem.message}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleTabChange('history')}
                          className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-md transition cursor-pointer whitespace-nowrap self-start md:self-auto"
                        >
                          ගෙවීම් තොරතුරු (Pay Now) →
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 4. "WHAT WOULD YOU LIKE TO DO?" SECTION & ACTION CARDS (Screenshot 1 & 2) */}
                <div className="space-y-4">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    WHAT WOULD YOU LIKE TO DO?
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Card 1: Exams */}
                    <div
                      onClick={() => handleTabChange('exams')}
                      className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-400 transition cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
                          <PenTool size={22} />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition flex items-center justify-center">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white group-hover:text-blue-600 transition">
                          Exams
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          Take exams, track scores, retry anytime
                        </p>
                      </div>
                    </div>

                    {/* Card 2: Recordings */}
                    <div
                      onClick={() => handleTabChange('recordings')}
                      className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-amber-400 transition cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
                          <Video size={22} />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-amber-500 group-hover:bg-amber-50 transition flex items-center justify-center">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white group-hover:text-amber-500 transition">
                          Recordings
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          Watch past classes in HD, zero data charges
                        </p>
                      </div>
                    </div>

                    {/* Card 3: Course Packages */}
                    <div
                      onClick={() => handleTabChange('history')}
                      className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-emerald-400 transition cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30">
                          <Package size={22} />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-emerald-600 group-hover:bg-emerald-50 transition flex items-center justify-center">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white group-hover:text-emerald-600 transition">
                          Course Packages
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          See your enrolled plan, validity &amp; fees
                        </p>
                      </div>
                    </div>

                    {/* Card 4: Documents */}
                    <div
                      onClick={() => handleTabChange('tutes')}
                      className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-slate-600 transition cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center shadow-md shadow-slate-800/30">
                          <FileText size={22} />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-slate-700 group-hover:bg-slate-100 transition flex items-center justify-center">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white group-hover:text-slate-700 transition">
                          Documents
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          View and download your notes &amp; papers
                        </p>
                      </div>
                    </div>

                    {/* Card 5: Live Classes */}
                    <div
                      onClick={() => handleTabChange('live')}
                      className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-rose-400 transition cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-md shadow-rose-500/30">
                          <Radio size={22} />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-rose-500 group-hover:bg-rose-50 transition flex items-center justify-center">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white group-hover:text-rose-500 transition">
                          Live Classes
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          Join live sessions with real-time Q&amp;A
                        </p>
                      </div>
                    </div>

                    {/* Card 6: Class Timetable */}
                    <div
                      onClick={() => handleTabChange('calendar')}
                      className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-purple-400 transition cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/30">
                          <CalendarDays size={22} />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-purple-600 group-hover:bg-purple-50 transition flex items-center justify-center">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white group-hover:text-purple-600 transition">
                          Class Timetable
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          Check dates, times &amp; upcoming sessions
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. FOOTER CARD */}
                <div className="mt-8 p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm text-center text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-center gap-2.5 text-blue-600 dark:text-blue-400 font-bold">
                    <span>Contact: Smart Physics Support Team - 0779630100</span>
                    <a 
                      href="tel:0779630100" 
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-[11px] transition"
                      title="Call Support Hotline"
                    >
                      <Phone size={12} /> Call Hotline
                    </a>
                    <a 
                      href="https://wa.me/94779630100" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[11px] transition"
                      title="WhatsApp Support Team"
                    >
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-semibold">
                    🏛️ Powered by Amarasinghe Digital
                  </div>
                </div>

              </div>
            )}

            {/* ======================================================== */}
            {/* VIEW B: INTERACTIVE SUB-VIEW (When dashboardTab !== null) */}
            {/* ======================================================== */}
            {dashboardTab !== null && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Back to Hub Header */}
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
                  <button
                    onClick={() => handleTabChange(null)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold text-xs hover:bg-blue-600 hover:text-white transition cursor-pointer"
                  >
                    <ArrowLeft size={14} /> ආපසු ඩෑෂ්බෝඩයට (Back to Hub)
                  </button>

                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {dashboardTab === 'live' && '🔴 Zoom Live Class'}
                    {dashboardTab === 'recordings' && '📹 Class Recordings Library'}
                    {dashboardTab === 'tutes' && '📚 Documents & Question Papers'}
                    {dashboardTab === 'exams' && '✍️ Online Exams & Scores'}
                    {dashboardTab === 'calendar' && '📅 Class Timetable'}
                    {dashboardTab === 'history' && '💳 Payment History & Course Packages'}
                  </div>
                </div>

                {/* Sub-view Viewport */}
                <div className="rounded-3xl overflow-hidden">
                  {dashboardTab === 'live' && (
                    <SafeComponent>
                      <LiveClassPlayer 
                        currentUser={liveStudentData} 
                        onNavigateToPayment={() => handleTabChange('history')}
                      />
                    </SafeComponent>
                  )}

                  {dashboardTab === 'recordings' && liveStudentData && (
                    <SafeComponent>
                      <StudentRecordings 
                        student={liveStudentData} 
                        onBack={() => handleTabChange(null)} 
                      />
                    </SafeComponent>
                  )}

                  {dashboardTab === 'tutes' && (
                    <SafeComponent>
                      <TutsPapersManager currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />
                    </SafeComponent>
                  )}

                  {dashboardTab === 'exams' && (
                    <SafeComponent>
                      <OnlineExamsHistory currentStudent={liveStudentData} />
                    </SafeComponent>
                  )}

                  {dashboardTab === 'calendar' && renderCalendar()}

                  {dashboardTab === 'history' && renderOtherClasses()}
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

    </div>
  );
};

export default StudentDashboard;