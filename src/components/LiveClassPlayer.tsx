import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { format, differenceInSeconds } from 'date-fns';
import { Maximize2, Minimize2 } from 'lucide-react'; 

interface Student {
  username: string;
  class_types: string[]; 
  free_months: string[];
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
  target_class_type: string;
  target_classes: string[];
  target_month: string;
  pre_class_video_path: string;
  status: string;
  zoom_join_url: string;
}

// 12-Hour Format Converter Function
const formatTo12Hour = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const [hourStr, minuteStr] = timeStr.split(':');
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    hour = hour ? hour : 12; // 0 නම් 12 ලෙස සකසයි
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

const LiveClassPlayer = ({ currentUser }: { currentUser: Student | null }) => {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [scheduledLives, setScheduledLives] = useState<ScheduledLive[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [viewState, setViewState] = useState<'loading' | 'live' | 'waiting-0s' | 'waiting-30m' | 'waiting-24h' | 'upcoming-list' | 'no-classes'>('loading');
  const [targetClass, setTargetClass] = useState<ScheduledLive | null>(null);
  const [timer, setTimer] = useState({ h: 0, m: 0, s: 0 });
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true); // For Auto-hide Title
  
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<any>(null); // For Screen Sleep Prevention

  const studentName = currentUser?.username || 'Student';

  // WakeLock Effect: සජීවී පන්තියක සිටින විට Screen එක Off වීම වැලැක්වීම
  useEffect(() => {
    const requestWakeLock = async () => {
      if (viewState === 'live' && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.warn('Wake Lock request failed:', err);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (err) {}
      }
    };

    if (viewState === 'live') {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // User වෙනත් tab එකකට ගොස් ආවොත් නැවත wake lock එක සක්‍රීය කිරීමට
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && viewState === 'live') {
        requestWakeLock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [viewState]);

  // Fullscreen Title Auto-hide Logic
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    
    // ෆුල් ස්ක්‍රීන් එකේදී පමණක් තත්පර 3කින් හයිඩ් කිරීම
    if (isFullscreen) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    if (isFullscreen) {
      resetControlsTimeout();
    } else {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isFullscreen]);


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
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const studentClasses = (currentUser?.class_types || []).map(c => c.trim().toLowerCase());
      const hasClasses = studentClasses.length > 0;

      // STRICT CLASS FILTERING: සිසුවාට පන්ති නැත්නම් false, ඇත්නම් හරියටම ගැලපෙන ඒවා පමණි
      const isMatch = (type1?: string, type2?: string, arr?: string[]) => {
        if (!hasClasses) return false; 
        
        const check = (val?: string) => {
          if (!val) return false;
          const v = val.trim().toLowerCase();
          return studentClasses.some(sc => sc.includes(v) || v.includes(sc) || sc === v);
        };

        if (check(type1)) return true;
        if (check(type2)) return true;
        if (arr && arr.some(a => check(a))) return true;
        return false;
      };

      // 1. Calendar Events
      const { data: calData } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('date', today)
        .eq('status', 'scheduled');

      if (calData) {
        const filteredCal = calData.filter(ev => isMatch(ev.class_type, ev.target_class_type))
          .sort((a, b) => new Date(`${a.date}T${a.start_time || '00:00'}:00`).getTime() - new Date(`${b.date}T${b.start_time || '00:00'}:00`).getTime());
        setCalendarEvents(filteredCal);
      }

      // 2. Scheduled Lives
      const { data: liveData } = await supabase
        .from('scheduled_lives')
        .select('*')
        .in('status', ['scheduled', 'live'])
        .gte('date', today);

      if (liveData) {
        const filteredLive = liveData.filter((cls: any) => isMatch(cls.target_class_type, cls.class_type, cls.target_classes))
          .sort((a, b) => new Date(`${a.date}T${a.time || '00:00'}:00`).getTime() - new Date(`${b.date}T${b.time || '00:00'}:00`).getTime());
        setScheduledLives(filteredLive);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
        const classDateTime = new Date(`${nextLive.date}T${nextLive.time}:00`);
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
      } catch (err) {
        console.warn("Fullscreen API not fully supported.");
      }
    } else {
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
          }
        }
        if (window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        }
      } catch (err) {
        console.warn("Exit fullscreen error", err);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFull);
    };
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
          {calendarEvents.map((ev, idx) => (
            <div key={idx} className={`p-6 rounded-2xl border bg-gray-900/80 shadow-lg ${getClassColor(ev.target_class_type || ev.class_type)} border-opacity-30 hover:border-opacity-100 transition-all duration-300`}>
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
                  {/* 12 HOUR FORMAT DISPLAY */}
                  <span className="text-gray-100 font-medium">{formatTo12Hour(ev.start_time)}</span>
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
            <span className={`text-xs md:text-sm font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6 ${getClassColor(targetClass.target_class_type)}`}>
              {targetClass.target_class_type}
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
            <span className={`text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5 ${getClassColor(targetClass.target_class_type)}`}>
              {targetClass.target_class_type}
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