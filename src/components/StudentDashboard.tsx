import React, { useEffect, useState, useRef } from 'react';
import { Bell, AlertTriangle, Video, BookOpen, Download, LogOut, FileText, X, User, Phone, MapPin, School, Book, RefreshCw } from 'lucide-react';

import LiveClassPlayer from './LiveClassPlayer';
import RecordingsManager from './RecordingsManager';
import TutsPapersManager from './TutsPapersManager';
import OnlineExamsHistory from './OnlineExamsHistory';

type TabType = "live" | "recordings" | "tutes" | "exams";

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

  const remindersSectionRef = useRef<HTMLDivElement>(null);
  const liveClassSectionRef = useRef<HTMLDivElement>(null);

  // වත්මන් මාසය ලබා ගැනීම (උදා: 2026-06)
  const slDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
  const currentMonthKey = `${slDate.getFullYear()}-${String(slDate.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    fetchDashboardData();
  }, [currentStudent.username]);

  const fetchDashboardData = async () => {
    setIsRefreshing(true);
    
    if (supabase) {
      try {
        // 1. Supabase එකෙන් අලුත්ම සිසු දත්ත ලබාගැනීම (Cache මඟ හැරීම)
        const { data: freshStudentData, error: studentErr } = await supabase
          .from('students')
          .select('*')
          .eq('username', currentStudent.username)
          .single();

        const studentToUse = freshStudentData || currentStudent;
        setLiveStudentData(studentToUse);

        // පන්ති වර්ග (class_types) Array එකක් බවට පත් කිරීම
        let enrolledClasses: string[] = [];
        if (studentToUse.class_types) {
          if (typeof studentToUse.class_types === 'string') {
            try { enrolledClasses = JSON.parse(studentToUse.class_types); } 
            catch(e) { enrolledClasses = [studentToUse.class_types]; }
          } else if (Array.isArray(studentToUse.class_types)) {
            enrolledClasses = studentToUse.class_types;
          }
        }
        
        console.log("Enrolled Classes:", enrolledClasses);

        const isFree = studentToUse.is_free_student === true || studentToUse.is_free_student === 'true';

        // 2. Payment දත්ත ලබා ගැනීම
        const { data: paymentData, error: paymentErr } = await supabase
          .from('payments')
          .select('*')
          .eq('student_username', studentToUse.username)
          .eq('month', currentMonthKey);
          
        console.log("Payments for", currentMonthKey, ":", paymentData);

        let statuses: {name: string, status: 'Paid' | 'Free' | 'Unpaid'}[] = [];

        if (isFree) {
          statuses = enrolledClasses.map((cls) => ({ name: cls, status: 'Free' }));
          setIsPaidCurrentMonth(true);
        } else {
          statuses = enrolledClasses.map((cls) => {
            // මේ පන්තියට ගෙවලා තියෙනවද බලනවා (Paid හෝ Free ලෙස සටහන් වී ඇත්දැයි)
            const paymentRecord = paymentData?.find((p: any) => p.class_name === cls || !p.class_name);
            
            let statusValue: 'Paid' | 'Free' | 'Unpaid' = 'Unpaid';
            if (paymentRecord) {
              if (paymentRecord.status === 'Paid') statusValue = 'Paid';
              else if (paymentRecord.status === 'Free') statusValue = 'Free';
            }
            
            return { name: cls, status: statusValue };
          });

          // අඩුම තරමේ එක පන්තියකට හෝ Access ඇත්නම් හෝ පන්ති තෝරාගෙන නැත්නම්
          const hasAnyAccess = statuses.some(s => s.status !== 'Unpaid') || enrolledClasses.length === 0;
          setIsPaidCurrentMonth(hasAnyAccess);
        }
        
        setClassPaymentStatuses(statuses);

        // 3. Reminders ලබා ගැනීම
        const { data: reminderData, error: reminderErr } = await supabase
          .from('student_reminders')
          .select('*')
          .eq('student_username', studentToUse.username);
          
        console.log("Reminders fetched:", reminderData);

        if (reminderData) {
          // is_read false ඒවා විතරක් පෙරා ගැනීම (database එකේ ඒ column එක නැත්නම් ඔක්කොම පෙන්නයි)
          const activeReminders = reminderData.filter((r: any) => r.is_read !== true);
          setDbReminders(activeReminders);
        }

      } catch (error) {
        console.error("Error fetching live dashboard data:", error);
      }
    }
    
    setIsRefreshing(false);
  };

  const scrollToSection = (elementRef: React.RefObject<HTMLDivElement | null>) => {
    elementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Props වලින් එන Alerts සහ DB එකෙන් එන Alerts එකතු කිරීම
  const allReminders = [...dbReminders, ...studentAlerts];

  // Display Name එක හදාගැනීම
  const studentName = liveStudentData.full_name || liveStudentData.name || liveStudentData.firstName || "Student";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans">
      
      {/* --- STUDENT PROFILE FULL DETAILS MODAL --- */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-gradient-to-r from-blue-900 to-slate-900 p-6 flex justify-between items-start border-b border-slate-800">
              <div>
                <h3 className="font-bold text-2xl text-white">{studentName}</h3>
                <p className="text-blue-300 text-sm font-mono mt-1">Username: {liveStudentData.username}</p>
                {liveStudentData.nic && <p className="text-slate-400 text-xs mt-1">NIC: {liveStudentData.nic}</p>}
              </div>
              <button onClick={() => setIsProfileOpen(false)} className="p-2 bg-slate-800/50 rounded-full hover:bg-slate-700 text-slate-300 hover:text-white transition">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-slate-300 border-b border-slate-800/50 pb-3">
                <Phone size={18} className="text-emerald-400" />
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase font-bold">WhatsApp</p>
                    <p className="font-medium text-sm">{liveStudentData.whatsapp_number || liveStudentData.whatsapp || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase font-bold">Mobile</p>
                    <p className="font-medium text-sm">{liveStudentData.phone_number || liveStudentData.phone || liveStudentData.mobile || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-300 border-b border-slate-800/50 pb-3">
                <MapPin size={18} className="text-rose-400" />
                <div>
                  <p className="text-[11px] text-slate-500 uppercase font-bold">District</p>
                  <p className="font-medium text-sm">{liveStudentData.district || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-300 border-b border-slate-800/50 pb-3">
                <School size={18} className="text-blue-400" />
                <div>
                  <p className="text-[11px] text-slate-500 uppercase font-bold">School</p>
                  <p className="font-medium text-sm">{liveStudentData.school || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-300 border-b border-slate-800/50 pb-3">
                <Book size={18} className="text-amber-400" />
                <div>
                  <p className="text-[11px] text-slate-500 uppercase font-bold">Selected Classes</p>
                  <p className="font-medium text-sm text-amber-300">
                    {classPaymentStatuses.length > 0 ? classPaymentStatuses.map(c => c.name).join(' • ') : 'No Classes Selected'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-slate-950 flex justify-end gap-3">
               <button onClick={handleStudentLogout} className="flex items-center gap-2 px-4 py-2 bg-red-950/40 text-red-400 hover:bg-red-900 hover:text-white rounded-xl transition">
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- DASHBOARD HEADER --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8 items-center bg-slate-900/60 p-6 rounded-3xl border border-slate-800 relative z-10">
        
        {/* Profile Section */}
        <div className="lg:col-span-3 flex flex-col items-center relative">
          
          {/* Notification Bell */}
          {allReminders.length > 0 && (
            <button 
              onClick={() => scrollToSection(remindersSectionRef)}
              className="absolute -top-2 left-1/2 -translate-x-16 z-40 p-3 rounded-full bg-slate-900 border-2 border-red-500 text-red-500 animate-bounce shadow-[0_0_15px_rgba(239,68,68,0.5)] hover:bg-slate-800 transition-all cursor-pointer"
            >
              <Bell size={24} className="fill-red-500/20" />
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-black border-2 border-slate-900">
                {allReminders.length}
              </span>
            </button>
          )}

          {/* Profile Avatar */}
          <div 
            onClick={() => setIsProfileOpen(true)}
            className="cursor-pointer group relative mt-2"
          >
            <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center font-black text-4xl shadow-2xl transition-all duration-500 ${
              !isPaidCurrentMonth 
                ? 'bg-gradient-to-br from-red-900 to-slate-900 border-4 border-red-600 shadow-[0_0_30px_rgba(220,38,38,0.6)] animate-pulse' 
                : 'bg-gradient-to-br from-blue-600 to-indigo-600 border-2 border-blue-400/50 group-hover:scale-105 group-hover:shadow-blue-500/50'
            }`}>
              {studentName.slice(0, 1).toUpperCase()}
            </div>
          </div>

          <h2 className="mt-4 font-bold text-xl text-center">{studentName}</h2>
          
          {/* Class Payment Status Badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-3 w-full">
            {classPaymentStatuses.length > 0 ? classPaymentStatuses.map((cls, idx) => (
              <span key={idx} className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border shadow-sm ${
                cls.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                cls.status === 'Free' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                'bg-red-500/10 text-red-400 border-red-500/40 shadow-red-900/20 animate-pulse'
              }`}>
                {cls.name}: {cls.status}
              </span>
            )) : (
              <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">No classes selected</span>
            )}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="lg:col-span-9 flex flex-wrap gap-3 justify-center lg:justify-start lg:pl-6 mt-6 lg:mt-0">
          <button 
            onClick={fetchDashboardData} 
            className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800/50 border border-slate-700 hover:bg-slate-700 text-slate-300 transition ${isRefreshing ? 'animate-spin text-blue-400' : ''}`}
            title="Refresh Dashboard"
          >
             <RefreshCw size={18} />
          </button>
          
          <button 
            onClick={() => { setDashboardTab('live'); scrollToSection(liveClassSectionRef); }}
            className={`flex items-center gap-2 px-6 py-3 border-2 rounded-2xl font-bold text-sm transition-all shadow-lg ${dashboardTab === 'live' ? 'bg-red-600 border-red-500 shadow-red-500/20' : 'bg-slate-800 border-slate-700 hover:bg-red-900/30 hover:border-red-500/50'}`}
          >
            <Video size={18} className={dashboardTab === 'live' ? 'animate-pulse' : ''} /> Live Classes
          </button>

          <button onClick={() => setDashboardTab('recordings')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border-2 transition ${dashboardTab === 'recordings' ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-amber-500/20' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
            <BookOpen size={18} /> Recordings
          </button>

          <button onClick={() => setDashboardTab('tutes')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border-2 transition ${dashboardTab === 'tutes' ? 'bg-blue-500 border-blue-400 text-slate-950 shadow-blue-500/20' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
            <Download size={18} /> Tutes & Papers
          </button>

          <button onClick={() => setDashboardTab('exams')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border-2 transition ${dashboardTab === 'exams' ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-emerald-500/20' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
            <FileText size={18} /> Online Exams
          </button>
        </div>
      </div>

      {/* --- REMINDERS SECTION --- */}
      <div ref={remindersSectionRef} className="scroll-mt-24">
        {allReminders.length > 0 && (
          <div className="mb-8 space-y-3">
            {allReminders.map((reminder, index) => (
              <div key={index} className="p-5 bg-gradient-to-r from-red-950 to-slate-900 border-l-4 border-l-red-500 border-y border-r border-slate-800 rounded-r-2xl shadow-xl flex items-start gap-4 animate-in slide-in-from-left duration-500">
                <AlertTriangle className="text-red-500 shrink-0" size={24} />
                <div>
                  <h3 className="font-bold text-red-400 text-base">
                    {reminder.title || 'පේමන්ට් රිමයින්ඩරය (Payment Reminder)'}
                  </h3>
                  <p className="text-sm text-slate-200 mt-1 leading-relaxed font-sans font-medium">
                    {reminder.message || reminder.alertText || reminder.reminder_text || typeof reminder === 'string' ? reminder : 'කරුණාකර ඔබගේ ගෙවීම් පරීක්ෂා කරන්න.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="space-y-8">
        {dashboardTab === 'live' && (
          <div ref={liveClassSectionRef} className="scroll-mt-24">
            <LiveClassPlayer currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />
          </div>
        )}
        {dashboardTab === 'recordings' && <RecordingsManager currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />}
        {dashboardTab === 'tutes' && <TutsPapersManager currentStudent={liveStudentData} isPaid={isPaidCurrentMonth} />}
        {dashboardTab === 'exams' && <OnlineExamsHistory currentStudent={liveStudentData} />}
      </main>

    </div>
  );
};

export default StudentDashboard;