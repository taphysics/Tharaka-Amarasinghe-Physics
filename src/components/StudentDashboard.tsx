import React, { useEffect, useState, useRef } from 'react';
import { Bell, AlertTriangle, Video, BookOpen, Download, LogOut, FileText, X, RefreshCw, User } from 'lucide-react';

import LiveClassPlayer from './LiveClassPlayer';
import RecordingsManager from './RecordingsManager';
import TutsPapersManager from './TutsPapersManager';
import OnlineExamsHistory from './OnlineExamsHistory';

type TabType = "live" | "recordings" | "tutes" | "exams";

const StudentDashboard: React.FC<any> = (props) => {
  const { currentStudent, handleStudentLogout, dashboardTab, setDashboardTab, supabase } = props;

  const [remindersCount, setRemindersCount] = useState<number>(0);
  const [reminderMessage, setReminderMessage] = useState<string>('');
  const [isPaidCurrentMonth, setIsPaidCurrentMonth] = useState<boolean>(false);
  
  // අලුතින් එකතු කළ States
  const [isProfileOpen, setIsProfileOpen] = useState(false); // Profile Modal එක සඳහා
  const [isRefreshing, setIsRefreshing] = useState(false); // Refresh වන බව පෙන්වීමට

  const remindersSectionRef = useRef<HTMLDivElement>(null);
  const liveClassSectionRef = useRef<HTMLDivElement>(null);

  const slDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
  const currentMonthKey = `${slDate.getFullYear()}-${String(slDate.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    fetchPaymentAndReminders();
  }, [currentStudent]);

  const fetchPaymentAndReminders = async () => {
    setIsRefreshing(true);
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
    setIsRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans">
      
      {/* PROFILE MODAL එක */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">Student Profile</h3>
              <button onClick={() => setIsProfileOpen(false)} className="text-slate-400 hover:text-white"><X /></button>
            </div>
            <div className="space-y-4">
              <p className="text-slate-400 text-sm">Name: <span className="text-white font-medium">{currentStudent.name}</span></p>
              <p className="text-slate-400 text-sm">Username: <span className="text-white font-medium">{currentStudent.username}</span></p>
              <p className="text-slate-400 text-sm">District: <span className="text-white font-medium">{currentStudent.district || 'N/A'}</span></p>
              <div className="pt-4 border-t border-slate-800">
                <button onClick={handleStudentLogout} className="w-full flex items-center justify-center gap-2 py-2 text-red-400 border border-red-900 rounded-xl hover:bg-red-950">
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8 items-center bg-slate-900/60 p-6 rounded-3xl border border-slate-800">
        <div className="lg:col-span-3 flex flex-col items-center cursor-pointer group" onClick={() => setIsProfileOpen(true)}>
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center font-black text-3xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl group-hover:scale-105 transition-transform">
             <User size={40}/>
          </div>
          <h2 className="mt-4 font-bold text-xl">{currentStudent.name}</h2>
          <p className="text-xs text-blue-400 font-medium">Click to view profile</p>
        </div>

        <div className="lg:col-span-9 flex flex-wrap gap-4 justify-center lg:justify-start">
          {/* REFRESH BUTTON එක */}
          <button onClick={fetchPaymentAndReminders} className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition ${isRefreshing ? 'animate-spin' : ''}`}>
             <RefreshCw size={18} />
          </button>
          
          <button onClick={() => setDashboardTab('live')} className={`flex items-center gap-2 px-5 py-3 border rounded-2xl font-bold text-sm ${dashboardTab === 'live' ? 'bg-red-600 border-red-500' : 'bg-red-600/10 border-red-500/30'}`}>
            <Video size={18} /> Live Class
          </button>
          <button onClick={() => setDashboardTab('recordings')} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border ${dashboardTab === 'recordings' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`}>
            <BookOpen size={18} /> Recordings
          </button>
          {/* අනිත් බටන්ස් ටික මෙතන තියන්න... */}
        </div>
      </div>
      
      {/* ඉතිරි කොටස පෙර පරිදිමයි... */}
    </div>
  );
};

export default StudentDashboard;