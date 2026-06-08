import React, { useEffect, useState, useRef } from 'react';
import { Bell, AlertTriangle, Video, BookOpen, Download, LogOut, FileText, X, User, Phone, MapPin, Book, RefreshCw, CheckCircle2, XCircle, CalendarDays, History } from 'lucide-react';

import LiveClassPlayer from './LiveClassPlayer';
import RecordingsManager from './RecordingsManager';
import TutsPapersManager from './TutsPapersManager';
import OnlineExamsHistory from './OnlineExamsHistory';

type TabType = "live" | "recordings" | "tutes" | "exams" | "calendar" | "history";

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
  
  // 💡 App.tsx එකෙන් එවන supabase client එක පිළිගැනීමට මෙය අලුතින්ම එකතු කළා
  supabase: any; 
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
          <p className="text-xs text-slate-400">මෙම සෙක්ෂන් එකෙහි ඇති පරණ Database Table සම්බන්ධතා නිසා මෙය සිදුවේ.</p>
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
  supabase // 💡 Props වලින් supabase ලබා ගැනීම මෙතනට ඇතුලත් කළා
}) => {
  const [dbReminders, setDbReminders] = useState<any[]>([]);
  const [totalRemindersCount, setTotalRemindersCount] = useState<number>(0);
  const [isPaidCurrentMonth, setIsPaidCurrentMonth] = useState<boolean>(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [liveStudentData, setLiveStudentData] = useState<any>(currentStudent);
  const [classPaymentStatuses, setClassPaymentStatuses] = useState<{name: string, status: 'Paid' | 'Free' | 'Unpaid'}[]>([]);
  
  const [paymentHistory, setPaymentHistory] = useState<Record<string, string[]>>({});
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);

  const mainContentRef = useRef<HTMLDivElement>(null);

  // ශ්‍රී ලංකා වේලාවෙන් වත්මන් මාසය ලබා ගැනීම
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

  //  අලුත් කේතය (මෙය ඇතුළත් කරන්න):
useEffect(() => {
  fetchDashboardData();

  if (supabase) {
    const channel = supabase.channel('student_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `id=eq.${currentStudent.id}` }, () => { // 👈 username වෙනුවට id දැම්මා
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}, [currentStudent.id, supabase]); // 👈 dependency array එකටත් id දැම්මා

  const fetchDashboardData = async () => {
    setIsRefreshing(true);
    
    if (supabase) {
      try {
        // 1. සිසුවාගේ නැවුම් දත්ත ලබා ගැනීම (ID එකෙන්)
        const { data: freshStudentData } = await supabase
          .from('students')
          .select('*')
          .eq('id', currentStudent.id) // 👈 username වෙනුවට id එකෙන් සොයයි
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

        // 2. Payments දත්ත කියවීම සහ සැසඳීම (student_id එකෙන්)
        const { data: paymentData } = await supabase
          .from('payments')
          .select('*')
          .eq('student_id', studentToUse.id); // 👈 username වෙනුවට student_id එකෙන් සොයයි


        let statuses: {name: string, status: 'Paid' | 'Free' | 'Unpaid'}[] = [];
        let extractedReminders: any[] = [];
        let pHistory: Record<string, string[]> = {};
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

        if (paymentData && paymentData.length > 0) {
          // Reminders සහ Reminders Count එක එකතු කිරීම
          paymentData.forEach((p: any) => {
            if (p.reminder_massage && p.reminder_massage.trim() !== '') {
              extractedReminders.push({
                title: `Payment Reminder`,
                message: p.reminder_massage
              });
              activeRemindersSum += p.reminders_count || 1;
            }
          });

          // History එක සැකසීම (සියලුම ගෙවීම් වාර්තා)
          paymentData.forEach((p: any) => {
            if (p.status?.toLowerCase() === 'paid' || p.status?.toLowerCase() === 'free') {
              const className = p.class_name || p.class_type || 'General';
              if (!pHistory[className]) pHistory[className] = [];
              const monthStr = p.month || p.target_month || 'Unknown Month';
              if (!pHistory[className].includes(monthStr)) {
                pHistory[className].push(monthStr);
              }
            }
          });

          // වත්මන් මාසයේ ගෙවීම් පරීක්ෂාව
          const currentMonthPayments = paymentData.filter((p: any) => 
            isCurrentMonthMatch(p.month) || isCurrentMonthMatch(p.target_month)
          );

          if (isFreeStudent) {
            statuses = enrolledClasses.map((cls) => ({ name: cls, status: 'Free' }));
            setIsPaidCurrentMonth(true);
          } else {
            statuses = enrolledClasses.map((cls) => {
              const paymentRecord = currentMonthPayments.find((p: any) => {
                const pClass = (p.class_name || p.class_type || '').toString().trim().toLowerCase();
                const sClass = cls.toString().trim().toLowerCase();
                return pClass === sClass;
              });

              let statusValue: 'Paid' | 'Free' | 'Unpaid' = 'Unpaid';
              if (paymentRecord) {
                if (paymentRecord.status?.toLowerCase() === 'paid') statusValue = 'Paid';
                else if (paymentRecord.status?.toLowerCase() === 'free') statusValue = 'Free';
              }
              return { name: cls, status: statusValue };
            });

            const hasUnpaidClass = statuses.some(s => s.status === 'Unpaid');
            setIsPaidCurrentMonth(enrolledClasses.length === 0 ? true : !hasUnpaidClass);
          }
        } else {
          statuses = enrolledClasses.map(cls => ({ name: cls, status: isFreeStudent ? 'Free' : 'Unpaid' }));
          setIsPaidCurrentMonth(isFreeStudent);
        }
        
        setClassPaymentStatuses(statuses);
        setPaymentHistory(pHistory);
        setTotalRemindersCount(activeRemindersSum);

        // 3. Announcements කියවීම (පන්ති වර්ගය අනුව)
        const { data: announcementData } = await supabase
          .from('announcements')
          .select('*')
          .or(`target_class_type.eq.${studentToUse.class},target_user.eq.all`);

        if (announcementData) {
          const generalAlerts = announcementData.map((a: any) => ({
            title: a.title || 'විශේෂ නිවේදනයයි',
            message: a.content
          }));
          extractedReminders = [...extractedReminders, ...generalAlerts];
        }
        setDbReminders(extractedReminders);

        // 4. Calendar Events කියවීම (පන්ති වර්ගය අනුව)
        const { data: eventsData } = await supabase
          .from('calendar_events')
          .select('*')
          .like('date', `${currentMonthKey}%`)
          .eq('target_class_type', studentToUse.class);
        
        if (eventsData) setCalendarEvents(eventsData);

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
    }, 150);
  };

  const handleBellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDashboardTab('history');
    setTimeout(() => {
      mainContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const capitalize = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
  const fName = capitalize(liveStudentData?.first_name || liveStudentData?.name || '');
  const lName = capitalize(liveStudentData?.last_name || '');
  const studentDisplayName = fName || lName ? `${fName} ${lName}`.trim() : liveStudentData?.username;

  const allReminders = [...dbReminders, ...studentAlerts];

  const generateProfileBorderGradient = () => {
    if (!isPaidCurrentMonth) {
      return 'conic-gradient(#ef4444 0% 100%)'; 
    }
    if (classPaymentStatuses.length === 0) {
      return 'conic-gradient(#10b981 0% 100%)';
    }
    
    const segmentPercentage = 100 / classPaymentStatuses.length;
    const gradientParts = classPaymentStatuses.map((cls, index) => {
      let color = '#ef4444'; 
      if (cls.status === 'Paid') color = '#10b981'; 
      else if (cls.status === 'Free') color = '#3b82f6'; 
      
      const start = (index * segmentPercentage).toFixed(2);
      const end = ((index + 1) * segmentPercentage).toFixed(2);
      return `${color} ${start}% ${end}%`;
    });

    return `conic-gradient(${gradientParts.join(', ')})`;
  };

  const renderCalendar = () => {
    const daysInMonth = new Date(cYear, cMonthNum, 0).getDate();
    const firstDayIndex = new Date(cYear, cMonthNum - 1, 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    return (
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white border-b border-slate-800 pb-3">
          <CalendarDays className="text-purple-400" /> පන්ති කාලසටහන ({currentMonthKey})
        </h3>
        <div className="grid grid-cols-7 gap-2 text-center text-sm font-bold text-slate-400 mb-2">
          <div className="text-rose-500">Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            if (day === null) return <div key={`empty-${index}`} className="p-4"></div>;
            
            const dateStr = `${cYear}-${cMonthPadded}-${String(day).padStart(2, '0')}`;
            const dayEvents = calendarEvents.filter(e => e.date === dateStr);
            const isToday = day === new Date().getDate();

            return (
              <div key={index} className={`min-h-[90px] p-2 rounded-xl border flex flex-col justify-between transition-all ${isToday ? 'bg-purple-950/30 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'}`}>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md self-start ${isToday ? 'bg-purple-500 text-white' : 'text-slate-300'}`}>{day}</span>
                <div className="mt-1 space-y-1 w-full overflow-y-auto max-h-[50px] custom-scrollbar">
                  {dayEvents.map((ev, i) => (
                     <div key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 truncate w-full text-center font-medium" title={ev.title}>
                       {ev.title}
                     </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans selection:bg-blue-500/30">
      
      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-gradient-to-r from-blue-900 to-slate-900 p-6 flex justify-between items-start border-b border-slate-800">
              <div>
                <h3 className="font-bold text-2xl text-white">{studentDisplayName}</h3>
                <p className="text-blue-300 text-sm font-mono mt-1">ID: {liveStudentData.username}</p>
              </div>
              <button onClick={() => setIsProfileOpen(false)} className="p-2 bg-slate-800/50 rounded-full hover:bg-slate-700 text-slate-300 transition">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-slate-300 border-b border-slate-800/50 pb-4">
                <User size={18} className="text-purple-400" />
                <div className="grid grid-cols-2 gap-4 w-full">
                   <div>
                    <p className="text-[11px] text-slate-500 uppercase font-bold">NIC</p>
                    <p className="font-medium text-sm">{liveStudentData.nic || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase font-bold">Class / Grade</p>
                    <p className="font-medium text-sm">{liveStudentData.class || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-300 border-b border-slate-800/50 pb-4">
                <Phone size={18} className="text-emerald-400" />
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase font-bold">WhatsApp</p>
                    <p className="font-medium text-sm">{liveStudentData.WhatsApp || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase font-bold">Mobile</p>
                    <p className="font-medium text-sm">{liveStudentData.mobile || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-300 border-b border-slate-800/50 pb-4">
                <MapPin size={18} className="text-rose-400" />
                <div>
                  <p className="text-[11px] text-slate-500 uppercase font-bold">District</p>
                  <p className="font-medium text-sm">{liveStudentData.district || 'N/A'}</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-slate-950 flex justify-end">
               <button onClick={handleStudentLogout} className="flex items-center gap-2 px-6 py-2.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-900/50 rounded-xl transition-all font-bold">
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Header */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8 items-center bg-gradient-to-br from-slate-900/80 to-slate-900/40 backdrop-blur-xl p-6 rounded-3xl border border-slate-800 shadow-2xl relative z-10">
        
        {/* Profile Avatar Container */}
        <div className="lg:col-span-3 flex flex-col items-center relative border-r-0 lg:border-r border-slate-800/60 lg:pr-4">
          
          <div onClick={() => setIsProfileOpen(true)} className="relative group mt-2 w-28 h-28 md:w-32 md:h-32 flex items-center justify-center cursor-pointer">
            {!isPaidCurrentMonth && (
              <div className="absolute inset-0 rounded-full bg-red-600 animate-ping opacity-25" />
            )}

            <div 
              className={`absolute inset-0 rounded-full animate-[spin_8s_linear_infinite] ${
                !isPaidCurrentMonth ? 'shadow-[0_0_30px_rgba(239,68,68,0.8)] border-2 border-red-500' : 'shadow-[0_0_25px_rgba(255,255,255,0.05)]'
              }`}
              style={{ 
                background: generateProfileBorderGradient(),
                padding: '5px' 
              }}
            >
              <div className="w-full h-full bg-slate-950 rounded-full" />
            </div>

            <div className={`absolute inset-[5px] rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center font-black text-4xl shadow-inner group-hover:scale-105 transition-transform duration-300 ${
              !isPaidCurrentMonth ? 'border border-red-500/50' : ''
            }`}>
              <span className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                {studentDisplayName.slice(0, 1).toUpperCase()}
              </span>
            </div>

            <div className="absolute bottom-0 right-1 bg-slate-900 rounded-full p-2 border border-slate-700 text-slate-300 group-hover:text-white transition-colors shadow-md z-10">
              <User size={16} />
            </div>

            {totalRemindersCount > 0 && (
              <div 
                onClick={handleBellClick}
                className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-amber-500 text-white font-black text-xs rounded-full h-7 w-7 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.5)] border border-white/20 animate-[bounce_1s_infinite] cursor-pointer hover:scale-110 transition-transform z-20"
                title={`${totalRemindersCount} ගෙවීම් මතක් කිරීම් ඇත. ක්ලික් කර බලන්න.`}
              >
                <Bell size={12} className="animate-pulse mr-[1px]" />
                <span className="text-[10px]">{totalRemindersCount}</span>
              </div>
            )}
          </div>

          <h2 className="mt-4 font-bold text-lg text-center text-white tracking-wide">{studentDisplayName}</h2>
          
          <p className="text-slate-400 text-sm text-center font-medium mt-1 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
            {cYear} {cMonthName}
          </p>
          
          {/* Class Label Stickers */}
          <div className="flex flex-wrap justify-center gap-2 mt-4 w-full">
            {classPaymentStatuses.length > 0 ? classPaymentStatuses.map((cls, idx) => (
              <span key={idx} className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl border shadow-lg transition-all ${
                cls.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)] animate-[pulse_2.5s_infinite]' :
                cls.status === 'Free' ? 'bg-blue-500/10 text-blue-400 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.15)] animate-[pulse_3s_infinite]' :
                'bg-red-500/10 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.25)] animate-pulse'
              }`}>
                {cls.status === 'Paid' || cls.status === 'Free' ? (
                  <CheckCircle2 size={11} className={cls.status === 'Paid' ? 'text-emerald-400' : 'text-blue-400'} />
                ) : (
                  <XCircle size={11} className="text-red-400" />
                )}
                {cls.name} : {cls.status}
              </span>
            )) : (
              <span className="text-xs text-slate-500 bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700">පන්ති ඇතුලත් කර නොමැත</span>
            )}
          </div>
        </div>

        {/* Navigation Tab Controls Menu */}
        <div className="lg:col-span-9 flex flex-wrap gap-3 justify-center lg:justify-start lg:pl-6 mt-4 lg:mt-0">
          
          <button 
            onClick={fetchDashboardData} 
            className={`flex items-center justify-center p-3 rounded-2xl bg-slate-800/80 border border-slate-700 hover:bg-slate-700 text-slate-300 transition-all ${isRefreshing ? 'animate-spin text-blue-400 border-blue-500/50' : ''}`}
            title="දත්ත යාවත්කාලීන කරන්න"
          >
             <RefreshCw size={18} />
          </button>
          
          <button onClick={() => handleTabChange('live')} className={`flex items-center gap-2 px-5 py-3.5 border rounded-2xl font-bold text-xs md:text-sm transition-all ${dashboardTab === 'live' ? 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.35)]' : 'bg-slate-800/50 border-slate-700 hover:bg-red-950/30 text-slate-300'}`}>
            <Video size={16} className={dashboardTab === 'live' ? 'animate-pulse' : ''} /> Live Classes
          </button>

          <button onClick={() => handleTabChange('recordings')} className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-xs md:text-sm border transition-all ${dashboardTab === 'recordings' ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.35)]' : 'bg-slate-800/50 border-slate-700 hover:bg-amber-950/20 text-slate-300'}`}>
            <BookOpen size={16} /> Recordings
          </button>

          <button onClick={() => handleTabChange('tutes')} className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-xs md:text-sm border transition-all ${dashboardTab === 'tutes' ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]' : 'bg-slate-800/50 border-slate-700 hover:bg-blue-950/20 text-slate-300'}`}>
            <Download size={16} /> Tutes & Papers
          </button>

          <button onClick={() => handleTabChange('exams')} className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-xs md:text-sm border transition-all ${dashboardTab === 'exams' ? 'bg-emerald-600 border-emerald-500 text-white shadow-[0_0_20px_rgba(5,150,105,0.35)]' : 'bg-slate-800/50 border-slate-700 hover:bg-emerald-950/20 text-slate-300'}`}>
            <FileText size={16} /> Online Exams
          </button>

          <button onClick={() => handleTabChange('calendar')} className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-xs md:text-sm border transition-all ${dashboardTab === 'calendar' ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.35)]' : 'bg-slate-800/50 border-slate-700 hover:bg-purple-950/20 text-slate-300'}`}>
            <CalendarDays size={16} /> පන්ති කාලසටහන
          </button>

          <button onClick={() => handleTabChange('history')} className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-xs md:text-sm border transition-all ${dashboardTab === 'history' ? 'bg-cyan-600 border-cyan-500 text-white shadow-[0_0_20px_rgba(8,145,178,0.35)]' : 'bg-slate-800/50 border-slate-700 hover:bg-cyan-950/20 text-slate-300'}`}>
            <History size={16} /> Payment History
          </button>
        </div>
      </div>

      {/* Payment Reminders */}
      {allReminders.length > 0 && (
        <div className="mb-8 space-y-4">
          {allReminders.map((reminder, index) => (
            <div key={index} className="p-5 bg-gradient-to-r from-amber-950/50 to-slate-900 border-l-4 border-l-amber-500 border border-slate-800/60 rounded-r-2xl shadow-lg flex items-start gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertTriangle className="text-amber-500 shrink-0" size={22} />
              <div>
                <h3 className="font-bold text-amber-400 text-sm md:text-base">{reminder.title}</h3>
                <p className="text-xs md:text-sm text-slate-300 mt-1 font-medium">{reminder.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Interactive View Content */}
      <div ref={mainContentRef} className="scroll-mt-6">
        <main className="bg-slate-900/40 p-4 md:p-8 rounded-3xl border border-slate-800/50 min-h-[520px]">
          
          {dashboardTab === 'live' && (
            <SafeComponent>
              <LiveClassPlayer currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />
            </SafeComponent>
          )}
          
          {dashboardTab === 'recordings' && (
            <SafeComponent>
              <RecordingsManager currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />
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
          
          {dashboardTab === 'history' && (
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
               <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white border-b border-slate-800 pb-3">
                 <History className="text-cyan-400" /> Payment History (ගෙවීම් ඉතිහාසය)
               </h3>
               {Object.keys(paymentHistory).length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {Object.entries(paymentHistory).map(([className, months]) => (
                     <div key={className} className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/70 hover:border-slate-600 transition-all">
                       <p className="font-bold text-slate-200 mb-3 flex items-center gap-2">
                         <Book size={16} className="text-cyan-400" /> {className}
                       </p>
                       <div className="flex flex-wrap gap-2">
                         {months.sort().map((m, idx) => (
                           <span key={idx} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20 shadow-sm">
                             {m}
                           </span>
                         ))}
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="text-center py-12">
                   <p className="text-slate-500 text-sm font-medium">මෙතෙක් කිසිදු ගෙවීම් වාර්තාවක් පද්ධතිය තුළ හමු නොවීය.</p>
                 </div>
               )}
            </div>
          )}
        </main>
      </div>

    </div>
  );
};

export default StudentDashboard;