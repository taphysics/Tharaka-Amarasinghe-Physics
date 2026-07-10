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
    
    return url.toString();
  } catch (error) {
    console.error('Invalid Zoom URL', error);
    return joinUrl;
  }
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student | null }) => {
  const [currentLive, setCurrentLive] = useState<ScheduledLive | null>(null);
  const [nextLive, setNextLive] = useState<ScheduledLive | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<{ m: number; s: number } | null>(null);
  const [isWithinOneHour, setIsWithinOneHour] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // currentUser load වූ පසු පමණක් දත්ත ලබා ගැනීම ආරම්භ කිරීම
  useEffect(() => {
    if (currentUser?.username) {
      fetchClassData();
    }
    
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
  }, [currentUser?.username, currentLive?.id]);

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
      const currentTargetMonthFormat = format(today, 'yyyy-MM'); // උදා: 2026-07

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
    // Error එක වළක්වා ගැනීමට currentUser නොමැති නම් ඉවත් වීම
    if (!currentUser) {
      setHasAccess(false);
      return;
    }

    const requiredMonth = liveClass.target_month || currentTargetMonth;

    // 1. Free Access පරීක්ෂාව (Optional chaining මගින් undefined error එක වළක්වා ඇත)
    const freeMonths = currentUser.free_months || [];
    const isFreeMonth = freeMonths.some(
      m => m?.toLowerCase() === requiredMonth.toLowerCase() || m?.toLowerCase() === format(new Date(), 'MMMM').toLowerCase()
    );
    
    if (isFreeMonth) {
      setHasAccess(true);
      return;
    }

    // 2. Paid Access පරීක්ෂාව
    const classIdentifiers = [
      liveClass.class_type,
      liveClass.target_class_type,
    ].filter(Boolean); // හිස් අගයන් ඉවත් කිරීම

    try {
      // සිසුවාගේ සියලුම ගෙවීම් ලබාගෙන JavaScript මගින් 100% ක් නිවැරදිව පරීක්ෂා කිරීම 
      // (Supabase OR errors මඟ හැරීමට මෙය වඩාත් ආරක්ෂිතයි)
      const { data: payments, error } = await supabase
        .from('payments')
        .select('month, target_month, class_type, class_type, status')
        .eq('username', currentUser.username)
        .eq('status', 'paid');

      if (error) {
        console.error("Error fetching payments:", error);
        setHasAccess(false);
        return;
      }

      // අදාල පන්තියට සහ අදාල මාසයට ගෙවීමක් කර ඇත්දැයි පරීක්ෂා කිරීම
      const hasPaid = payments?.some(p => {
        const matchesMonth = p.month === requiredMonth || p.target_month === requiredMonth;
        const matchesClass = classIdentifiers.includes(p.class_type) || classIdentifiers.includes(p.class_type);
        return matchesMonth && matchesClass;
      });

      if (hasPaid) {
        setHasAccess(true);
      } else {
        setHasAccess(false);
      }
    } catch (err) {
      console.error("Payment check error:", err);
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  if (isLoading || !currentUser) {
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
        <div className="max-w-xl p-8 bg-gray-900/50 border border-red-500/30 rounded-2xl backdrop-blur-md shadow-2xl">
          <h2 className="text-3xl font-extrabold text-red-500 mb-4 animate-pulse">
            Access Denied (ප්‍රවේශය තහනම්)
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            ඔබ මෙම මාසය සඳහා <span className="text-yellow-400 font-bold">({currentLive.target_month || format(new Date(), 'yyyy-MM')})</span> අදාළ <span className="text-blue-400 font-bold">{currentLive.class_type}</span> පන්තියට මුදල් ගෙවා නොමැත හෝ ලියාපදිංචි වී නොමැත. කරුණාකර ගෙවීම් සම්පූර්ණ කරන්න.
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
      {currentLive.status === 'scheduled' && (
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-2xl overflow-hidden bg-gray-900 min-h-[65vh] border border-gray-800 shadow-2xl">
          {isWithinOneHour ? (
            <>
              {/* Waiting Video Background */}
              <video 
                autoPlay 
                loop 
                muted 
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              >
                <source src="/videos/waiting-video.mp4" type="video/mp4" />
              </video>
              
              {/* Dark overlay to ensure text is always readable over the video */}
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>

              {/* Glassmorphism Countdown Box */}
              <div className="relative z-10 flex flex-col items-center p-8 bg-white/10 rounded-3xl backdrop-blur-md border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] max-w-lg w-full mx-4">
                
                <span className="text-xs font-bold uppercase tracking-widest bg-blue-600/40 text-blue-100 px-4 py-1.5 rounded-full mb-4 border border-blue-400/30 shadow-sm">
                  {currentLive.class_type}
                </span>
                
                <h1 className="text-2xl md:text-3xl font-extrabold text-white text-center mb-6 drop-shadow-lg leading-tight">
                  {currentLive.title}
                </h1>
                
                <h2 className="text-sm md:text-base text-gray-200 text-center mb-3 font-medium uppercase tracking-widest">
                  පන්තිය ආරම්භ වීමට තව...
                </h2>
                
                <div className="text-6xl md:text-7xl font-mono font-black text-white tracking-wider drop-shadow-[0_0_20px_rgba(255,255,255,0.7)] my-2">
                  {countdown ? (
                    `${String(countdown.m).padStart(2, '0')}:${String(countdown.s).padStart(2, '0')}`
                  ) : (
                    "00:00"
                  )}
                </div>

                {countdown?.m === 0 && countdown?.s === 0 && (
                  <p className="mt-6 text-green-300 animate-pulse text-sm md:text-base font-semibold bg-green-900/40 px-5 py-2.5 rounded-xl border border-green-400/30">
                    ගුරුතුමා විසින් පන්තිය සක්‍රීය කරන තුරු මඳක් රැඳී සිටින්න...
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="z-10 text-center p-8 bg-gray-900/80 rounded-2xl border border-gray-700 shadow-xl backdrop-blur-md">
              <span className="text-xs font-bold uppercase tracking-widest bg-gray-800 text-gray-400 px-4 py-1.5 rounded-full mb-4 inline-block border border-gray-600">
                {currentLive.class_type}
              </span>
              <h1 className="text-2xl md:text-4xl font-bold text-white mb-3">{currentLive.title}</h1>
              <p className="text-gray-400 text-lg">මෙම පන්තිය අද දින <span className="text-yellow-400 font-bold">{currentLive.time}</span> ට ආරම්භ වීමට නියමිතයි.</p>
            </div>
          )}
        </div>
      )}

      {currentLive.status === 'live' && (
        <div 
          ref={playerContainerRef}
          className={`flex-1 flex flex-col rounded-2xl overflow-hidden bg-gray-900 border border-green-500/20 shadow-2xl relative ${isFullscreen ? 'h-screen w-screen rounded-none border-none' : ''}`}
        >
          {!isFullscreen && (
            <div className="bg-green-950/40 text-green-400 px-4 py-3 flex justify-between items-center font-semibold border-b border-green-500/10 text-sm md:text-base">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                සජීවී විකාශය ක්‍රියාත්මකයි: {currentLive.class_type} - {currentLive.title}
              </div>
              
              <button 
                onClick={toggleFullscreen}
                className="hidden md:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors text-xs font-bold shadow-md"
              >
                Full Screen
              </button>
            </div>
          )}

          <div className="w-full flex-1 min-h-[75vh] bg-black relative">
            <iframe 
              src={getEmbeddableZoomUrl(currentLive.zoom_join_url, currentUser.username)} 
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              sandbox="allow-forms allow-scripts allow-same-origin"
              className={`absolute inset-0 w-full h-full border-0 ${isFullscreen ? '' : 'rounded-b-2xl'} bg-white`}
              title="Zoom Web Client"
            />
            
            <button
              onClick={toggleFullscreen}
              className="absolute bottom-6 right-6 z-50 bg-black/70 hover:bg-black text-white px-4 py-2 rounded-full border border-gray-600 shadow-xl transition-all flex items-center gap-2 backdrop-blur-md"
            >
              {isFullscreen ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Exit Full Screen
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 md:hidden" viewBox="0 0 20 20" fill="currentColor">
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