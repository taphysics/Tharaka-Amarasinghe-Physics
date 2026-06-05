import React, { useEffect, useState, useRef } from 'react';
import { Bell, AlertTriangle, Video, BookOpen, Download, LogOut, FileText } from 'lucide-react';

// මේවා අනිවාර්යයෙන්ම එකම ෆෝල්ඩරේ තියෙන්න ඕනේ
import LiveClassPlayer from './LiveClassPlayer';
import RecordingsManager from './RecordingsManager';
import TutsPapersManager from './TutsPapersManager';
import OnlineExamsHistory from './OnlineExamsHistory';

interface StudentDashboardProps {
  currentStudent: any;
  handleStudentLogout: () => void;
  dashboardTab: string;
  // මෙතන "tutes" ලෙස හදන්න
  setDashboardTab: React.Dispatch<React.SetStateAction<"live" | "recordings" | "tutes" | "exams">>; 
  showWelcomeBanner: boolean;
  closeWelcomeActiveBanner: () => void;
  studentAlerts: any[];
  siteConfig: any;
  calendarEvents: any[];
  announcements: any[];
  scheduledLives: any[];
  resourceLinks: any[];
  isCurrentMonthPaid: (activeMonths: any) => boolean;
  filterMonth: string;
  setFilterMonth: (month: string) => void;
  supabase: any;
}

const StudentDashboard: React.FC<StudentDashboardProps> = (props) => {
  const { 
    currentStudent, 
    handleStudentLogout, 
    dashboardTab, 
    setDashboardTab,
    supabase
  } = props;

  const [remindersCount, setRemindersCount] = useState<number>(0);
  const [reminderMessage, setReminderMessage] = useState<string>('');
  const [isPaidCurrentMonth, setIsPaidCurrentMonth] = useState<boolean>(false);
const [activeTab, setActiveTab] = useState<'live' | 'recordings' | 'tuts' | 'exams'>('live');

  const remindersSectionRef = useRef<HTMLDivElement>(null);
  const liveClassSectionRef = useRef<HTMLDivElement>(null);

  const slDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
  const currentMonthKey = `${slDate.getFullYear()}-${String(slDate.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    fetchPaymentAndReminders();
  }, [currentStudent]);

  const fetchPaymentAndReminders = async () => {
    const { data: paymentData } = await supabase
      .from('payments')
      .select('*')
      .eq('student_username', currentStudent.username)
      .eq('month', currentMonthKey)
      .eq('status', 'Paid');

    const hasAccess = (paymentData && paymentData.length > 0) || currentStudent.isFreeStudent;
    setIsPaidCurrentMonth(!!hasAccess);

    const { data: reminderData } = await supabase
      .from('student_reminders')
      .select('*')
      .eq('student_username', currentStudent.username)
      .eq('is_read', false);

    if (reminderData) {
      setRemindersCount(reminderData.length);
      if (reminderData.length > 0) {
        setReminderMessage(reminderData[0].message);
      }
    }
  };

  const scrollToSection = (elementRef: React.RefObject<HTMLDivElement | null>) => {
    elementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8 items-center bg-slate-900/60 p-6 rounded-3xl border border-slate-800">
        <div className="lg:col-span-3 flex flex-col items-center relative">
          {remindersCount > 0 && (
            <button 
              onClick={() => scrollToSection(remindersSectionRef)}
              className="absolute top-0 left-4 z-40 p-2.5 rounded-full bg-slate-950 border border-red-500/50 text-red-400 animate-[bounce_1s_infinite] shadow-lg hover:bg-slate-900"
            >
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black">
                {remindersCount}
              </span>
            </button>
          )}

          <div className="relative group">
            <div className={`w-24 h-24 rounded-3xl flex items-center justify-center font-black text-3xl shadow-2xl transition-all duration-500 ${
              !isPaidCurrentMonth 
                ? 'bg-gradient-to-tr from-red-700 to-rose-500 ring-4 ring-red-500 animate-[pulse_1.5s_infinite] shadow-red-900/50' 
                : 'bg-gradient-to-tr from-amber-600 to-yellow-500 ring-4 ring-amber-500/30'
            }`}>
              {currentStudent.firstName?.slice(0, 1).toUpperCase()}{currentStudent.lastName?.slice(0, 1).toUpperCase()}
            </div>
          </div>

          <h2 className="mt-4 font-bold text-xl">{currentStudent.name}</h2>
          <span className="text-xs text-slate-400 font-mono mt-1">ID: {currentStudent.username}</span>
        </div>

        <div className="lg:col-span-9 flex flex-wrap gap-4 justify-center lg:justify-start">
          <button 
            onClick={() => { setActiveTab('live'); scrollToSection(liveClassSectionRef); }}
            className="flex items-center gap-2 px-5 py-3 bg-red-600/10 hover:bg-red-600 border border-red-500/30 rounded-2xl font-bold text-sm transition-all shadow-lg"
          >
            <Video size={18} /> Join Live Lecture
          </button>
          <button onClick={() => setActiveTab('recordings')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition ${activeTab === 'recordings' ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-800 border-slate-700'}`}>
            <BookOpen size={18} /> Video Recordings
          </button>
          <button onClick={() => setActiveTab('tuts')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition ${activeTab === 'tuts' ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-800 border-slate-700'}`}>
            <Download size={18} /> Tuts & Papers Docs
          </button>
          <button onClick={() => setActiveTab('exams')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition ${activeTab === 'exams' ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-800 border-slate-700'}`}>
            <FileText size={18} /> Online Exam Sheet History
          </button>
          <button onClick={handleStudentLogout} className="flex items-center gap-2 px-5 py-3 bg-slate-950 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-slate-800 rounded-2xl font-bold text-sm transition">
            <LogOut size={18} /> Log out Account
          </button>
        </div>
      </div>

      <div ref={remindersSectionRef} className="scroll-mt-6">
        {remindersCount > 0 && (
          <div className="mb-8 p-5 bg-gradient-to-r from-red-950/50 to-slate-900 border border-red-500/40 rounded-2xl shadow-xl flex items-start gap-4">
            <AlertTriangle className="text-red-500 shrink-0 animate-bounce" size={24} />
            <div>
              <h3 className="font-bold text-red-400 text-base">පන්ති ගාස්තු ගෙවීම් පිළිබඳ විශේෂ දැනුම්දීමයි!</h3>
              <p className="text-sm text-slate-200 mt-1 leading-relaxed font-sans font-medium">{reminderMessage}</p>
            </div>
          </div>
        )}
      </div>

      <main className="space-y-8">
        {activeTab === 'live' && (
          <div ref={liveClassSectionRef} className="scroll-mt-6">
            <LiveClassPlayer currentStudent={currentStudent} isPaid={isPaidCurrentMonth} />
          </div>
        )}
        {activeTab === 'recordings' && <RecordingsManager currentStudent={currentStudent} isPaid={isPaidCurrentMonth} />}
        {activeTab === 'tuts' && <TutsPapersManager currentStudent={currentStudent} isPaid={isPaidCurrentMonth} />}
        {activeTab === 'exams' && <OnlineExamsHistory currentStudent={currentStudent} />}
      </main>
    </div>
  );
};

export default StudentDashboard;