import React, { useState, useMemo } from 'react';
import { 
  Bell, 
  Video, 
  FileText, 
  Calendar as CalendarIcon, 
  PlayCircle, 
  Download,
  AlertTriangle,
  User
} from 'lucide-react'; // lucide-react icons

// දත්ත සඳහා අවශ්‍ය Interfaces
interface Student {
  name: string;
  username: string; // Student ID
  classTypes: string[];
  // අනෙකුත් ශිෂ්‍ය දත්ත...
}

interface Announcement {
  id: string;
  type: 'public' | 'private';
  targetUser?: string;
  title: string;
  content: string;
  created_at: string;
}

interface ScheduledLive {
  id: string;
  title: string;
  target_classes: string[];
  date: string;
  time: string;
  link: string;
}

interface ClassResource {
  id: string;
  type: 'tute' | 'recording';
  targetClasses: string[];
  targetMonth: string;
  title: string;
  url: string;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  status: 'active' | 'past' | 'cancelled';
  warningMessage?: string;
}

interface StudentDashboardProps {
  student: Student;
  announcements: Announcement[];
  scheduledLives: ScheduledLive[];
  resources: ClassResource[];
  calendarEvents: CalendarEvent[];
  siteConfig?: { marqueeText?: string }; // Admin Site Config
}

export default function StudentDashboard({
  student,
  announcements,
  scheduledLives,
  resources,
  calendarEvents,
  siteConfig
}: StudentDashboardProps) {

  const [activeTab, setActiveTab] = useState<'overview' | 'tutes' | 'recordings'>('overview');

  // 1. Announcements Filter (Public ඒවා සහ මෙම ශිෂ්‍යයාට පමණක් එවා ඇති Private ඒවා)
  const myAnnouncements = useMemo(() => {
    return announcements.filter(
      a => a.type === 'public' || (a.type === 'private' && a.targetUser === student.username)
    );
  }, [announcements, student.username]);

  // 2. Scheduled Lives Filter (ශිෂ්‍යයාගේ පන්තියට අදාළ ඒවා පමණක්)
  const myLives = useMemo(() => {
    return scheduledLives.filter(live => 
      live.target_classes.some(c => student.classTypes.includes(c) || c === 'Free Notes / Public')
    );
  }, [scheduledLives, student.classTypes]);

  // 3. Resources Filter (Tutes & Recordings)
  const myTutes = useMemo(() => {
    return resources.filter(r => 
      r.type === 'tute' && r.targetClasses.some(c => student.classTypes.includes(c) || c === 'Free Notes / Public')
    );
  }, [resources, student.classTypes]);

  const myRecordings = useMemo(() => {
    return resources.filter(r => 
      r.type === 'recording' && r.targetClasses.some(c => student.classTypes.includes(c) || c === 'Free Notes / Public')
    );
  }, [resources, student.classTypes]);

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-6 space-y-6 antialiased">
      
      {/* Site Marquee - Admin Config */}
      {siteConfig?.marqueeText && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-2 rounded-lg text-xs font-semibold overflow-hidden whitespace-nowrap">
          <div className="animate-marquee inline-block">
            {siteConfig.marqueeText}
          </div>
        </div>
      )}

      {/* Welcome & Profile Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
            {student.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">ආයුබෝවන්, {student.name}!</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded font-mono">ID: {student.username}</span>
              <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded font-semibold">
                {student.classTypes.join(', ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Broadcast Announcements (Admin Alerts) */}
      {myAnnouncements.length > 0 && (
        <div className="space-y-3">
          {myAnnouncements.map(announcement => (
            <div key={announcement.id} className={`p-4 rounded-xl border ${announcement.type === 'private' ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-500/10 border-blue-500/20'} flex items-start gap-3`}>
              {announcement.type === 'private' ? <AlertTriangle className="text-red-400 shrink-0" size={20} /> : <Bell className="text-blue-400 shrink-0" size={20} />}
              <div>
                <h4 className={`font-bold text-sm ${announcement.type === 'private' ? 'text-red-400' : 'text-blue-400'}`}>
                  {announcement.title}
                </h4>
                <p className="text-slate-300 text-xs mt-1 leading-relaxed">{announcement.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Live Classes Notifications */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-md font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
              <Video className="text-rose-500" size={18} /> සජීවී පන්ති (Live Classes)
            </h3>
            <div className="mt-4 space-y-3">
              {myLives.length > 0 ? (
                myLives.map(live => (
                  <div key={live.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-sm text-white">{live.title}</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        {live.date} • {live.time}
                      </p>
                    </div>
                    <a 
                      href={live.link} 
                      target="_blank" 
                      rel="noreferrer"
                      className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <PlayCircle size={14} /> Join Live
                    </a>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 text-center py-6">දැනට සක්‍රීය සජීවී පන්ති නොමැත.</p>
              )}
            </div>
          </div>

          {/* Resources Navigation Tabs */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="flex border-b border-slate-800 bg-slate-950/50">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`flex-1 py-3 text-xs font-bold transition ${activeTab === 'overview' ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-900' : 'text-slate-400 hover:bg-slate-900/50'}`}
              >
                මෑතකාලීන (Recent)
              </button>
              <button 
                onClick={() => setActiveTab('tutes')}
                className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === 'tutes' ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-900' : 'text-slate-400 hover:bg-slate-900/50'}`}
              >
                <FileText size={14} /> නිබන්ධන (Tutes)
              </button>
              <button 
                onClick={() => setActiveTab('recordings')}
                className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === 'recordings' ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-900' : 'text-slate-400 hover:bg-slate-900/50'}`}
              >
                <Video size={14} /> වීඩියෝ (Recordings)
              </button>
            </div>

            <div className="p-6">
              {/* Tutes Section */}
              {(activeTab === 'overview' || activeTab === 'tutes') && (
                <div className={activeTab === 'overview' ? 'mb-6' : ''}>
                  {activeTab === 'overview' && <h4 className="text-sm font-bold text-white mb-3">අලුත්ම නිබන්ධන</h4>}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                    {myTutes.length > 0 ? myTutes.map(tute => (
                      <div key={tute.id} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex justify-between items-center group hover:border-slate-600 transition">
                        <div>
                          <h5 className="font-semibold text-xs text-slate-200 group-hover:text-amber-400 transition">{tute.title}</h5>
                          <p className="text-[10px] text-slate-500 mt-0.5">{tute.targetMonth} • {tute.targetClasses[0]}</p>
                        </div>
                        <a href={tute.url} target="_blank" rel="noreferrer" className="bg-slate-800 hover:bg-amber-600 text-white p-2 rounded-md transition cursor-pointer">
                          <Download size={14} />
                        </a>
                      </div>
                    )) : <p className="text-[11px] text-slate-500 italic">නිබන්ධන කිසිවක් එක් කර නොමැත.</p>}
                  </div>
                </div>
              )}

              {/* Recordings Section */}
              {(activeTab === 'overview' || activeTab === 'recordings') && (
                <div>
                  {activeTab === 'overview' && <h4 className="text-sm font-bold text-white mb-3 pt-4 border-t border-slate-800">අලුත්ම වීඩියෝ</h4>}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                    {myRecordings.length > 0 ? myRecordings.map(rec => (
                      <div key={rec.id} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex justify-between items-center group hover:border-slate-600 transition">
                        <div>
                          <h5 className="font-semibold text-xs text-slate-200 group-hover:text-green-400 transition">{rec.title}</h5>
                          <p className="text-[10px] text-slate-500 mt-0.5">{rec.targetMonth} • {rec.targetClasses[0]}</p>
                        </div>
                        <a href={rec.url} target="_blank" rel="noreferrer" className="bg-slate-800 hover:bg-green-600 text-white p-2 rounded-md transition cursor-pointer">
                          <PlayCircle size={14} />
                        </a>
                      </div>
                    )) : <p className="text-[11px] text-slate-500 italic">වීඩියෝ කිසිවක් එක් කර නොමැත.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Sidebar Area */}
        <div className="space-y-6">
          
          {/* Class Calendar Widget */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-md font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
              <CalendarIcon className="text-blue-400" size={18} /> පන්ති කාලසටහන
            </h3>
            <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
              {calendarEvents.length > 0 ? calendarEvents.map(event => (
                <div 
                  key={event.id} 
                  className={`p-3 rounded-xl border relative overflow-hidden ${
                    event.status === 'active' ? 'bg-blue-500/10 border-blue-500/30' : 
                    event.status === 'cancelled' ? 'bg-red-500/10 border-red-500/30' : 
                    'bg-slate-950 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h5 className={`font-bold text-xs ${
                      event.status === 'active' ? 'text-white' : 
                      event.status === 'cancelled' ? 'text-red-400' : 'text-slate-400'
                    }`}>{event.title}</h5>
                    <span className="text-[10px] font-mono text-slate-500">{event.date}</span>
                  </div>
                  {event.status === 'cancelled' && event.warningMessage && (
                    <p className="text-[10px] text-red-300 mt-2 bg-red-950/50 p-1.5 rounded">{event.warningMessage}</p>
                  )}
                </div>
              )) : (
                <p className="text-xs text-slate-500 text-center py-4">ඉදිරි දින සැලසුම් කර නොමැත.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}