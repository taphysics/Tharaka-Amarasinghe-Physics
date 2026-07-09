import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { format, differenceInSeconds, parse } from 'date-fns';

interface Student {
  username: string;
  class_types: string[];
  free_months: string[];
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  class_type: string;
  target_class_type?: string;
  target_month: string;
  status: string; // 'scheduled', 'live', 'ended'
  zoom_join_url: string;
  zoom_meeting_id: string;
}

// සූම් ලින්ක් එක වෙබ් පිටුවට ගැලපෙන ලෙසත්, නම සහ passcode එක ස්වයංක්‍රීයව යන ලෙසත් සැකසීම
const getEmbeddableZoomUrl = (joinUrl: string, username: string) => {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    
    // සාමාන්‍ය '/j/' ලින්ක් එක වෙබ් ක්ලයන්ට් ('/wc/') ලින්ක් එකක් බවට පත් කිරීම
    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    }

    // නම ස්වයංක්‍රීයව ඇතුළත් කිරීම සඳහා Zoom Web Client සහය දක්වන 'un' පරාමිතිය (Base64 Encoded) එක් කිරීම
    if (username) {
      const encodedName = btoa(unescape(encodeURIComponent(username)));
      url.searchParams.set('un', encodedName);
    }
    
    // Original URL එකේ 'pwd' (passcode) තිබේ නම් එය ස්වයංක්‍රීයවම මෙහි රඳා පවතිනු ඇත.
    return url.toString();
  } catch (error) {
    console.error('Invalid Zoom URL', error);
    return joinUrl;
  }
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student }) => {
  const [currentLive, setCurrentLive] = useState<ScheduledLive | null>(null);
  const [nextLive, setNextLive] = useState<ScheduledLive | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<{ m: number; s: number } | null>(null);
  const [isWithinOneHour, setIsWithinOneHour] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  
  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchClassData();
    
    const subscription = supabase
      .channel('live-class-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scheduled_lives' },
        (payload) => {
          if (currentLive && payload.new.id === currentLive.id) {
            const updatedClass = payload.new as ScheduledLive;
            setCurrentLive(updatedClass);
            if (updatedClass.status === 'ended') {
              fetchNextClass();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [currentUser, currentLive?.id]);

  // Fullscreen event listener 
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const fetchClassData = async () => {
    setIsLoading(true);
    try {
      const today = new Date();
      const currentDateString = format(today, 'yyyy-MM-dd');
      const currentTargetMonthFormat = format(today, 'yyyy-MM'); 

      const { data: liveData, error: liveError } = await supabase
        .from('scheduled_lives')
        .select('*')
        .eq('date', currentDateString)
        .in('status', ['scheduled', 'live'])
        .order('time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (liveData) {
        setCurrentLive(liveData);
        // මුදල් ගෙවා ඇත්දැයි නැවත පරීක්ෂා කිරීමේ ෆන්ක්ෂන් එක ඇමතීම
        await checkStudentAccess(liveData, currentTargetMonthFormat);
      } else {
        await fetchNextClass();
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNextClass = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('scheduled_lives')
      .select('*')
      .gt('date', today)
      .eq('status', 'scheduled')
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (data) setNextLive(data);
  };

  const checkStudentAccess = async (liveClass: ScheduledLive, currentTargetMonth: string) => {
    // 1. Free Access පරීක්ෂාව
    const isFreeMonth = currentUser.free_months?.some(
      m => m.toLowerCase() === currentTargetMonth || m.toLowerCase() === format(new Date(), 'MMMM').toLowerCase()
    );
    
    if (isFreeMonth) {
      setHasAccess(true);
      return;
    }

    // 2. Paid Access පරීක්ෂාව
    const classIdentifiers = [
      liveClass.class_type,
      liveClass.target_class_type,
      '2026 REVISION',
      '2026 Revision'
    ].filter(Boolean);

    const { data: payment } = await supabase
      .from('payments')
      .select('status')
      .eq('username', currentUser.username)
      .eq('status', 'paid')
      .or(`target_month.eq.${liveClass.target_month},target_month.eq.${currentTargetMonth}`)
      .in('class_type', classIdentifiers)
      .limit(1)
      .maybeSingle();

    if (payment) {
      setHasAccess(true);
    } else {
      setHasAccess(false);
    }
  };

  useEffect(() => {
    if (!currentLive || currentLive.status !== 'scheduled') return;

    const interval = setInterval(() => {
      const classDateTime = parse(`${currentLive.date} ${currentLive.time}`, 'yyyy-MM-dd HH:mm', new Date());
      const now = new Date();
      const diffSeconds = differenceInSeconds(classDateTime, now);

      if (diffSeconds > 0 && diffSeconds <= 3600) { 
        setIsWithinOneHour(true);
        setCountdown({
          m: Math.floor(diffSeconds / 60),
          s: diffSeconds % 60,
        });
      } else if (diffSeconds <= 0) {
        setCountdown({ m: 0, s: 0 });
      } else {
        setIsWithinOneHour(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentLive]);

  // Fullscreen Toggle Function
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-black text-white font-semibold">
        දත්ත පූරණය වෙමින් පවතී...
      </div>
    );
  }

  // මුදල් නොගෙවූ සිසුන්ට පෙන්වන "Access Denied" තිරය
  if (currentLive && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] bg-black text-white p-6 text-center">
        <div className="max-w-xl p-8 bg-gray-900/50 border border-red-500/30 rounded-2xl backdrop-blur-md">
          <h2 className="text-3xl font-extrabold text-red-500 mb-4 animate-pulse">
            Access Denied (ප්‍රවේශය තහනම්)
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            ඔබ මෙම මාසය සඳහා <span className="text-yellow-400 font-bold">({currentLive.target_month})</span> අදාළ <span className="text-blue-400 font-bold">{currentLive.class_type}</span> පන්තියට මුදල් ගෙවා නොමැත හෝ ලියාපදිංචි වී නොමැත. කරුණාකර ගෙවීම් සම්පූර්ණ කරන්න.
          </p>
        </div>
      </div>
    );
  }

  if (!currentLive || currentLive.status === 'ended') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] bg-black text-white p-6">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center shadow-xl">
          <h2 className="text-2xl font-bold text-gray-400 mb-6">අද දිනට නියමිත සජීවී පන්ති නොමැත</h2>
          {nextLive ? (
            <div className="bg-gray-950 p-6 rounded-xl border border-blue-500/20">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full">
                මීළඟ පන්තිය
              </span>
              <h3 className="text-xl text-white font-bold mt-4 mb-2">{nextLive.class_type}</h3>
              <p className="text-gray-400 text-sm">දිනය: <span className="text-gray-200 font-medium">{nextLive.date}</span></p>
              <p className="text-gray-400 text-sm mt-1">ආරම්භ වන වේලාව: <span className="text-gray-200 font-medium">{nextLive.time}</span></p>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">ඉදිරි පන්ති කාලසටහන ළඟදීම යාවත්කාලීන කරනු ඇත.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
      {/* පන්තිය පටන් ගැනීමට පෙර පෙන්වන Waiting Screen එක */}
      {currentLive.status === 'scheduled' && (
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-2xl overflow-hidden bg-gray-900 min-h-[65vh] border border-gray-800 shadow-2xl">
          {isWithinOneHour ? (
            <>
              <video 
                autoPlay 
                loop 
                muted 
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
              >
                <source src="/videos/waiting-video.mp4" type="video/mp4" />
              </video>

              <div className="relative z-10 flex flex-col items-center p-8 bg-black/70 rounded-2xl backdrop-blur-md border border-white/5 max-w-md w-full mx-4">
                <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full mb-3">
                  {currentLive.class_type}
                </span>
                <h2 className="text-lg md:text-xl text-gray-300 text-center mb-6 font-medium">
                  පන්තිය ආරම්භ වීමට තව...
                </h2>
                <div className="text-6xl md:text-7xl font-mono font-black text-white tracking-wider drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                  {countdown ? (
                    `${String(countdown.m).padStart(2, '0')}:${String(countdown.s).padStart(2, '0')}`
                  ) : (
                    "00:00"
                  )}
                </div>
                {countdown?.m === 0 && countdown?.s === 0 && (
                  <p className="mt-6 text-green-400 animate-pulse text-sm font-medium bg-green-500/10 px-4 py-2 rounded-lg border border-green-500/20">
                    ගුරුතුමා විසින් පන්තිය සක්‍රීය කරන තුරු මඳක් රැඳී සිටින්න...
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="z-10 text-center p-6">
              <span className="text-xs font-bold uppercase tracking-widest bg-gray-800 text-gray-400 px-3 py-1 rounded-full mb-3 inline-block">
                {currentLive.class_type}
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{currentLive.title}</h1>
              <p className="text-gray-400">මෙම පන්තිය අද දින <span className="text-yellow-400 font-medium">{currentLive.time}</span> ට ආරම්භ වීමට නියමිතයි.</p>
            </div>
          )}
        </div>
      )}

      {/* පන්තිය ආරම්භ වූ පසු පෙන්වන සජීවී විකාශය */}
      {currentLive.status === 'live' && (
        <div 
          ref={playerContainerRef}
          className={`flex-1 flex flex-col rounded-2xl overflow-hidden bg-gray-900 border border-green-500/20 shadow-2xl relative ${isFullscreen ? 'h-screen w-screen rounded-none border-none' : ''}`}
        >
          {/* Top Bar - Hide in fullscreen mode for better viewing */}
          {!isFullscreen && (
            <div className="bg-green-950/40 text-green-400 px-4 py-3 flex justify-between items-center font-semibold border-b border-green-500/10 text-sm md:text-base">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                සජීවී විකාශය ක්‍රියාත්මකයි: {currentLive.class_type}
              </div>
              
              {/* Desktop View Fullscreen Button */}
              <button 
                onClick={toggleFullscreen}
                className="hidden md:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors text-xs"
              >
                Full Screen
              </button>
            </div>
          )}

          {/* Zoom Player Area */}
          <div className="w-full flex-1 min-h-[75vh] bg-black relative">
            <iframe 
              src={getEmbeddableZoomUrl(currentLive.zoom_join_url, currentUser.username)} 
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              sandbox="allow-forms allow-scripts allow-same-origin"
              className={`absolute inset-0 w-full h-full border-0 ${isFullscreen ? '' : 'rounded-b-2xl'} bg-white`}
              title="Zoom Web Client"
            />
            
            {/* Overlay Button for Fullscreen (Useful for Mobile and returning back) */}
            <button
              onClick={toggleFullscreen}
              className="absolute bottom-6 right-6 z-50 bg-black/70 hover:bg-black text-white px-4 py-2 rounded-full border border-gray-600 shadow-xl transition-all flex items-center gap-2 backdrop-blur-md"
            >
              {isFullscreen ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Exit Full Screen
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:hidden" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 112 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 110 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 111 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 111-1z" clipRule="evenodd" />
                  </svg>
                  <span className="md:hidden">Full Screen</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassPlayer;