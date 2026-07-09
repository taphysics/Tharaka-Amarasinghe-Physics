import React, { useState, useEffect } from 'react';
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

const LiveClassPlayer = ({ currentUser }: { currentUser: Student }) => {
  const [currentLive, setCurrentLive] = useState<ScheduledLive | null>(null);
  const [nextLive, setNextLive] = useState<ScheduledLive | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<{ m: number; s: number } | null>(null);
  const [isWithinOneHour, setIsWithinOneHour] = useState<boolean>(false);

  useEffect(() => {
    fetchClassData();
    
    // Supabase Realtime Subscription - ඇඩ්මින් පන්තිය start/end කළ සැනින් update වීමට
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

  const fetchClassData = async () => {
    setIsLoading(true);
    try {
      const today = new Date();
      const currentDateString = format(today, 'yyyy-MM-dd');

      // අද දිනට නියමිත හෝ දැනට සජීවීව පවතින පන්තිය ලබා ගැනීම
      const { data: liveData, error: liveError } = await supabase
        .from('scheduled_lives')
        .select('*')
        .eq('date', currentDateString)
        .in('status', ['scheduled', 'live'])
        .order('time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (liveData) {
        // මුදල් ගෙවීම් පරීක්ෂාව ඉවත් කර ඇත. කෙලින්ම පන්තිය පෙන්වයි.
        setCurrentLive(liveData);
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

  // Countdown මැනීමේ කොටස
  useEffect(() => {
    if (!currentLive || currentLive.status !== 'scheduled') return;

    const interval = setInterval(() => {
      // 24-hour формат එකට ගැලපෙන සේ parse කිරීම (HH:mm)
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-black text-white font-semibold">
        දත්ත පූරණය වෙමින් පවතී...
      </div>
    );
  }

  // පන්ති අවසන් වූ පසු හෝ අද දිනට පන්ති නොමැති විට මීළඟ පන්තිය පෙන්වීම
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
      {/* 1. Scheduled තත්ත්වයේ පවතින විට (පන්තිය පටන් ගැනීමට පෙර) */}
      {currentLive.status === 'scheduled' && (
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-2xl overflow-hidden bg-gray-900 min-h-[65vh] border border-gray-800 shadow-2xl">
          {isWithinOneHour ? (
            <>
              {/* Waiting Video එක ස්වයංක්‍රීයව Play වීම */}
              <video 
                autoPlay 
                loop 
                muted 
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
              >
                <source src="/videos/waiting-video.mp4" type="video/mp4" />
              </video>

              {/* Countdown Overlay */}
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

      {/* 2. Live තත්ත්වයට පත් වූ විට (ඇඩ්මින් Start Zoom ක්ලික් කළ පසු) */}
      {currentLive.status === 'live' && (
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-gray-900 border border-green-500/20 shadow-2xl">
          <div className="bg-green-950/40 text-green-400 px-4 py-3 flex items-center gap-3 font-semibold border-b border-green-500/10 text-sm md:text-base">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            සජීවී විකාශය ක්‍රියාත්මකයි: {currentLive.class_type} - {currentLive.title}
          </div>
          
          {/* Zoom Player Area */}
          <div className="w-full flex-1 min-h-[65vh] bg-black relative">
            <iframe 
              src={currentLive.zoom_join_url} 
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="absolute inset-0 w-full h-full border-0"
              title="Zoom Live Stream"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassPlayer;