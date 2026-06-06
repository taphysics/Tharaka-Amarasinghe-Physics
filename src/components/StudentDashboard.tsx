import React, { useEffect, useState, useRef } from 'react';
import { Bell, AlertTriangle, Video, BookOpen, Download, LogOut, FileText, X, User, Phone, MapPin, Book, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

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
        // 1. Students ටේබල් එකෙන් අලුත්ම දත්ත ගැනීම (Database Schema එකට අනුව)
        const { data: freshStudentData, error: studentErr } = await supabase
          .from('students')
          .select('*')
          .eq('username', currentStudent.username)
          .single();

        const studentToUse = freshStudentData || currentStudent;
        setLiveStudentData(studentToUse);

        // class_types (text[]) array එකක් ලෙස ගැනීම
        let enrolledClasses: string[] = [];
        if (studentToUse.class_types) {
          if (Array.isArray(studentToUse.class_types)) {
            enrolledClasses = studentToUse.class_types;
          } else if (typeof studentToUse.class_types === 'string') {
            try { enrolledClasses = JSON.parse(studentToUse.class_types); } 
            catch(e) { enrolledClasses = [studentToUse.class_types]; }
          }
        }

        const isFree = studentToUse.is_paid === false || studentToUse.free_months?.includes(currentMonthKey);

        // 2. Payments ටේබල් එකෙන් දත්ත ගැනීම (student_username වෙනුවට username භාවිතය)
        const { data: paymentData, error: paymentErr } = await supabase
          .from('payments')
          .select('*')
          .eq('username', studentToUse.username);

        let statuses: {name: string, status: 'Paid' | 'Free' | 'Unpaid'}[] = [];
        let extractedReminders: any[] = [];

        if (paymentData && paymentData.length > 0) {
          // පේමන්ට් රිමයින්ඩර්ස් වෙන්කර ගැනීම (July වැනි අනාගත මාස වල ඒවාත් පෙන්වීමට)
          extractedReminders = paymentData
            .filter((p: any) => p.reminder_massage && p.reminder_massage.trim() !== '')
            .map((p: any) => ({
              title: `Payment Reminder - ${p.month || p.target_month || ''}`,
              message: p.reminder_massage
            }));

          // වත්මන් මාසයට අදාල ගෙවීම් පරීක්ෂා කිරීම
          const currentMonthPayments = paymentData.filter((p: any) => p.month === currentMonthKey || p.target_month === currentMonthKey);

          if (isFree) {
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

            const hasAnyAccess = statuses.some(s => s.status !== 'Unpaid') || enrolledClasses.length === 0;
            setIsPaidCurrentMonth(hasAnyAccess);
          }
        } else {
          // ගෙවීම් වාර්තා කිසිවක් නැති විට
          statuses = enrolledClasses.map(cls => ({ name: cls, status: isFree ? 'Free' : 'Unpaid' }));
          setIsPaidCurrentMonth(isFree);
        }
        
        setClassPaymentStatuses(statuses);

        // 3. Announcements ටේබල් එකෙන් අමතර නිවේදන ඇත්නම් ගැනීම
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

      } catch (error) {
        console.error("Dashboard Data Fetch Error:", error);
      }
    }
    setIsRefreshing(false);
  };

  const scrollToSection = (elementRef: React.RefObject<HTMLDivElement | null>) => {
    elementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const allReminders = [...dbReminders, ...studentAlerts];
  const studentDisplayName = liveStudentData.name || liveStudentData.first_name || liveStudentData.username;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans selection:bg-blue-500/30">
      
      {/* --- STUDENT PROFILE FULL DETAILS MODAL --- */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-gradient-to-r from-blue-900 to-slate-900 p-6 flex justify-between items-start border-b border-slate-800">
              <div>
                <h3 className="font-bold text-2xl text-white">{studentDisplayName} {liveStudentData.last_name || ''}</h3>
                <p className="text-blue-300 text-sm font-mono mt-1">ID: {liveStudentData.username}</p>
                {liveStudentData.nic && <p className="text-slate-400 text-xs mt-1">NIC: {liveStudentData.nic}</p>}
              </div>
              <button onClick={() => setIsProfileOpen(false)} className="p-2 bg-slate-800/50 rounded-full hover:bg-slate-700 text-slate-300 hover:text-white transition">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
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

              <div className="flex items-center gap-3 text-slate-300 border-b border-slate-800/50 pb-4">
                <Book size={18} className="text-amber-400" />
                <div className="w-full">
                  <p className="text-[11px] text-slate-500 uppercase font-bold mb-1.5">Enrolled Classes</p>
                  <div className="flex flex-wrap gap-2">
                    {classPaymentStatuses.length > 0 ? classPaymentStatuses.map((cls, idx) => (
                      <span key={idx} className={`px-2 py-1 text-xs font-medium rounded-md border ${
                        cls.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        cls.status === 'Free' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                        'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}>
                        {cls.name}
                      </span>
                    )) : (
                      <span className="text-sm text-slate-500">No classes selected</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-slate-950 flex justify-end">
               <button onClick={handleStudentLogout} className="flex items-center gap-2 px-4 py-2.5 bg-red-950/40 text-red-400 hover:bg-red-600 hover:text-white rounded-xl transition-all font-medium">
                <LogOut size={16} /> Logout from System
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- DASHBOARD HEADER (Beautiful Glassmorphism) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8 items-center bg-gradient-to-br from-slate-900/80 to-slate-900/40 backdrop-blur-xl p-6 rounded-3xl border border-slate-800 shadow-2xl relative z-10">
        
        {/* Profile Avatar & Quick Info */}
        <div className="lg:col-span-3 flex flex-col items-center relative">
          
          {allReminders.length > 0 && (
            <button 
              onClick={() => scrollToSection(remindersSectionRef)}
              className="absolute -top-3 left-1/2 -translate-x-16 z-40 p-3 rounded-full bg-slate-900 border-2 border-amber-500 text-amber-500 animate-bounce shadow-[0_0_15px_rgba(245,158,11,0.5)] hover:bg-slate-800 cursor-pointer transition-all"
            >
              <Bell size={22} className="fill-amber-500/20" />
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black border border-slate-900">
                {allReminders.length}
              </span>
            </button>
          )}

          <div onClick={() => setIsProfileOpen(true)} className="cursor-pointer group relative mt-2">
            <div className={`w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center font-black text-4xl shadow-xl transition-all duration-500 ${
              !isPaidCurrentMonth 
                ? 'bg-gradient-to-br from-red-900 to-slate-900 border-2 border-red-600 shadow-red-900/50' 
                : 'bg-gradient-to-br from-blue-600 to-indigo-800 border-2 border-blue-400/50 group-hover:scale-105 group-hover:shadow-blue-500/40'
            }`}>
              {studentDisplayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="absolute -bottom-2 -right-2 bg-slate-800 rounded-full p-1.5 border border-slate-700 text-slate-400 group-hover:text-white transition-colors">
              <User size={16} />
            </div>
          </div>

          <h2 className="mt-4 font-bold text-xl text-center text-white tracking-wide">{studentDisplayName}</h2>
          
          {/* Class Badges Display under profile */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-3 w-full">
            {classPaymentStatuses.length > 0 ? classPaymentStatuses.map((cls, idx) => (
              <span key={idx} className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border shadow-sm ${
                cls.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                cls.status === 'Free' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                'bg-red-500/10 text-red-400 border-red-500/40 animate-pulse'
              }`}>
                {cls.status === 'Paid' || cls.status === 'Free' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                {cls.name}
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
            title="Refresh Data"
          >
             <RefreshCw size={18} />
          </button>
          
          <button onClick={() => { setDashboardTab('live'); scrollToSection(liveClassSectionRef); }} className={`flex items-center gap-2 px-5 py-3 border rounded-2xl font-bold text-sm transition-all ${dashboardTab === 'live' ? 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]' : 'bg-slate-800/50 border-slate-700 hover:bg-red-950/40 text-slate-300'}`}>
            <Video size={18} className={dashboardTab === 'live' ? 'animate-pulse' : ''} /> Live Classes
          </button>

          <button onClick={() => setDashboardTab('recordings')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all ${dashboardTab === 'recordings' ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-slate-800/50 border-slate-700 hover:bg-amber-950/40 text-slate-300'}`}>
            <BookOpen size={18} /> Recordings
          </button>

          <button onClick={() => setDashboardTab('tutes')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all ${dashboardTab === 'tutes' ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'bg-slate-800/50 border-slate-700 hover:bg-blue-950/40 text-slate-300'}`}>
            <Download size={18} /> Tutes & Papers
          </button>

          <button onClick={() => setDashboardTab('exams')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all ${dashboardTab === 'exams' ? 'bg-emerald-600 border-emerald-500 text-white shadow-[0_0_20px_rgba(5,150,105,0.3)]' : 'bg-slate-800/50 border-slate-700 hover:bg-emerald-950/40 text-slate-300'}`}>
            <FileText size={18} /> Online Exams
          </button>
        </div>
      </div>

      {/* --- PAYMENT REMINDERS SECTION --- */}
      <div ref={remindersSectionRef} className="scroll-mt-24">
        {allReminders.length > 0 && (
          <div className="mb-10 space-y-4">
            <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" /> Notifications & Reminders
            </h3>
            {allReminders.map((reminder, index) => (
              <div key={index} className="p-5 bg-gradient-to-r from-amber-950/80 to-slate-900 border-l-4 border-l-amber-500 border border-slate-800 rounded-r-2xl shadow-lg flex items-start gap-4 animate-in slide-in-from-left duration-500">
                <div className="p-2 bg-amber-500/10 rounded-full shrink-0">
                  <AlertTriangle className="text-amber-500" size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-amber-400 text-base">
                    {reminder.title || 'පේමන්ට් රිමයින්ඩරය (Payment Reminder)'}
                  </h3>
                  <p className="text-sm text-slate-200 mt-1.5 leading-relaxed font-medium">
                    {reminder.message || reminder}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="space-y-8 bg-slate-900/30 p-6 rounded-3xl border border-slate-800/50 min-h-[500px]">
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