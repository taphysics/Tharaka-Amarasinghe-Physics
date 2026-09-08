import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { format, differenceInSeconds, parse } from 'date-fns';
import { Maximize2, Minimize2, Lock } from 'lucide-react'; 

interface Student {
  username: string;
  class_types: string[]; 
  free_months: string[];
  plan_type?: string;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  status: string;
  target_class_type: string;
  class_type: string;
  start_time: string;
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  class_type?: string; // TS Error එක විසඳීම සඳහා මෙය අලුතින් එක් කරන ලදී
  target_class_type: string;
  target_classes: string[];
  target_month: string;
  pre_class_video_path: string;
  status: string;
  zoom_join_url: string;
}

// Zoom Web Client URL එක නිර්මාණය කිරීම සහ UI Clean කිරීම
const getEmbeddableZoomUrl = (joinUrl: string, userName: string) => {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    }
    const pwd = url.searchParams.get('pwd');
    if (userName) {
      try {
        const encodedName = btoa(unescape(encodeURIComponent(userName)));
        url.searchParams.set('un', encodedName);
      } catch (e) {
        url.searchParams.set('name', userName);
      }
    }
    if (pwd) url.searchParams.set('pwd', pwd);
    url.searchParams.set('prefer', '1');
    return url.toString();
  } catch (error) {
    return joinUrl;
  }
};

const getClassColor = (type: string) => {
  if (!type) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  const colors = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-purple-500/10 text-purple-400 border-purple-500/20',
    'bg-pink-500/10 text-pink-400 border-pink-500/20',
    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    'bg-green-500/10 text-green-400 border-green-500/20',
    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  ];
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// පැය 12 කාල ආකෘතියට (12-Hour format - AM/PM) පරිවර්තනය කිරීම
const formatTime12h = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const cleanTime = timeStr.substring(0, 5); 
    const parsedTime = parse(cleanTime, 'HH:mm', new Date());
    return format(parsedTime, 'hh:mm a');
  } catch (error) {
    return timeStr;
  }
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student | null }) => {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [scheduledLives, setScheduledLives] = useState<ScheduledLive[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [viewState, setViewState] = useState<'loading' | 'live' | 'waiting-0s' | 'waiting-30m' | 'waiting-24h' | 'upcoming-list' | 'no-classes'>('loading');
  const [targetClass, setTargetClass] = useState<ScheduledLive | null>(null);
  const [timer, setTimer] = useState({ h: 0, m: 0, s: 0 });
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const headerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<any>(null);

  const studentName = currentUser?.username || 'Student';

  useEffect(() => {
    fetchDataAndPayments();
    const subscription = supabase
      .channel('live-class-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => fetchDataAndPayments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => fetchDataAndPayments())
      .subscribe();
    return () => { supabase.removeChannel(subscription); };
  }, [currentUser]);

  // දත්ත පූරණය, Filtering සහ Payment Checking
  const fetchDataAndPayments = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Database එකේ ඇති පරිදිම පන්ති ලබා ගැනීම
      const studentClasses = (currentUser?.class_types || []).map(c => c.trim().toLowerCase());
      
      if (studentClasses.length === 0) {
        setCalendarEvents([]);
        setScheduledLives([]);
        setIsLoading(false);
        return;
      }

      // Simple Exact Matching - සිසුවාගේ DB එකේ අගයන් සහ පන්තියේ අගයන් කෙලින්ම ගැලපීම
      const isMatch = (type1?: string, type2?: string, arr?: string[]) => {
        const check = (val?: string) => val ? studentClasses.includes(val.trim().toLowerCase()) : false;
        return check(type1) || check(type2) || (arr && arr.some(check));
      };

      // 1. Calendar Events Fetch
      const { data: calData } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('date', today)
        .eq('status', 'scheduled');

      let filteredCal: CalendarEvent[] = [];
      if (calData) {
        filteredCal = calData.filter(ev => isMatch(ev.class_type, ev.target_class_type))
          .sort((a, b) => {
            const tA = a.start_time ? a.start_time.substring(0, 5) : '00:00';
            const tB = b.start_time ? b.start_time.substring(0, 5) : '00:00';
            return parse(`${a.date} ${tA}`, 'yyyy-MM-dd HH:mm', new Date()).getTime() - 
                   parse(`${b.date} ${tB}`, 'yyyy-MM-dd HH:mm', new Date()).getTime();
          });
        setCalendarEvents(filteredCal);
      }

      // 2. Scheduled Lives Fetch
      const { data: liveData } = await supabase
        .from('scheduled_lives')
        .select('*')
        .in('status', ['scheduled', 'live'])
        .gte('date', today);

      let filteredLive: ScheduledLive[] = [];
      if (liveData) {
        filteredLive = liveData.filter((cls: any) => isMatch(cls.target_class_type, cls.class_type, cls.target_classes))
          .sort((a, b) => {
            const tA = a.time ? a.time.substring(0, 5) : '00:00';
            const tB = b.time ? b.time.substring(0, 5) : '00:00';
            return parse(`${a.date} ${tA}`, 'yyyy-MM-dd HH:mm', new Date()).getTime() - 
                   parse(`${b.date} ${tB}`, 'yyyy-MM-dd HH:mm', new Date()).getTime();
          });
        setScheduledLives(filteredLive);
      }

      // 3. Payments Checking (Recordings වල ආකාරයටම)
      if (currentUser?.username) {
        const { data: payData } = await supabase
          .from('payments')
          .select('*')
          .eq('username', currentUser.username);

        const statusMap: Record<string, boolean> = {};
        const isGloballyFree = currentUser?.plan_type?.toLowerCase() === 'free';

        const checkPayment = (id: string, classType: string, dateStr: string, targetMonth?: string) => {
          if (isGloballyFree) {
            statusMap[id] = true; return;
          }

          const monthToUse = targetMonth || dateStr.substring(0, 7); // උදා: "2026-09"
          const isMonthFree = currentUser?.free_months?.some(m => m.includes(monthToUse));
          
          if (isMonthFree) {
            statusMap[id] = true; return;
          }

          const paymentRecord = payData?.find(p => {
            const pClass = String(p.class_type || p.class_name || "").trim().toLowerCase();
            const rClass = String(classType).trim().toLowerCase();
            const isClassMatch = pClass === rClass || pClass.includes(rClass) || rClass.includes(pClass);
            const pMonth = String(p.month || p.target_month || "").trim();
            return isClassMatch && pMonth === monthToUse;
          });

          const pStatus = paymentRecord?.status?.toLowerCase()?.trim();
          statusMap[id] = ['paid', 'free', 'approved', 'success'].includes(pStatus || '');
        };

        filteredLive.forEach(live => checkPayment(live.id, live.target_class_type || live.class_type || '', live.date, live.target_month));
        filteredCal.forEach(cal => checkPayment(cal.id, cal.target_class_type || cal.class_type || '', cal.date));

        setPaymentStatuses(statusMap);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Timer Control
  useEffect(() => {
    if (isLoading) return;
    
    const interval = setInterval(() => {
      const live = scheduledLives.find(c => c.status === 'live');
      if (live) {
        setTargetClass(live);
        setViewState('live');
        return;
      }

      const nextLive = scheduledLives.find(c => c.status === 'scheduled');
      
      if (nextLive) {
        setTargetClass(nextLive);
        const cleanTime = nextLive.time ? nextLive.time.substring(0, 5) : '00:00';
        const classDateTime = parse(`${nextLive.date} ${cleanTime}`, 'yyyy-MM-dd HH:mm', new Date());
        const diffSeconds = differenceInSeconds(classDateTime, new Date());

        if (diffSeconds > 86400) {
           setViewState(calendarEvents.length > 0 ? 'upcoming-list' : 'no-classes');
        } else if (diffSeconds > 1800) {
          setViewState('waiting-24h');
          setTimer({ h: Math.floor(diffSeconds / 3600), m: Math.floor((diffSeconds % 3600) / 60), s: diffSeconds % 60 });
        } else if (diffSeconds > 0) {
          setViewState('waiting-30m');
          setTimer({ h: 0, m: Math.floor(diffSeconds / 60), s: diffSeconds % 60 });
        } else {
          setViewState('waiting-0s');
        }
      } else {
        setViewState(calendarEvents.length > 0 ? 'upcoming-list' : 'no-classes');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [scheduledLives, calendarEvents, isLoading]);


  // Screen Sleep එක වැළැක්වීම (Wake Lock API)
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.warn('Wake Lock failed:', err);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (viewState === 'live' || viewState === 'waiting-30m' || viewState === 'waiting-0s')) {
        requestWakeLock();
      }
    };

    if (viewState === 'live' || viewState === 'waiting-30m' || viewState === 'waiting-0s') {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [viewState]);


  // Fullscreen Header Auto-hide පාලනය කිරීම
  const handleUserActivity = () => {
    if (!isFullscreen) return;
    setIsHeaderVisible(true);
    if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
    headerTimeoutRef.current = setTimeout(() => {
      setIsHeaderVisible(false);
    }, 3000); 
  };

  useEffect(() => {
    if (!isFullscreen) {
      setIsHeaderVisible(true);
      if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
    } else {
      handleUserActivity();
    }
  }, [isFullscreen]);

  const toggleFullscreen = async () => {
    if (!playerContainerRef.current) return;
    
    if (!isFullscreen) {
      setIsFullscreen(true);
      try {
        if (playerContainerRef.current.requestFullscreen) {
          await playerContainerRef.current.requestFullscreen();
        } else if ((playerContainerRef.current as any).webkitRequestFullscreen) {
          await (playerContainerRef.current as any).webkitRequestFullscreen(); 
        }
        if (window.screen?.orientation?.lock) {
          await window.screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (err) {}
    } else {
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
        }
        if (window.screen?.orientation?.unlock) window.screen.orientation.unlock();
      } catch (err) {}
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);


  if (isLoading || viewState === 'loading') {
    return <div className="flex justify-center items-center h-screen bg-black text-white font-semibold">දත්ත පූරණය වෙමින් පවතී...</div>;
  }

  // 1. පන්ති නොමැති විට
  if (viewState === 'no-classes') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] bg-black text-white p-6">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center shadow-xl">
          <h2 className="text-2xl font-bold text-gray-400 mb-2">පන්ති නොමැත</h2>
          <p className="text-gray-500 text-sm">ඉදිරි දින සඳහා ඔබගේ විෂයයන්ට අදාළව සජීවී පන්ති කාලසටහන් කර නොමැත.</p>
        </div>
      </div>
    );
  }

  // 2. පැය 24 ට වඩා කල් ඇති පන්ති (Payment Badge එක සහිතව)
  if (viewState === 'upcoming-list') {
    return (
      <div className="flex flex-col items-center min-h-screen bg-black text-white p-4 md:p-8">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-200 mb-8 mt-4 text-center">ඉදිරියේදී පැවැත්වීමට නියමිත පන්ති</h2>
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {calendarEvents.map((ev, idx) => {
            const isUnlocked = paymentStatuses[ev.id];
            
            return (
              <div key={idx} className={`p-6 rounded-2xl border bg-gray-900/80 shadow-lg ${getClassColor(ev.target_class_type || ev.class_type)} border-opacity-30 hover:border-opacity-100 transition-all duration-300 relative overflow-hidden`}>
                
                {!isUnlocked && (
                   <div className="absolute top-3 right-3 bg-red-500/20 text-red-400 p-1.5 rounded-full border border-red-500/30" title="ගෙවීම් කර නොමැත">
                     <Lock size={14} />
                   </div>
                )}
                
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-black/40 inline-block shadow-sm mb-4">
                  {ev.target_class_type || ev.class_type}
                </span>
                <h3 className="text-xl text-white font-bold mb-4 line-clamp-2 leading-tight">{ev.title}</h3>
                <div className="flex flex-col gap-2 text-sm bg-black/20 p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">දිනය:</span>
                    <span className="text-gray-100 font-medium">{ev.date}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">වේලාව:</span>
                    <span className="text-gray-100 font-medium">{formatTime12h(ev.start_time)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // පන්තිය Live හෝ පටන්ගැනීමට ආසන්න වූ විට ගෙවීම් පරික්ෂා කිරීම
  const isTargetUnlocked = targetClass ? paymentStatuses[targetClass.id] : false;

  // ගෙවීම් කර නොමැති විට පෙන්වන Screen එක
  if (!isTargetUnlocked && targetClass) {
    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
        <div className="flex flex-col items-center justify-center flex-1 bg-slate-950 rounded-2xl border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.1)] relative p-6 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
            <Lock className="w-10 h-10 text-red-500 animate-pulse" />
          </div>
          <span className={`text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4 ${getClassColor(targetClass.target_class_type)}`}>
            {targetClass.target_class_type || targetClass.class_type}
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">{targetClass.title}</h2>
          <div className="bg-red-500/10 px-6 py-4 rounded-xl border border-red-500/20 max-w-lg">
            <h3 className="text-red-400 font-bold text-lg mb-2">පන්ති ගාස්තු ගෙවා නොමැත</h3>
            <p className="text-slate-400 text-sm">මෙම සජීවී පන්තියට සහභාගී වීමට කරුණාකර අදාළ මාසය සඳහා ගෙවීම් සිදු කරන්න.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
      
      {/* 3. පැය 24 කවුන්ඩවුන් එක */}
      {viewState === 'waiting-24h' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full h-[60vh] md:h-[75vh] bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl relative">
          <div className="z-10 text-center p-6 flex flex-col items-center w-full max-w-2xl">
            <span className={`text-xs md:text-sm font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6 ${getClassColor(targetClass.target_class_type)}`}>
              {targetClass.target_class_type || targetClass.class_type}
            </span>
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-4 leading-tight">{targetClass.title}</h1>
            <p className="text-yellow-400/80 font-medium text-lg mb-8">අද දින {formatTime12h(targetClass.time)} ට ආරම්භ වේ</p>
            
            <div className="flex gap-3 md:gap-6 text-center">
              {['h', 'm', 's'].map((unit) => (
                <div key={unit} className="flex flex-col items-center">
                  <div className="w-16 h-16 md:w-24 md:h-24 bg-black border border-gray-700 rounded-xl flex items-center justify-center text-3xl md:text-5xl font-mono font-black text-white shadow-inner">
                    {String(unit === 'h' ? timer.h : unit === 'm' ? timer.m : timer.s).padStart(2, '0')}
                  </div>
                  <span className="text-gray-500 text-xs md:text-sm mt-2 font-medium">
                    {unit === 'h' ? 'පැය' : unit === 'm' ? 'විනාඩි' : 'තත්පර'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. අවසන් විනාඩි 30 (Video සමග) */}
      {viewState === 'waiting-30m' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full h-[60vh] md:h-[75vh] relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl">
          <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none">
            <source src={targetClass.pre_class_video_path || "/videos/waiting-video.mp4"} type="video/mp4" />
          </video>
          <div className="relative z-10 flex flex-col items-center p-8 bg-black/60 rounded-3xl backdrop-blur-md border border-white/10 shadow-2xl">
            <span className={`text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5 ${getClassColor(targetClass.target_class_type)}`}>
              {targetClass.target_class_type || targetClass.class_type}
            </span>
            <h2 className="text-lg md:text-xl text-gray-200 mb-6">පන්තිය ආරම්භ වීමට තව...</h2>
            <div className="text-6xl md:text-8xl font-mono font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] animate-pulse">
              {String(timer.m).padStart(2, '0')}:{String(timer.s).padStart(2, '0')}
            </div>
          </div>
        </div>
      )}

      {/* 5. තත්පර 0 වූ පසු */}
      {viewState === 'waiting-0s' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full h-[60vh] md:h-[75vh] relative rounded-2xl overflow-hidden bg-gray-950 border border-green-500/40">
          <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none">
            <source src={targetClass.pre_class_video_path || "/videos/waiting-video.mp4"} type="video/mp4" />
          </video>
          <div className="relative z-10 flex flex-col items-center p-6 bg-black/70 rounded-3xl backdrop-blur-lg border border-green-500/30 text-center shadow-2xl">
            <span className="animate-ping h-4 w-4 rounded-full bg-green-500 mb-4"></span>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">{targetClass.title}</h2>
            <div className="bg-green-500/10 px-5 py-3 rounded-xl border border-green-500/20">
              <p className="text-green-400 font-medium">ගුරුවරයා පන්තිය ආරම්භ කරන තෙක් රැඳී සිටින්න...</p>
            </div>
          </div>
        </div>
      )}

      {/* 6. Live Zoom Player */}
      {viewState === 'live' && targetClass && (
        <div 
          ref={playerContainerRef} 
          className={`flex flex-col bg-gray-900 overflow-hidden relative ${
            isFullscreen ? 'fixed inset-0 z-[999999] w-full h-full m-0 p-0 rounded-none' : 'flex-1 rounded-2xl border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.15)]'
          }`}
        >
          {/* Hit Area - මවුස් එක හෝ ඇඟිල්ල ඉහළට ගෙනගිය විට Header එක පෙන්වීම සඳහා */}
          {isFullscreen && (
            <div 
              className="absolute top-0 left-0 w-full h-20 z-[40]"
              onMouseEnter={handleUserActivity}
              onTouchStart={handleUserActivity}
            />
          )}

          {/* Header Bar - Auto hiding in Fullscreen */}
          <div 
            onMouseMove={handleUserActivity}
            onTouchStart={handleUserActivity}
            className={`w-full bg-green-950/90 text-green-400 px-4 py-2 flex items-center justify-between border-b border-green-500/20 text-sm md:text-base z-50 transition-transform duration-500 ease-in-out ${
              isFullscreen 
                ? `absolute top-0 left-0 ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'}` 
                : 'relative translate-y-0'
            }`}
          >
            <div className="flex items-center gap-3 font-semibold">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              සජීවී: {targetClass.title}
            </div>
            
            <button 
              onClick={toggleFullscreen} 
              className="bg-green-500/20 hover:bg-green-500/40 text-green-300 p-2 rounded-lg transition border border-green-500/30 flex items-center gap-2 cursor-pointer"
            >
              {isFullscreen ? (
                <><Minimize2 size={16} /> <span className="hidden md:inline text-xs">Exit Fullscreen</span></>
              ) : (
                <><Maximize2 size={16} /> <span className="hidden md:inline text-xs">Full Screen</span></>
              )}
            </button>
          </div>
          
          <div className={`w-full bg-black relative ${isFullscreen ? 'h-full' : 'h-[70vh] md:h-[80vh]'}`}>
            <iframe 
              src={getEmbeddableZoomUrl(targetClass.zoom_join_url, studentName)} 
              allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *"
              allowFullScreen={true}
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals"
              className="absolute inset-0 w-full h-full border-0"
              title="Zoom Web Client"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassPlayer;