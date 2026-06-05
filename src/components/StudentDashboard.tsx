import React from 'react';
import { Bell, AlertTriangle, CheckCircle, X, LogOut } from 'lucide-react';

interface StudentDashboardProps {
  currentStudent: any;
  studentAlerts: any[];
  showWelcomeBanner: boolean;
  closeWelcomeActiveBanner: () => void;
  openStudentProfileModal: () => void;
  handleStudentLogout: () => void;
  isCurrentMonthPaid: (months: any) => boolean;
  siteConfig: any;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({
  currentStudent,
  studentAlerts,
  showWelcomeBanner,
  closeWelcomeActiveBanner,
  openStudentProfileModal,
  handleStudentLogout,
  isCurrentMonthPaid,
  siteConfig
}) => {
  
  // 1. ශ්‍රී ලංකාවේ වේලාවට අනුව වත්මන් මාසය ස්වයංක්‍රීයව තීරණය කිරීම (උදා: "2026-06")
  const slDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
  const currentMonthKey = `${slDate.getFullYear()}-${String(slDate.getMonth() + 1).padStart(2, '0')}`;

  // 2. ගෙවීම් තත්ත්වයන් 3 නිවැරදිව පිරික්සීම (Paid / Free / Unpaid)
  const isPaid = isCurrentMonthPaid(currentStudent.activeMonths);
  const isFree = currentStudent.freeMonths?.includes(currentMonthKey) || currentStudent.isFreeStudent || false;
  const paymentStatus: 'paid' | 'free' | 'unpaid' = isFree ? 'free' : (isPaid ? 'paid' : 'unpaid');

  // 3. ඇඩ්මින් පැනලයෙන් එවන Reminder Count එක 
  const remindersCount = currentStudent.remindersCount || currentStudent.reminderCount || 0;

  // 4. වර්ණ, ග්ලෝ (Glow) සහ ඇනිමේෂන් සඳහා වන නිවැරදි Tailwind Configs
  const statusStyles = {
    paid: {
      cardBorder: 'border-amber-500/40 shadow-2xl shadow-amber-950/20 bg-slate-900/80 backdrop-blur-md',
      sticker: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400',
      avatar: 'bg-gradient-to-tr from-amber-600 to-yellow-500 ring-4 ring-amber-500/20 shadow-amber-500/20',
      glow: 'bg-amber-500/10',
      text: 'Premium Access'
    },
    free: {
      cardBorder: 'border-blue-500/40 shadow-2xl shadow-blue-950/20 bg-slate-900/80 backdrop-blur-md',
      sticker: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      dot: 'bg-blue-400 animate-pulse',
      avatar: 'bg-gradient-to-tr from-blue-600 to-cyan-500 ring-4 ring-blue-500/20 shadow-blue-500/20',
      glow: 'bg-blue-500/10 animate-pulse',
      text: 'Free Student'
    },
    unpaid: {
      cardBorder: 'border-red-500 shadow-2xl shadow-red-950/40 bg-gradient-to-b from-red-950/10 to-slate-900/90 border animate-[pulse_2s_infinite]',
      sticker: 'bg-red-500/20 text-red-400 border-red-500/40 font-bold',
      dot: 'bg-red-500 animate-ping relative inline-flex',
      avatar: 'bg-gradient-to-tr from-rose-600 to-red-500 ring-4 ring-red-500/30 shadow-red-500/30 animate-pulse',
      glow: 'bg-red-600/20 animate-ping absolute inset-0 rounded-2xl',
      text: 'Action Required'
    }
  };

  const style = statusStyles[paymentStatus];

  return (
    <div className="space-y-6 animate-fade-in w-full">
      
      {/* 🎯 Dashboard Announcements / Alerts */}
      {studentAlerts && studentAlerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {studentAlerts.map((alert: any, index: number) => (
            <div 
              key={index} 
              className={`p-4 rounded-lg border flex items-start gap-3 ${
                alert.type === 'private' ? 'bg-red-500/10 border-red-500/30 text-red-100' : 'bg-blue-500/10 border-blue-500/30 text-blue-100' 
              }`}
            >
              <AlertTriangle className={`w-6 h-6 shrink-0 ${alert.type === 'private' ? 'text-red-400' : 'text-blue-400'}`} />
              <div>
                <h4 className="font-semibold text-lg">{alert.title}</h4>
                <p className="text-sm mt-1 opacity-90">{alert.content}</p>
                <span className="text-xs opacity-70 mt-2 block">{alert.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Profile Card */}
        <div className={`lg:col-span-3 border p-6 rounded-3xl flex flex-col items-center justify-center text-center shadow-xl relative min-h-[250px] transition-all duration-500 ${style.cardBorder}`}>
          
          {/* ⚡ Bell Notification Icon (රිමයින්ඩර් පවතී නම් පමණක් මතු වේ) ⚡ */}
          {remindersCount > 0 && (
            <div className="absolute top-4 left-4 z-50 group cursor-pointer">
              <div className="relative p-2 rounded-full bg-slate-950 border border-red-500/40 hover:border-red-500 transition shadow-lg shadow-red-950/50">
                <Bell size={18} className="text-red-400 animate-[bounce_1.5s_infinite]" />
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
                  {remindersCount}
                </span>
              </div>

              {/* Hover Dropdown Message Box */}
              <div className="absolute left-0 mt-2 w-64 bg-slate-950/95 border border-slate-700 backdrop-blur-xl rounded-2xl shadow-2xl p-4 hidden group-hover:block transition-all text-left z-50 animate-fade-in">
                <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2 border-b border-slate-800 pb-2 uppercase tracking-wider">
                  <AlertTriangle size={14} className="text-red-400 animate-pulse" /> Payment Notice
                </h4>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans font-medium">
                  {currentStudent.reminderMessage || "කරුණාකර මෙම මාසය සඳහා ඔබගේ පන්ති ගාස්තු ගෙවා රිසිට්පත Dashboard එක හරහා යොමු කරන්න."}
                </p>
              </div>
            </div>
          )}

          {/* Status Sticker */}
          <div className={`absolute top-4 right-4 px-2.5 py-1 rounded-full text-[9px] font-extrabold tracking-wider uppercase flex items-center gap-1.5 shadow-md border ${style.sticker}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {style.text}
          </div>

          {/* Profile Avatar Click Area */}
          <div onClick={openStudentProfileModal} className="flex flex-col items-center gap-4 cursor-pointer group mt-4 w-full">
            <div className="relative">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center font-extrabold text-white text-3xl shadow-lg transform group-hover:scale-105 transition-all duration-300 relative z-10 ${style.avatar}`}>
                {currentStudent.firstName?.slice(0, 1).toUpperCase()}
                {currentStudent.lastName?.slice(0, 1).toUpperCase()}
              </div>
              <div className={`absolute inset-0 rounded-2xl blur-xl opacity-70 z-0 ${style.glow}`} />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white font-sans group-hover:text-blue-400 transition-colors">{currentStudent.name}</h3>
              <p className="text-[9px] text-slate-400 font-mono tracking-widest font-bold mt-1 uppercase bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                View Full Profile
              </p>
            </div>
          </div>

          <button onClick={handleStudentLogout} className="w-full mt-6 bg-slate-950 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-900/50 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition duration-200">
            <LogOut size={13} /> Log out Dashboard
          </button>
        </div>

        {/* Right Main Content Area */}
        <div className="lg:col-span-9 space-y-5">
          
          {/* Welcome Verified Banner */}
          {showWelcomeBanner && paymentStatus !== 'unpaid' && (
            <div className="bg-gradient-to-r from-emerald-950/25 to-slate-900 border border-emerald-500/35 rounded-2xl p-4 flex justify-between items-center gap-4 transition shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0"><CheckCircle size={18} /></div>
                <div className="space-y-0.5">
                  <h4 className="font-bold text-emerald-400 text-sm font-display">{siteConfig.dashboardWelcomeMsg ? siteConfig.dashboardWelcomeMsg.replace('{name}', currentStudent.firstName) : `Welcome back, ${currentStudent.firstName}!`}</h4>
                  <p className="text-xs text-slate-350">{siteConfig.dashboardIntroText || "Your account is active and verified."}</p>
                </div>
              </div>
              <button onClick={closeWelcomeActiveBanner} className="text-slate-400 hover:text-white p-1 hover:bg-slate-800/50 rounded transition"><X size={16} /></button>
            </div>
          )}

          {/* Unpaid Suspended Warning Banner */}
          {paymentStatus === 'unpaid' && (
            <div className="bg-gradient-to-r from-red-950/30 to-slate-900 border border-red-500/30 rounded-2xl p-4.5 flex gap-3 shadow-md animate-[pulse_3s_infinite]">
              <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0 mt-0.5"><AlertTriangle size={16} /></div>
              <div className="whitespace-pre-wrap">
                <h4 className="font-bold text-red-400 text-sm font-sans">{siteConfig.dashboardUnpaidWarningTitle || "Payment Settle Warning Alert"}</h4>
                <p className="text-xs text-slate-300 leading-relaxed mt-1">{siteConfig.dashboardUnpaidWarningText || "ඔබගේ ගිණුමේ සක්‍රීය ප්‍රවේශය තාවකාලිකව අත්හිටුවා ඇත. සජීවී දේශන සබැඳි, සටහන් පත්‍රිකා සහ පටිගත කළ දේශන නැරඹීමට කරුණාකර මෙම මාසයේ ඔබගේ ගෙවීම් රිසිට්පත ( WhatsApp 0719152128 ) හරහා යොමු කරන්න."}</p>
              </div>
            </div>
          )}

          {/* Bottom Info Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider uppercase px-3 py-1.5 rounded-full ${paymentStatus !== 'unpaid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              Access: {paymentStatus !== 'unpaid' ? 'ACTIVE' : 'ON SUSPENSION'}
            </span>
            <span className="text-[10px] font-mono select-all bg-slate-950/60 border border-slate-800 px-3.5 py-1.5 rounded-full text-slate-350 font-semibold">
              ID: {currentStudent.username}
            </span>
            <span className="text-[10px] font-mono bg-slate-950/60 border border-slate-800 px-3.5 py-1.5 rounded-full text-slate-350 font-semibold">
              District: {currentStudent.district}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;