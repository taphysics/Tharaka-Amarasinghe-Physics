import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Send, 
  CheckCircle2, 
  Lock, 
  FileText, 
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Video,
  Sparkles
} from 'lucide-react';

interface Student {
  id: string;
  username: string;
  class_types?: string[];
  active_months?: string[];
  free_months?: string[];
  is_paid?: boolean;
  class?: string;
  course?: string;
  enrolled_coures?: string[];
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  class_type?: string;
  target_class_type?: string;
  target_classes?: string[];
  target_month?: string;
  status?: string;
  zoom_join_url: string;
  zoom_meeting_id?: string;
  is_exam_active?: boolean;
  active_exam_id?: string;
  pre_class_video_path?: string;
  is_active?: boolean;
}

interface ExamData {
  id: string;
  title: string;
  pdf_url: string;
  duration_minutes: number;
  total_questions: number;
  correct_answer: Record<string, number>;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  description?: string;
  start_time: string;
  class_type?: string;
  target_class_type?: string;
}

// --------------------------------------------------
// Robust Date & Time Parser
// --------------------------------------------------
const parseClassDateTime = (dateStr: string, timeStr: string): Date => {
  if (!dateStr) return new Date();
  
  try {
    let cleanDate = dateStr.trim().replace(/\//g, '-');
    const dateParts = cleanDate.split('-');
    
    if (dateParts.length === 3) {
      let year = dateParts[0].length === 4 ? dateParts[0] : dateParts[2];
      let month = dateParts[1].padStart(2, '0');
      let day = dateParts[0].length === 4 ? dateParts[2].padStart(2, '0') : dateParts[0].padStart(2, '0');
      cleanDate = `${year}-${month}-${day}`;
    }

    let cleanTime = (timeStr || '00:00').trim();
    const isPM = /pm/i.test(cleanTime);
    const isAM = /am/i.test(cleanTime);
    cleanTime = cleanTime.replace(/am|pm/gi, '').trim();

    const timeParts = cleanTime.split(':');
    let hours = parseInt(timeParts[0] || '0', 10);
    let minutes = parseInt(timeParts[1] || '0', 10);

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');

    const parsedDate = new Date(`${cleanDate}T${hoursStr}:${minutesStr}:00`);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  } catch(e) {}

  return new Date(`${dateStr} ${timeStr}`);
};

const getEmbeddableZoomUrl = (joinUrl: string) => {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    }
    return url.toString();
  } catch (error) {
    return joinUrl;
  }
};

const getDrivePreviewUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('/view')) return url.replace('/view', '/preview');
  if (url.includes('/edit')) return url.replace('/edit', '/preview');
  return url;
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduledLive[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());

  const [hasPaymentAccess, setHasPaymentAccess] = useState<boolean>(true);
  const [accessRestrictedDetails, setAccessRestrictedDetails] = useState<{
    classType: string; month: string; year: string;
  } | null>(null);

  const [activeExam, setActiveExam] = useState<ExamData | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examTimeLeft, setExamTimeLeft] = useState<number>(0);
  const [isExamSubmitted, setIsExamSubmitted] = useState<boolean>(false);
  const [examResult, setExamResult] = useState<{ score: number; total: number } | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    initDataFetch();
    const channel = supabase.channel('live-class-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => initDataFetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => initDataFetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.username, currentUser?.id]);

  const initDataFetch = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const currentMonthStr = format(now, 'yyyy-MM');

      let fullStudent: Student = currentUser;
      if (currentUser?.username || currentUser?.id) {
        const query = supabase.from('students').select('*');
        if (currentUser.username) query.eq('username', currentUser.username);
        else if (currentUser.id) query.eq('id', currentUser.id);

        const { data: stData } = await query.maybeSingle();
        if (stData) fullStudent = { ...currentUser, ...stData };
      }

      // Collect Classes from Profile AND Payments Table
      const studentClassesSet = new Set<string>();
      [...(fullStudent.class_types || []), fullStudent.class, fullStudent.course, ...(fullStudent.enrolled_coures || [])].forEach(c => {
        if (c) studentClassesSet.add(String(c).trim().toLowerCase());
      });

      const { data: payData } = await supabase.from('payments').select('class_name, class_type').or(`username.eq.${fullStudent.username},student_id.eq.${fullStudent.id}`);
      if (payData) {
        payData.forEach(p => {
          if (p.class_name) studentClassesSet.add(p.class_name.trim().toLowerCase());
          if (p.class_type) studentClassesSet.add(p.class_type.trim().toLowerCase());
        });
      }
      
      const studentClassList = Array.from(studentClassesSet);

      const matchesStudentClass = (targetTypeRaw?: string, targetClassesRaw?: string[]) => {
        const targetType = (targetTypeRaw || '').trim().toLowerCase();
        if (!targetType || ['all', 'public', 'null', 'general'].includes(targetType)) return true;
        if (studentClassList.length === 0) return true;

        const directMatch = studentClassList.some(sc => sc.includes(targetType) || targetType.includes(sc));
        const targetClasses = (targetClassesRaw || []).map(c => String(c).trim().toLowerCase());
        const arrayMatch = targetClasses.some(tc => tc === 'all' || studentClassList.some(sc => sc.includes(tc) || tc.includes(sc)));
        
        return directMatch || arrayMatch;
      };

      const { data: livesData } = await supabase.from('scheduled_lives').select('*').order('created_at', { ascending: false });

      const activeOrUpcomingLives: ScheduledLive[] = [];
      (livesData || []).forEach((cls: ScheduledLive) => {
        const status = (cls.status || '').toLowerCase();
        if (['ended', 'completed', 'archived'].includes(status)) return;
        if (!matchesStudentClass(cls.target_class_type || cls.class_type, cls.target_classes)) return;

        const isLive = status === 'live' || cls.is_active === true;
        const classDateTime = parseClassDateTime(cls.date, cls.time);
        const diffHours = (classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        const isToday = isSameDay(classDateTime, now);

        // Include if Live, Scheduled Today, or within reasonable past/future timeframe (-24 to +72 hrs)
        if (isLive || isToday || (diffHours >= -24 && diffHours <= 72)) {
          activeOrUpcomingLives.push(cls);
        }
      });

      activeOrUpcomingLives.sort((a, b) => {
        const aLive = (a.status || '').toLowerCase() === 'live' || a.is_active === true;
        const bLive = (b.status || '').toLowerCase() === 'live' || b.is_active === true;
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;
        return parseClassDateTime(a.date, a.time).getTime() - parseClassDateTime(b.date, b.time).getTime();
      });

      setUpcomingClasses(activeOrUpcomingLives);

      const { data: calData } = await supabase.from('calender_events').select('*').order('date', { ascending: true });
      if (calData) {
        setCalendarEvents(calData.filter((evt: CalendarEvent) => matchesStudentClass(evt.target_class_type || evt.class_type)));
      }

      if (activeOrUpcomingLives.length > 0) {
        await verifyPaymentAccess(activeOrUpcomingLives[0], fullStudent, currentMonthStr);
      } else {
        setHasPaymentAccess(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyPaymentAccess = async (targetClass: ScheduledLive, student: Student, defaultMonth: string) => {
    const classType = targetClass.target_class_type || targetClass.class_type || 'General Class';
    const targetMonth = targetClass.target_month || defaultMonth;
    const [yearVal, monthVal] = targetMonth.includes('-') ? targetMonth.split('-') : [format(new Date(), 'yyyy'), targetMonth];

    const activeM = student?.active_months || [];
    const freeM = student?.free_months || [];
    if (activeM.some(m => m.includes(targetMonth)) || freeM.some(m => m.includes(targetMonth)) || student?.is_paid) {
      setHasPaymentAccess(true);
      return;
    }

    const { data: payRecords } = await supabase.from('payments').select('*').or(`username.eq.${student.username},student_id.eq.${student.id}`);
    const isPaid = (payRecords || []).some(p => {
      const pMonth = p.target_month || p.month || '';
      const pStatus = (p.status || '').toLowerCase();
      const pClassType = (p.class_type || p.class_name || '').toLowerCase();
      
      const isMonthMatch = pMonth.includes(targetMonth) || targetMonth.includes(pMonth);
      const isStatusApproved = ['approved', 'paid', 'success', 'free'].includes(pStatus);
      const isClassMatch = !pClassType || pClassType.includes(classType.toLowerCase()) || classType.toLowerCase().includes(pClassType);
      
      return isMonthMatch && isStatusApproved && isClassMatch;
    });

    if (isPaid) setHasPaymentAccess(true);
    else {
      setHasPaymentAccess(false);
      setAccessRestrictedDetails({ classType, month: monthVal, year: yearVal });
    }
  };

  const activeClass = upcomingClasses.length > 0 ? upcomingClasses[0] : null;

  // Render logic conditions
  const statusStr = (activeClass?.status || '').toLowerCase();
  const isLive = statusStr === 'live' || activeClass?.is_active === true;
  const classDateTime = activeClass ? parseClassDateTime(activeClass.date, activeClass.time) : new Date();
  
  // SECONDS left until class
  const diffSeconds = activeClass ? Math.floor((classDateTime.getTime() - currentTime.getTime()) / 1000) : 999999;
  
  const isWithin12Hours = activeClass && (diffSeconds <= 43200);
  const isWithin30Mins = activeClass && (diffSeconds <= 1800);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-black text-white gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-400 text-sm">දත්ත පූරණය වෙමින් පවතී...</p>
      </div>
    );
  }

  // 1. PAYMENT RESTRICTED VIEW
  if (!hasPaymentAccess && accessRestrictedDetails) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><Lock size={32} /></div>
          <h2 className="text-2xl font-bold text-white mb-2">ප්‍රවේශය සීමා කර ඇත</h2>
          <p className="text-gray-400 text-sm mb-6">
            කරුණාකර <span className="text-amber-400 font-bold">{accessRestrictedDetails.classType}</span> සඳහා {accessRestrictedDetails.year} {accessRestrictedDetails.month} ගාස්තුව ගෙවා සම්බන්ධ වන්න.
          </p>
        </div>
      </div>
    );
  }

  // 2. CALENDAR VIEW (If NO upcoming classes, OR if class is > 12 hours away)
  if (!activeClass || (!isLive && !isWithin12Hours)) {
    const monthStart = startOfMonth(currentCalendarMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) });

    return (
      <div className="min-h-screen bg-black text-white p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row justify-between gap-4 bg-gray-900/60 p-6 rounded-3xl border border-gray-800">
            <div>
              <h1 className="text-2xl md:text-3xl font-black flex items-center gap-3">
                <CalendarIcon className="text-blue-500" size={32} /> පන්ති කාලසටහන් කැළැන්ඩරය
              </h1>
            </div>
            <div className="flex items-center gap-3 bg-gray-950 px-4 py-2 rounded-2xl border border-gray-800">
              <button onClick={() => setCurrentCalendarMonth(subMonths(currentCalendarMonth, 1))} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400"><ChevronLeft size={20} /></button>
              <span className="font-mono font-bold text-sm min-w-[120px] text-center text-blue-400">{format(currentCalendarMonth, 'MMMM yyyy')}</span>
              <button onClick={() => setCurrentCalendarMonth(addMonths(currentCalendarMonth, 1))} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400"><ChevronRight size={20} /></button>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-4 md:p-6 shadow-2xl overflow-hidden">
            <div className="grid grid-cols-7 gap-2 mb-4 text-center font-bold text-xs text-gray-500 uppercase">
              <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {daysInMonth.map((dayDate, idx) => {
                const dayStr = format(dayDate, 'yyyy-MM-dd');
                const dayEvts = calendarEvents.filter(e => e.date.replace(/\//g, '-') === dayStr);
                const isToday = isSameDay(dayDate, new Date());
                
                return (
                  <div key={idx} className={`min-h-[90px] md:min-h-[120px] p-2 rounded-2xl border transition relative flex flex-col justify-between ${
                    dayEvts.length > 0 ? 'bg-blue-950/30 border-blue-500/60 shadow-[0_0_15px_rgba(59,130,246,0.25)] animate-pulse' : isToday ? 'bg-amber-950/20 border-amber-500/40' : 'bg-gray-950/50 border-gray-800/80'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-amber-500 text-black' : dayEvts.length > 0 ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{format(dayDate, 'd')}</span>
                      {dayEvts.length > 0 && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>}
                    </div>
                    {dayEvts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {dayEvts.map(evt => (
                          <div key={evt.id} className="bg-blue-600/20 border border-blue-500/40 rounded-lg p-1 text-[10px] text-blue-200 truncate font-semibold">
                            <span className="block font-bold text-amber-400">{evt.start_time}</span>
                            <span className="truncate block">{evt.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. LAST 12 HOURS LIST VIEW (More than 30 mins away)
  if (activeClass && !isLive && isWithin12Hours && !isWithin30Mins) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-amber-500/10 border border-amber-500/30 p-6 rounded-3xl flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
              <Clock size={28} className="animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">අද දින පැවැත්වෙන සජීවී පන්ති</h2>
            </div>
          </div>

          <div className="space-y-4">
            {upcomingClasses.map((cls, idx) => {
              const clsTime = parseClassDateTime(cls.date, cls.time);
              const secDiff = Math.max(0, Math.floor((clsTime.getTime() - currentTime.getTime()) / 1000));
              const hrs = Math.floor(secDiff / 3600);
              const mins = Math.floor((secDiff % 3600) / 60);

              return (
                <div key={cls.id} className={`bg-gray-900 border rounded-2xl p-6 transition flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden ${idx === 0 ? 'border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'border-gray-800'}`}>
                  {idx === 0 && <div className="absolute top-0 left-0 w-2 h-full bg-amber-500"></div>}
                  <div className="space-y-2">
                    <span className="bg-amber-500/10 text-amber-400 text-xs px-3 py-1 rounded-full font-bold uppercase border border-amber-500/20">
                      {cls.target_class_type || cls.class_type || 'General'}
                    </span>
                    <h3 className="text-xl font-bold text-white">{cls.title}</h3>
                    <p className="text-gray-400 text-sm font-mono flex items-center gap-3">
                      <span>දිනය: {cls.date}</span><span>|</span><span>වේලාව: {cls.time}</span>
                    </p>
                  </div>
                  <div className="bg-black/80 px-6 py-4 rounded-xl border border-gray-800 text-center shrink-0 min-w-[180px]">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">ආරම්භ වීමට තව</p>
                    <p className="text-2xl font-mono font-black text-amber-400">{hrs}h {mins}m</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 4. WAITING VIDEO (Less than 30 mins to class OR past time but Admin hasn't clicked LIVE)
  if (activeClass && !isLive && isWithin30Mins) {
    const displayDiff = Math.max(0, diffSeconds);
    const countdownM = Math.floor(displayDiff / 60);
    const countdownS = displayDiff % 60;

    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-3xl overflow-hidden bg-gray-950 min-h-[75vh] border border-gray-800 shadow-2xl">
          
          <video 
            autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-35 z-0 pointer-events-none"
            src={activeClass.pre_class_video_path || "/videos/waiting-video.mp4"}
          />

          <div className="relative z-10 flex flex-col items-center p-8 md:p-10 bg-black/80 rounded-3xl backdrop-blur-md border border-white/10 max-w-lg w-full mx-4 shadow-2xl text-center space-y-6">
            <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full border border-blue-500/30">
              {activeClass.target_class_type || activeClass.class_type || 'General Class'} - {activeClass.title}
            </span>
            <h2 className="text-lg md:text-xl text-gray-300 font-medium">පන්තිය ආරම්භ වීමට තව...</h2>
            
            <div className="text-7xl md:text-8xl font-mono font-black text-white tracking-wider drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
              {String(countdownM).padStart(2, '0')}:{String(countdownS).padStart(2, '0')}
            </div>

            <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-2xl w-full">
              <p className="text-green-400 animate-pulse text-xs md:text-sm font-bold flex items-center justify-center gap-2">
                <Video size={18} /> ගුරුතුමා විසින් පන්තිය සක්‍රීය කරන තුරු රැඳී සිටින්න...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 5. LIVE ZOOM PLAYER
  if (activeClass && isLive) {
    return (
      <div className="w-full h-screen max-h-screen bg-black text-white flex flex-col overflow-hidden">
        <div className="bg-gray-950 px-4 py-2.5 flex justify-between items-center border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span className="font-bold text-sm text-gray-200">
              {activeClass.title}
            </span>
          </div>
        </div>

        <div className="flex-1 w-full bg-black">
          <iframe 
            src={getEmbeddableZoomUrl(activeClass.zoom_join_url)} 
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            sandbox="allow-forms allow-scripts allow-same-origin"
            className="w-full h-full border-0 bg-white"
            title="Zoom Classroom"
          />
        </div>
      </div>
    );
  }

  return null;
};

export default LiveClassPlayer;