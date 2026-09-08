import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { format, differenceInSeconds } from 'date-fns';
import { Maximize2, Minimize2 } from 'lucide-react'; 

interface Student {
  username: string;
  class_types: any; 
  free_months: string[];
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  status: string;
  target_class_type?: any;
  class_type?: any;
  start_time: string;
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  target_class_type?: any;
  class_type?: any; 
  target_classes?: any;
  target_month: string;
  pre_class_video_path: string;
  status: string;
  zoom_join_url: string;
}

// 12-Hour Format Converter
const formatTo12Hour = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const [hourStr, minuteStr] = timeStr.split(':');
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    hour = hour ? hour : 12; 
    return `${hour.toString().padStart(2, '0')}:${minuteStr} ${ampm}`;
  } catch (error) {
    return timeStr;
  }
};

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

// 100% Bulletproof Date Parser
const parseClassTime = (dateStr: string, timeStr: string) => {
  try {
    const cleanDate = (dateStr || '').replace(/-/g, '/'); 
    const cleanTime = (timeStr || '00:00');
    const parsed = new Date(`${cleanDate} ${cleanTime}:00`);
    if (!isNaN(parsed.getTime())) return parsed.getTime();
    return new Date(`${dateStr}T${cleanTime}:00`).getTime();
  } catch {
    return 0;
  }
};

// 🌟 THE BULLETPROOF DATA NORMALIZER 🌟
// (මෙමගින් ඩේටාබේස් එකේ ඇති වරහන්, කමා, සහ කැපිටල් අකුරු සියල්ල පිරිසිදු කර ගනී)
const normalizeClasses = (input: any): string[] => {
  if (!input) return [];
  let arr: any[] = [];

  if (Array.isArray(input)) {
    arr = input;
  } else if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      arr = input.split(',');
    }
  } else {
    arr = [input];
  }

  return arr
    .flat(Infinity)
    .filter(Boolean)
    .map(item => String(item).replace(/[\[\]"']/g, '').trim().toLowerCase())
    .filter(item => item !== '');
};

const formatClassLabel = (val: any): string => {
  if (!val) return '';
  let arr = [];
  try {
    if (Array.isArray(val)) arr = val;
    else if (typeof val === 'string' && val.startsWith('[')) arr = JSON.parse(val);
    else arr = val.split(',');
  } catch {
    arr = [val];
  }
  return arr.map((v: any) => String(v).replace(/[\[\]"']/g, '').trim()).join(', ');
};

const getClassColor = (type: any) => {
  const strType = formatClassLabel(type);
  if (!strType) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  const colors = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-purple-500/10 text-purple-400 border-purple-500/20',
    'bg-pink-500/10 text-pink-400 border-pink-500/20',
    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    'bg-green-500/10 text-green-400 border-green-500/20',
    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  ];
  let hash = 0;
  for (let i = 0; i < strType.length; i++) hash = strType.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student | null }) => {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [scheduledLives, setScheduledLives] = useState<ScheduledLive[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  const [now, setNow] = useState(new Date().getTime());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true); 
  
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<any>(null); 

  const studentName = currentUser?.username || 'Student';

  // තත්පරෙන් තත්පරය වේලාව Update කිරීම
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date().getTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchData();
    const subscription = supabase
      .channel('live-class-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(subscription); };
  }, [currentUser]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // සිසුවාගේ පන්ති ලැයිස්තුව ආරක්ෂිතව සකසා ගැනීම
      const studentClasses = normalizeClasses(currentUser?.class_types);
      const hasClasses = studentClasses.length > 0;

      // 🌟 100% PERFECT MATCHER 🌟
      const isMatch = (dbClassType: any, dbTargetClassType: any, dbTargetClasses: any): boolean => {
        if (!hasClasses) return false; 
        
        const eventClasses = normalizeClasses([dbClassType, dbTargetClassType, dbTargetClasses]);
        if (eventClasses.length === 0) return false;

        // සිසුවාගේ එක පන්තියක් හෝ ඉවෙන්ට් එකේ පන්තියකට සමාන දැයි පරීක්ෂාව
        return eventClasses.some(ec => 
          studentClasses.some(sc => sc === ec || sc.includes(ec) || ec.includes(sc))
        );
      };

      // ඊයේ දින සිට ඉදිරියට ඇති දත්ත පමණක් ලබා ගැනීම (Timezone issues මග හැරීමට)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const fetchDate = format(yesterday, 'yyyy-MM-dd');

      const { data: calData } = await supabase.from('calendar_events').select('*').gte('date', fetchDate);
      if (calData) {
        const filteredCal = calData.filter((ev: any) => {
          const statusStr = String(ev.status || '').toLowerCase().trim();
          const isNotCancelled = statusStr !== 'cancelled' && statusStr !== 'ended'; 
          return isNotCancelled && isMatch(ev.class_type, ev.target_class_type, null);
        });
        setCalendarEvents(filteredCal);
      }

      const { data: liveData } = await supabase.from('scheduled_lives').select('*').gte('date', fetchDate);
      if (liveData) {
        const filteredLive = liveData.filter((cls: any) => {
          const statusStr = String(cls.status || '').toLowerCase().trim();
          const isValidStatus = ['scheduled', 'live', 'active', 'published', 'pending'].includes(statusStr);
          return isValidStatus && isMatch(cls.class_type, cls.target_class_type, cls.target_classes);
        });
        setScheduledLives(filteredLive);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- View State Engine ---

  const activeLive = scheduledLives.find(c => String(c.status).toLowerCase().trim() === 'live');
  
  // සියලුම ඉවෙන්ට්ස් එකතු කිරීම
  const allEvents = [
    ...calendarEvents.map(ev => ({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      time: ev.start_time || '00:00',
      type: ev.target_class_type || ev.class_type,
      rawObj: ev
    })),
    ...scheduledLives.map(live => ({
      id: live.id,
      title: live.title,
      date: live.date,
      time: live.time || '00:00',
      type: live.target_class_type || live.target_classes || live.class_type,
      rawObj: live
    }))
  ];

  // අනාගත පන්ති පමණක් වෙන්කර ගැනීම (පැය 2ක් ඇතුළත ආරම්භ වූ පන්ති ද පෙන්වයි)
  const uniqueUpcomingClasses = Array.from(
    new Map(allEvents.map(item => [item.title + item.date, item])).values()
  ).map(ev => ({
    ...ev,
    timeVal: parseClassTime(ev.date, ev.time)
  })).filter(ev => {
    return (ev.timeVal - now) > -7200000; 
  }).sort((a, b) => a.timeVal - b.timeVal);

  const nextClass = uniqueUpcomingClasses.length > 0 ? uniqueUpcomingClasses[0] : null;

  let viewState = 'loading';
  let targetClass: ScheduledLive | null = null;
  let timer = { h: 0, m: 0, s: 0 };

  if (!isLoading) {
    if (activeLive) {
      viewState = 'live';
      targetClass = activeLive;
    } else if (nextClass && nextClass.rawObj && 'zoom_join_url' in nextClass.rawObj) {
      // ළඟම එන පන්තිය Zoom එකක් නම් (ScheduledLive ටේබල් එකේ එකක් නම්) කවුන්ඩවුන් එක පෙන්වයි
      targetClass = nextClass.rawObj as ScheduledLive;
      const diffSeconds = Math.floor((nextClass.timeVal - now) / 1000);

      if (diffSeconds > 86400) {
        viewState = 'upcoming-list';
      } else if (diffSeconds > 1800) {
        viewState = 'waiting-24h';
        timer = { h: Math.floor(diffSeconds / 3600), m: Math.floor((diffSeconds % 3600) / 60), s: diffSeconds % 60 };
      } else if (diffSeconds > 0) {
        viewState = 'waiting-30m';
        timer = { h: 0, m: Math.floor(diffSeconds / 60), s: diffSeconds % 60 };
      } else {
        viewState = 'waiting-0s';
      }
    } else {
      // Zoom ලින්ක් එකක් නැති සාමාන්‍ය Calendar Event එකක් නම් හෝ පන්ති කල් ඇත්නම්
      viewState = uniqueUpcomingClasses.length > 0 ? 'upcoming-list' : 'no-classes';
    }
  }

  useEffect(() => {
    const requestWakeLock = async () => {
      if (viewState === 'live' && 'wakeLock' in navigator) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (err) {}
      }
    };
    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); wakeLockRef.current = null; } catch (err) {}
      }
    };

    if (viewState === 'live') requestWakeLock();
    else releaseWakeLock();

    const handleVisibilityChange = () => { if (document.visibilityState === 'visible' && viewState === 'live') requestWakeLock(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { document.removeEventListener('visibilitychange', handleVisibilityChange); releaseWakeLock(); };
  }, [viewState]);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isFullscreen) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  };

  useEffect(() => {
    if (isFullscreen) resetControlsTimeout();
    else {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isFullscreen]);

  const toggleFullscreen = async () => {
    if (!playerContainerRef.current) return;
    if (!isFullscreen) {
      setIsFullscreen(true);
      try {
        if (playerContainerRef.current.requestFullscreen) await playerContainerRef.current.requestFullscreen();
        else if ((playerContainerRef.current as any).webkitRequestFullscreen) await (playerContainerRef.current as any).webkitRequestFullscreen();
        if (window.screen?.orientation?.lock) await window.screen.orientation.lock('landscape').catch(() => {});
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

  if (viewState === 'loading') {
    return <div className="flex justify-center items-center h-screen bg-black text-white font-semibold">දත්ත පූරණය වෙමින් පවතී...</div>;
  }

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

  if (viewState === 'upcoming-list') {
    return (
      <div className="flex flex-col items-center min-h-screen bg-black text-white p-4 md:p-8">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-200 mb-8 mt-4 text-center">ඉදිරියේදී පැවැත්වීමට නියමිත පන්ති</h2>
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {uniqueUpcomingClasses.map((ev, idx) => (
            <div key={idx} className={`p-6 rounded-2xl border bg-gray-900/80 shadow-lg ${getClassColor(ev.type)} border-opacity-30 hover:border-opacity-100 transition-all duration-300`}>
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-black/40 inline-block shadow-sm mb-4 line-clamp-1">
                {formatClassLabel(ev.type)}
              </span>
              <h3 className="text-xl text-white font-bold mb-4 line-clamp-2 leading-tight">{ev.title}</h3>
              <div className="flex flex-col gap-2 text-sm bg-black/20 p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">දිනය:</span>
                  <span className="text-gray-100 font-medium">{ev.date}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">වේලාව:</span>
                  <span className="text-gray-100 font-medium">{formatTo12Hour(ev.time)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
      
      {viewState === 'waiting-24h' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full h-[60vh] md:h-[75vh] bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl relative">
          <div className="z-10 text-center p-6 flex flex-col items-center w-full max-w-2xl">
            <span className={`text-xs md:text-sm font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6 ${getClassColor(targetClass.target_class_type || targetClass.class_type || targetClass.target_classes)}`}>
              {formatClassLabel(targetClass.target_class_type || targetClass.class_type || targetClass.target_classes)}
            </span>
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-6 md:mb-8 leading-tight">{targetClass.title}</h1>
            <p className="text-gray-400 mb-6 text-base md:text-lg">පන්තිය ආරම්භ වීමට තව...</p>
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

      {viewState === 'waiting-30m' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full h-[60vh] md:h-[75vh] relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl">
          <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none">
            <source src={targetClass.pre_class_video_path || "/videos/waiting-video.mp4"} type="video/mp4" />
          </video>
          <div className="relative z-10 flex flex-col items-center p-8 bg-black/60 rounded-3xl backdrop-blur-md border border-white/10 shadow-2xl">
            <span className={`text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5 ${getClassColor(targetClass.target_class_type || targetClass.class_type || targetClass.target_classes)}`}>
              {formatClassLabel(targetClass.target_class_type || targetClass.class_type || targetClass.target_classes)}
            </span>
            <h2 className="text-lg md:text-xl text-gray-200 mb-6">පන්තිය ආරම්භ වීමට තව...</h2>
            <div className="text-6xl md:text-8xl font-mono font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] animate-pulse">
              {String(timer.m).padStart(2, '0')}:{String(timer.s).padStart(2, '0')}
            </div>
          </div>
        </div>
      )}

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

      {viewState === 'live' && targetClass && (
        <div 
          ref={playerContainerRef} 
          onMouseMove={resetControlsTimeout}
          onTouchStart={resetControlsTimeout}
          onClick={resetControlsTimeout}
          className={`flex flex-col bg-gray-900 border-green-500/30 overflow-hidden relative ${
            isFullscreen 
              ? 'fixed inset-0 z-[999999] w-full h-full m-0 p-0 rounded-none' 
              : 'flex-1 rounded-2xl border shadow-[0_0_30px_rgba(34,197,94,0.15)]'
          }`}
        >
          {/* HEADER SECTION (Auto Hides in Fullscreen) */}
          <div className={`
            bg-green-950/90 text-green-400 px-4 py-2 flex items-center justify-between border-b border-green-500/20 text-sm md:text-base z-50 transition-all duration-500 ease-in-out
            ${isFullscreen ? 'absolute top-0 left-0 right-0' : ''} 
            ${isFullscreen && !showControls ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}
          `}>
            <div className="flex items-center gap-3 font-semibold">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              සජීවී: {targetClass.title}
            </div>
            
            <button 
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} 
              className="bg-green-500/20 hover:bg-green-500/40 text-green-300 p-2 rounded-lg transition border border-green-500/30 flex items-center gap-2 cursor-pointer z-50"
            >
              {isFullscreen ? (
                <><Minimize2 size={16} /> <span className="hidden md:inline text-xs">Exit Fullscreen</span></>
              ) : (
                <><Maximize2 size={16} /> <span className="hidden md:inline text-xs">Full Screen</span></>
              )}
            </button>
          </div>
          
          <div className={`w-full bg-white relative z-0 ${isFullscreen ? 'h-full flex-1' : 'h-[70vh] md:h-[80vh]'}`}>
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