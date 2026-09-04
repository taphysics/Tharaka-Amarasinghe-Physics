import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  getDay, 
  parseISO 
} from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Lock, 
  Video,
  AlertCircle
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
  target_class_type?: string;
  target_classes?: string[];
  status?: string;
  zoom_join_url: string;
  is_active?: boolean;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  start_time: string;
  class_type?: string;
  target_class_type?: string;
}

// දින සහ වේලාවන් නිවැරදිව හැසිරවීමේ (Parser) ශ්‍රිතය
const parseClassDateTime = (dateStr: string, timeStr: string): Date => {
  if (!dateStr) return new Date();
  let cleanDate = dateStr.trim().replace(/\//g, '-');
  const dateParts = cleanDate.split('-');
  if (dateParts.length === 3 && dateParts[0].length === 2) {
    cleanDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
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
  return isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
};

// Zoom Link එක Embed කළ හැකි (Web Client) ආකාරයට සැකසීම
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

const LiveClassPlayer = ({ currentUser }: { currentUser: Student }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduledLive[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  const [hasPaymentAccess, setHasPaymentAccess] = useState<boolean>(true);
  const [currentMonthStr, setCurrentMonthStr] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchData();

    // සජීවීව දත්ත යාවත්කාලීන වීම (Realtime updates)
    const channel = supabase
      .channel('class-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.username]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const monthStr = format(now, 'yyyy-MM'); // වත්මන් මාසය උදා: '2026-09'
      setCurrentMonthStr(monthStr);

      // 1. සිසුවාගේ සම්පූර්ණ දත්ත ලබා ගැනීම
      let fullStudent = currentUser;
      const { data: dbStudent } = await supabase.from('students').select('*').eq('username', currentUser.username).maybeSingle();
      if (dbStudent) fullStudent = { ...currentUser, ...dbStudent };

      const studentClasses = [
        ...(fullStudent.class_types || []),
        fullStudent.class,
        fullStudent.course,
        ...(fullStudent.enrolled_coures || [])
      ].filter(Boolean).map(c => String(c).trim().toLowerCase());

      // 2. ගෙවීම් පරීක්ෂා කිරීම (Payment Validation for Current Month)
      let accessGranted = false;
      const isFreeActive = 
        fullStudent.active_months?.some(m => m.includes(monthStr)) || 
        fullStudent.free_months?.some(m => m.includes(monthStr)) || 
        fullStudent.is_paid === true;

      if (isFreeActive) {
        accessGranted = true;
      } else {
        const { data: payments } = await supabase
          .from('payments')
          .select('*')
          .eq('username', fullStudent.username)
          .in('status', ['paid', 'approved', 'success', 'free'])
          .or(`month.eq.${monthStr},target_month.eq.${monthStr}`);
        
        if (payments && payments.length > 0) {
          accessGranted = true;
        }
      }
      setHasPaymentAccess(accessGranted);

      // 3. පන්ති සහ Calendar Events ලබා ගැනීම
      const { data: livesData } = await supabase.from('scheduled_lives').select('*');
      const { data: calData } = await supabase.from('calender_events').select('*');

      const matchesStudentClass = (target: string, targetsArray: string[]) => {
        if (!target || target === 'all') return true;
        const targetType = target.trim().toLowerCase();
        const arrayTypes = (targetsArray || []).map(t => String(t).trim().toLowerCase());
        
        return studentClasses.length === 0 || 
               studentClasses.some(sc => sc.includes(targetType) || targetType.includes(sc)) ||
               arrayTypes.some(at => studentClasses.some(sc => sc.includes(at) || at.includes(sc)));
      };

      // සිසුවාට අදාල Scheduled Lives පෙරා ගැනීම
      const eligibleLives = (livesData || []).filter(cls => {
        const status = (cls.status || '').toLowerCase();
        if (['ended', 'completed'].includes(status)) return false;
        return matchesStudentClass(cls.target_class_type || cls.class_type || '', cls.target_classes || []);
      });

      // සිසුවාට අදාල Calendar Events පෙරා ගැනීම
      if (calData) {
        const matchingCalEvents = calData.filter(evt => matchesStudentClass(evt.target_class_type || evt.class_type || '', []));
        setCalendarEvents(matchingCalEvents);
      }

      // Live වන හෝ ඉදිරියට ඇති පන්ති Sort කිරීම
      eligibleLives.sort((a, b) => {
        const aLive = (a.status || '').toLowerCase() === 'live' || a.is_active === true;
        const bLive = (b.status || '').toLowerCase() === 'live' || b.is_active === true;
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;
        return parseClassDateTime(a.date, a.time).getTime() - parseClassDateTime(b.date, b.time).getTime();
      });

      setUpcomingClasses(eligibleLives);

    } catch (error) {
      console.error('Data fetching error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white font-bold text-xl">Loading...</div>;
  }

  // ගෙවීම් සීමා කර ඇත්නම් (Payment Restricted)
  if (!hasPaymentAccess) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-3xl p-8 text-center shadow-2xl">
          <Lock className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">ප්‍රවේශය සීමා කර ඇත</h2>
          <p className="text-gray-400 text-sm mb-6">
            මෙම පහසුකම් භාවිතා කිරීම සඳහා කරුණාකර <span className="text-amber-400 font-bold">{currentMonthStr}</span> සඳහා ඔබේ මාසික පන්ති ගාස්තුව ගෙවන්න. ගෙවීම් කර ඇත්නම් ඇඩ්මින් දැනුවත් කරන්න.
          </p>
        </div>
      </div>
    );
  }

  // ආසන්නතම පන්තිය තේරීම
  const activeClass = upcomingClasses[0];
  let isLive = false;
  let diffSeconds = 999999;

  if (activeClass) {
    isLive = (activeClass.status || '').toLowerCase() === 'live' || activeClass.is_active === true;
    const classDateTime = parseClassDateTime(activeClass.date, activeClass.time);
    diffSeconds = Math.floor((classDateTime.getTime() - currentTime.getTime()) / 1000);
  }

  const isWithin12Hours = diffSeconds <= 43200 && diffSeconds > 1800; // පැය 12ත් විනාඩි 30ත් අතර
  const isWithin30Mins = diffSeconds <= 1800; // විනාඩි 30ට අඩු හෝ පසුවී ඇති

  // 1. LIVE PLAYER VIEW (status = 'live')
  if (isLive) {
    return (
      <div className="w-full h-screen bg-black flex flex-col">
        <div className="bg-gray-950 px-4 py-3 flex items-center gap-3 border-b border-gray-800">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
          </span>
          <span className="font-bold text-gray-200">{activeClass.title} - Live Now</span>
        </div>
        <div className="flex-1 w-full h-full">
          <iframe 
            src={getEmbeddableZoomUrl(activeClass.zoom_join_url)} 
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="w-full h-full border-0"
            title="Zoom Live Player"
          />
        </div>
      </div>
    );
  }

  // 2. 30-MINUTE WAITING VIDEO VIEW
  if (activeClass && !isLive && isWithin30Mins) {
    const displayMins = Math.floor(Math.max(0, diffSeconds) / 60);
    const displaySecs = Math.max(0, diffSeconds) % 60;

    return (
      <div className="w-full h-screen bg-black relative flex items-center justify-center overflow-hidden">
        {/* Waiting Video from System */}
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          src="/videos/waiting-video.mp4"
        />
        <div className="relative z-10 bg-black/60 backdrop-blur-md border border-white/10 p-10 rounded-3xl text-center max-w-lg w-full mx-4 shadow-2xl">
          <Video className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-bold text-white mb-2">{activeClass.title}</h2>
          <p className="text-gray-300 mb-6 text-sm">පන්තිය ආරම්භ වීමට තව...</p>
          
          <div className="text-7xl font-mono font-black text-white tracking-widest drop-shadow-lg mb-6">
            {String(displayMins).padStart(2, '0')}:{String(displaySecs).padStart(2, '0')}
          </div>
          
          {diffSeconds <= 0 && (
             <div className="bg-amber-500/20 border border-amber-500/30 text-amber-400 py-3 px-4 rounded-xl text-sm font-bold animate-pulse">
               ගුරුතුමා විසින් සජීවී සම්බන්ධතාවය ලබා දෙන තුරු රැඳී සිටින්න...
             </div>
          )}
        </div>
      </div>
    );
  }

  // 3. 12-HOUR LIST VIEW (Classes within 12 hours)
  if (activeClass && !isLive && isWithin12Hours) {
    const classesWithin12h = upcomingClasses.filter(c => {
      const sec = Math.floor((parseClassDateTime(c.date, c.time).getTime() - currentTime.getTime()) / 1000);
      return sec <= 43200 && sec > 0;
    });

    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <Clock className="text-blue-500" /> පැය 12ක් ඇතුළත පවත්වන පන්ති ලැයිස්තුව
          </h2>
          <div className="flex flex-col gap-4">
            {classesWithin12h.map((cls, idx) => {
               const timeDiff = Math.floor((parseClassDateTime(cls.date, cls.time).getTime() - currentTime.getTime()) / 1000);
               const h = Math.floor(timeDiff / 3600);
               const m = Math.floor((timeDiff % 3600) / 60);
               
               return (
                 <div key={cls.id} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center">
                   <div>
                     <span className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full font-bold mb-3 inline-block">
                       {cls.target_class_type || 'General'}
                     </span>
                     <h3 className="text-xl font-bold text-white mb-1">{cls.title}</h3>
                     <p className="text-gray-400 text-sm">දිනය: {cls.date} | වේලාව: {cls.time}</p>
                   </div>
                   <div className="mt-4 md:mt-0 bg-black p-4 rounded-xl border border-gray-800 text-center min-w-[150px]">
                     <div className="text-xs text-gray-500 mb-1">ආරම්භ වීමට තව</div>
                     <div className="text-amber-400 font-bold font-mono text-lg">{h}h {m}m</div>
                   </div>
                 </div>
               )
            })}
          </div>
        </div>
      </div>
    );
  }

  // 4. MONTHLY CALENDAR VIEW (Classes are > 12 hours away)
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayIndex = getDay(monthStart); // 0 = Sunday, 1 = Monday, etc.

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
          <CalendarIcon className="text-blue-500" size={32} /> පන්ති කාලසටහන - {format(today, 'MMMM yyyy')}
        </h2>
        
        {/* Calendar Grid */}
        <div className="bg-gray-900 rounded-3xl p-6 border border-gray-800 shadow-2xl">
          <div className="grid grid-cols-7 gap-2 mb-4 text-center">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-gray-500 font-bold text-sm uppercase">{day}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-2 md:gap-4">
            {Array.from({ length: startDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="p-4 rounded-xl bg-gray-950/50 border border-transparent"></div>
            ))}
            
            {daysInMonth.map(date => {
              const dateStr = format(date, 'yyyy-MM-dd');
              
              // අදාළ දිනයට events තිබේදැයි පරීක්ෂා කිරීම
              const dayEvents = calendarEvents.filter(e => {
                const eDate = e.date.replace(/\//g, '-');
                return eDate === dateStr || e.date === format(date, 'dd/MM/yyyy');
              });

              const hasEvent = dayEvents.length > 0;
              const isToday = isSameDay(date, today);

              return (
                <div 
                  key={date.toString()} 
                  className={`
                    relative p-2 md:p-4 rounded-2xl border min-h-[80px] md:min-h-[100px] flex flex-col items-center justify-start transition-all
                    ${hasEvent ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-gray-950 border-gray-800'}
                    ${isToday && !hasEvent ? 'border-amber-500/50 bg-amber-900/10' : ''}
                  `}
                >
                  <span className={`text-lg font-bold ${isToday ? 'text-amber-400' : hasEvent ? 'text-blue-400' : 'text-gray-500'}`}>
                    {format(date, 'd')}
                  </span>
                  
                  {hasEvent && (
                    <div className="mt-2 w-full flex flex-col gap-1">
                      {dayEvents.map(evt => (
                        <div 
                          key={evt.id} 
                          className="bg-blue-500 text-white text-[9px] md:text-xs font-bold py-1 px-1.5 rounded-md truncate text-center animate-pulse shadow-lg"
                          title={`${evt.title} - ${evt.start_time}`}
                        >
                          {evt.start_time} - {evt.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Info Legend */}
        <div className="mt-8 flex flex-wrap gap-6 items-center justify-center text-sm text-gray-400">
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse"></div> සජීවී පන්ති ඇති දින</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-amber-500"></div> අද දිනය</div>
        </div>

      </div>
    </div>
  );
};

export default LiveClassPlayer;