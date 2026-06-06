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
  studentAlerts?: any[];
  supabase?: any;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ 
  currentStudent, 
  handleStudentLogout, 
  dashboardTab, 
  setDashboardTab,
  studentAlerts = [], 
  supabase 
}) => {
  const [dbReminders, setDbReminders] = useState<any[]>([]);
  const [isPaidCurrentMonth, setIsPaidCurrentMonth] = useState<boolean>(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [liveStudentData, setLiveStudentData] = useState<any>(currentStudent);
  const [classPaymentStatuses, setClassPaymentStatuses] = useState<{name: string, status: 'Paid' | 'Free' | 'Unpaid'}[]>([]);
  
  // අලුත් States
  const [paymentHistory, setPaymentHistory] = useState<Record<string, string[]>>({});
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);

  const remindersSectionRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // ලංකාවේ වේලාවට අනුව වත්මන් මාසය ලබා ගැනීම
  const getSLCurrentMonthKey = () => {
    const slDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
    return `${slDate.getFullYear()}-${String(slDate.getMonth() + 1).padStart(2, '0')}`;
  };

  const currentMonthKey = getSLCurrentMonthKey();

  useEffect(() => {
    fetchDashboardData();

    // සජීවීව දත්ත ලබා ගැනීම (Supabase Realtime)
    if (supabase) {
      const channel = supabase.channel('student_dashboard_live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
          fetchDashboardData(); // පේමන්ට් අප්ඩේට් වූ සැනින් රිෆ්‍රෙශ් කරන්න
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `username=eq.${currentStudent.username}` }, () => {
          fetchDashboardData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calender_events' }, () => {
          fetchDashboardData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentStudent.username]);

  const fetchDashboardData = async () => {
    setIsRefreshing(true);
    
    if (supabase) {
      try {
        // 1. සිසු දත්ත
        const { data: freshStudentData } = await supabase
          .from('students')
          .select('*')
          .eq('username', currentStudent.username)
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

        // 2. Payments දත්ත
        const { data: paymentData } = await supabase
          .from('payments')
          .select('*')
          .eq('username', studentToUse.username);

        let statuses: {name: string, status: 'Paid' | 'Free' | 'Unpaid'}[] = [];
        let extractedReminders: any[] = [];
        let pHistory: Record<string, string[]> = {};

        if (paymentData && paymentData.length > 0) {
          // Reminders ගැනීම
          extractedReminders = paymentData
            .filter((p: any) => p.reminder_massage && p.reminder_massage.trim() !== '')
            .map((p: any) => ({
              title: `Payment Reminder`,
              message: p.reminder_massage
            }));

          // History එක හැදීම
          paymentData.forEach((p: any) => {
            if (p.status?.toLowerCase() === 'paid' || p.status?.toLowerCase() === 'free') {
              const className = p.class_name || p.class_type || 'General';
              if (!pHistory[className]) pHistory[className] = [];
              const monthStr = p.month || p.target_month;
              if (monthStr && !pHistory[className].includes(monthStr)) {
                pHistory[className].push(monthStr);
              }
            }
          });

          // වත්මන් මාසයේ Status බැලීම
          const currentMonthPayments = paymentData.filter((p: any) => p.month === currentMonthKey || p.target_month === currentMonthKey);

          if (isFreeStudent) {
            statuses = enrolledClasses.map((cls) => ({ name: cls, status: 'Free' }));
            setIsPaidCurrentMonth(true);
          } else {
            statuses = enrolledClasses.map((cls) => {
              const paymentRecord = currentMonthPayments.find((p: any) => p.class_name === cls || p.class_type === cls);
              let statusValue: 'Paid' | 'Free' | 'Unpaid' = 'Unpaid';
              if (paymentRecord) {
                if (paymentRecord.status?.toLowerCase() === 'paid') statusValue = 'Paid';
                else if (paymentRecord.status?.toLowerCase() === 'free') statusValue = 'Free';
              }
              return { name: cls, status: statusValue };
            });

            // එක පන්තියකට හෝ මුදල් ගෙවා ඇත්දැයි බැලීම
            const hasAnyAccess = statuses.some(s => s.status === 'Paid' || s.status === 'Free');
            setIsPaidCurrentMonth(enrolledClasses.length === 0 ? true : hasAnyAccess);
          }
        } else {
          statuses = enrolledClasses.map(cls => ({ name: cls, status: isFreeStudent ? 'Free' : 'Unpaid' }));
          setIsPaidCurrentMonth(isFreeStudent);
        }
        
        setClassPaymentStatuses(statuses);
        setPaymentHistory(pHistory);

        // 3. Announcements
        const { data: announcementData } = await supabase
          .from('announcements')
          .select('*')
          .or(`target_user.eq.${studentToUse.username},target_user.eq.all`);

        if (announcementData) {
          const generalAlerts = announcementData.map((a: any) => ({
            title: a.title || 'විශේෂ නිවේදනයයි',
            message: a.content
          }));
          extractedReminders = [...extractedReminders, ...generalAlerts];
        }
        setDbReminders(extractedReminders);

        // 4. Calendar Events (වත්මන් මාසයට අදාල)
        const { data: eventsData } = await supabase
          .from('calender_events')
          .select('*')
          .like('date', `${currentMonthKey}%`); // 2026-06 වලින් පටන් ගන්නා දින
        
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

  // නම්වල මුල් අකුර Capital කිරීම
  const capitalize = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
  const fName = capitalize(liveStudentData?.first_name || liveStudentData?.name || '');
  const lName = capitalize(liveStudentData?.last_name || '');
  const studentDisplayName = fName || lName ? `${fName} ${lName}`.trim() : liveStudentData?.username;

  const allReminders = [...dbReminders, ...studentAlerts];

  // Calendar Render Logic
  const renderCalendar = () => {
    const slDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
    const year = slDate.getFullYear();
    const month = slDate.getMonth();
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    return (
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><CalendarDays className="text-blue-400" /> පන්ති කාලසටහන ({currentMonthKey})</h3>
        <div className="grid grid-cols-7 gap-2 text-center text-sm font-bold text-slate-400 mb-2">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            if (day === null) return <div key={`empty-${index}`} className="p-4"></div>;
            
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = calendarEvents.filter(e => e.date === dateStr);
            const isToday = day === slDate.getDate();

            return (
              <div key={index} className={`min-h-[80px] p-2 rounded-xl border flex flex-col items-center ${isToday ? 'bg-blue-900/40 border-blue-500' : 'bg-slate-800/50 border-slate-700'}`}>
                <span className={`text-sm font-bold ${isToday ? 'text-blue-400' : 'text-slate-300'}`}>{day}</span>
                <div className="mt-1 space-y-1 w-full">
                  {dayEvents.map((ev, i) => (
                     <div key={i} className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 truncate w-full text-center" title={ev.title}>
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
      
      {/* --- PROFILE MODAL --- */}
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

      {/* --- DASHBOARD HEADER --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8 items-center bg-gradient-to-br from-slate-900/80 to-slate-900/40 backdrop-blur-xl p-6 rounded-3xl border border-slate-800 shadow-2xl relative z-10">
        
        {/* Profile Avatar */}
        <div className="lg:col-span-3 flex flex-col items-center relative">
          
          <div onClick={() => setIsProfileOpen(true)} className="cursor-pointer group relative mt-2">
            <div className={`w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center font-black text-4xl transition-all duration-500 ${
              isPaidCurrentMonth 
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 border-4 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] group-hover:scale-105' 
                : 'bg-gradient-to-br from-red-800 to-slate-900 border-2 border-red-600 shadow-[0_0_30px_rgba(220,38,38,0.6)] animate-pulse'
            }`}>
              <span className="text-white drop-shadow-md">{studentDisplayName.slice(0, 1).toUpperCase()}</span>
            </div>
            <div className="absolute -bottom-2 -right-2 bg-slate-800 rounded-full p-2 border border-slate-700 text-slate-300 group-hover:text-white transition-colors">
              <User size={18} />
            </div>
          </div>

          <h2 className="mt-5 font-bold text-xl text-center text-white tracking-wide">{studentDisplayName}</h2>
          
          {/* Class Badges */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-3 w-full">
            {classPaymentStatuses.length > 0 ? classPaymentStatuses.map((cls, idx) => (
              <span key={idx} className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border shadow-sm ${
                cls.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                cls.status === 'Free' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                'bg-red-500/10 text-red-400 border-red-500/40 animate-pulse'
              }`}>
                {cls.status === 'Paid' || cls.status === 'Free' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                {cls.name} ({cls.status})
              </span>
            )) : (
              <span className="text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">No Classes</span>
            )}
          </div>
        </div>

        {/* Action Tabs */}
        <div className="lg:col-span-9 flex flex-wrap gap-3 justify-center lg:justify-start lg:pl-8 mt-6 lg:mt-0">
          <button 
            onClick={fetchDashboardData} 
            className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800/80 border border-slate-700 hover:bg-slate-700 text-slate-300 transition-all ${isRefreshing ? 'animate-spin text-blue-400 border-blue-500/50' : ''}`}
          >
             <RefreshCw size={18} />
          </button>
          
          <button onClick={() => handleTabChange('live')} className={`flex items-center gap-2 px-5 py-3 border rounded-2xl font-bold text-sm transition-all ${dashboardTab === 'live' ? 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]' : 'bg-slate-800/50 border-slate-700 hover:bg-red-950/40 text-slate-300'}`}>
            <Video size={18} className={dashboardTab === 'live' ? 'animate-pulse' : ''} /> Live Classes
          </button>

          <button onClick={() => handleTabChange('recordings')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all ${dashboardTab === 'recordings' ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-slate-800/50 border-slate-700 hover:bg-amber-950/40 text-slate-300'}`}>
            <BookOpen size={18} /> Recordings
          </button>

          <button onClick={() => handleTabChange('tutes')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all ${dashboardTab === 'tutes' ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'bg-slate-800/50 border-slate-700 hover:bg-blue-950/40 text-slate-300'}`}>
            <Download size={18} /> Tutes & Papers
          </button>

          <button onClick={() => handleTabChange('exams')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all ${dashboardTab === 'exams' ? 'bg-emerald-600 border-emerald-500 text-white shadow-[0_0_20px_rgba(5,150,105,0.3)]' : 'bg-slate-800/50 border-slate-700 hover:bg-emerald-950/40 text-slate-300'}`}>
            <FileText size={18} /> Online Exams
          </button>
        </div>
      </div>

      {/* --- PAYMENT REMINDERS --- */}
      {allReminders.length > 0 && (
        <div className="mb-10 space-y-4">
          {allReminders.map((reminder, index) => (
            <div key={index} className="p-5 bg-gradient-to-r from-amber-950/80 to-slate-900 border-l-4 border-l-amber-500 border border-slate-800 rounded-r-2xl shadow-lg flex items-start gap-4">
              <AlertTriangle className="text-amber-500 shrink-0" size={24} />
              <div>
                <h3 className="font-bold text-amber-400 text-base">{reminder.title}</h3>
                <p className="text-sm text-slate-200 mt-1.5 font-medium">{reminder.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- MAIN CONTENT & SCROLL TARGET --- */}
      <div ref={mainContentRef} className="scroll-mt-8">
        
        {/* Calendar and History Cards (Always visible or in a specific tab, here shown above main content) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          
          {/* Calendar View */}
          {renderCalendar()}

          {/* Payment History View */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl">
             <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><History className="text-amber-400" /> Payment History (ගෙවීම් ඉතිහාසය)</h3>
             {Object.keys(paymentHistory).length > 0 ? (
               <div className="space-y-4">
                 {Object.entries(paymentHistory).map(([className, months]) => (
                   <div key={className} className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                     <p className="font-bold text-slate-200 mb-2">{className}</p>
                     <div className="flex flex-wrap gap-2">
                       {months.sort().map((m, idx) => (
                         <span key={idx} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-md border border-emerald-500/30">
                           {m}
                         </span>
                       ))}
                     </div>
                   </div>
                 ))}
               </div>
             ) : (
               <p className="text-slate-500 text-sm">මෙතෙක් කිසිදු ගෙවීමක් සිදු කර නොමැත.</p>
             )}
          </div>

        </div>

        {/* Dynamic Component Rendering */}
        <main className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800/50 min-h-[500px]">
          {dashboardTab === 'live' && <LiveClassPlayer currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />}
          {dashboardTab === 'recordings' && <RecordingsManager currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />}
          {dashboardTab === 'tutes' && <TutsPapersManager currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />}
          {dashboardTab === 'exams' && <OnlineExamsHistory currentStudent={liveStudentData} />}
        </main>
      </div>

    </div>
  );
};

export default StudentDashboard;