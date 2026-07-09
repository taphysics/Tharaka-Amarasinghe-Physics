import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient'; // ඔබගේ supabase client path එකට වෙනස් කරගන්න
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
  target_month: string;
  status: string; // 'scheduled', 'live', 'ended'
  zoom_join_url: string;
  zoom_meeting_id: string;
}

const LiveClassPlayer = ({ currentUser }: { currentUser: Student }) => {
  const [currentLive, setCurrentLive] = useState<ScheduledLive | null>(null);
  const [nextLive, setNextLive] = useState<ScheduledLive | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<{ m: number; s: number } | null>(null);
  const [isWithinOneHour, setIsWithinOneHour] = useState<boolean>(false);

  // දත්ත ලබා ගැනීම සහ ප්‍රවේශය පරීක්ෂා කිරීම
  useEffect(() => {
    fetchClassData();
    
    // Supabase Realtime Subscription (ඇඩ්මින් පන්තිය start/end කරන විට ක්ෂණිකව වෙනස් වීමට)
    const subscription = supabase
      .channel('live-class-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scheduled_lives' },
        (payload) => {
          if (currentLive && payload.new.id === currentLive.id) {
            setCurrentLive(payload.new as ScheduledLive);
            if (payload.new.status === 'ended') {
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
      const currentMonth = format(today, 'MMMM').toLowerCase();

      // අද දිනට නියමිත හෝ දැනට live පවතින පන්තිය ලබා ගැනීම
      const { data: liveData, error: liveError } = await supabase
        .from('scheduled_lives')
        .select('*')
        .eq('date', currentDateString)
        .in('status', ['scheduled', 'live'])
        .order('time', { ascending: true })
        .limit(1)
        .single();

      if (liveData) {
        setCurrentLive(liveData);
        await checkStudentAccess(liveData, currentMonth);
      } else {
        // අද දින පන්ති නොමැති නම් ඊළඟ පන්තිය පෙන්වන්න
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
      .single();
    
    if (data) setNextLive(data);
  };

  const checkStudentAccess = async (liveClass: ScheduledLive, currentMonth: string) => {
    // 1. Free/Active මාස පරීක්ෂා කිරීම
    const hasFreeAccess = currentUser.free_months?.includes(currentMonth) && currentUser.class_types?.includes(liveClass.class_type);

    // 2. ගෙවීම් පරීක්ෂා කිරීම (payments table)
    const { data: payment } = await supabase
      .from('payments')
      .select('status')
      .eq('username', currentUser.username)
      .eq('class_type', liveClass.class_type)
      .eq('target_month', currentMonth)
      .eq('status', 'paid')
      .single();

    if (hasFreeAccess || payment) {
      setHasAccess(true);
    } else {
      setHasAccess(false);
    }
  };

  // Countdown Logic (පැයකට පෙර)
  useEffect(() => {
    if (!currentLive || currentLive.status !== 'scheduled') return;

    const interval = setInterval(() => {
      const classDateTime = parse(`${currentLive.date} ${currentLive.time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
      const now = new Date();
      const diffSeconds = differenceInSeconds(classDateTime, now);

      if (diffSeconds > 0 && diffSeconds <= 3600) { // පැයකට (තත්පර 3600) අඩු නම්
        setIsWithinOneHour(true);
        setCountdown({
          m: Math.floor(diffSeconds / 60),
          s: diffSeconds % 60,
        });
      } else if (diffSeconds <= 0) {
        setCountdown({ m: 0, s: 0 });
        // මෙහිදී real-time update එක හරහා ඇඩ්මින් start කරන තුරු රැඳී සිටියි
      } else {
        setIsWithinOneHour(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentLive]);


  // UI Render Components
  if (isLoading) {
    return <div className="flex justify-center items-center h-screen text-white">Loading...</div>;
  }

  // ගෙවීම් කර නොමැති විට හෝ අදාළ පන්තියට ලියාපදිංචි වී නොමැති විට
  if (currentLive && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-red-500 p-6 text-center rounded-lg">
        <h2 className="text-2xl font-bold mb-2">Access Denied (ප්‍රවේශය තහනම්)</h2>
        <p>ඔබ මෙම මාසය සඳහා ({currentLive.target_month}) අදාළ {currentLive.class_type} පන්තියට මුදල් ගෙවා නොමැත හෝ ලියාපදිංචි වී නොමැත. කරුණාකර ගෙවීම් සම්පූර්ණ කරන්න.</p>
      </div>
    );
  }

  // පන්තිය අවසන් වී ඇති විට හෝ අද දින පන්ති නොමැති විට
  if (!currentLive || currentLive.status === 'ended') {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] bg-gray-900 text-white rounded-xl p-8 border border-gray-800 shadow-lg">
        <h2 className="text-2xl font-bold text-gray-300 mb-6">අද දිනට නියමිත සජීවී පන්ති නොමැත</h2>
        {nextLive && (
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md text-center border border-gray-700">
            <h3 className="text-xl text-blue-400 font-semibold mb-4">මීළඟ පන්තිය</h3>
            <p className="text-lg font-bold mb-2">{nextLive.class_type}</p>
            <p className="text-gray-400">දිනය: {nextLive.date}</p>
            <p className="text-gray-400">වේලාව: {nextLive.time}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
      {/* පන්තිය Scheduled අවස්ථාවේ (පටන් ගෙන නොමැති විට) */}
      {currentLive.status === 'scheduled' && (
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-2xl overflow-hidden bg-gray-900 shadow-2xl border border-gray-800">
          
          {isWithinOneHour ? (
            <>
              {/* Waiting Video - ස්වයංක්‍රීයව Play වේ */}
              <video 
                autoPlay 
                loop 
                muted 
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
              >
                <source src="/videos/waiting-video.mp4" type="video/mp4" />
              </video>

              {/* Countdown Overlay */}
              <div className="relative z-10 flex flex-col items-center p-8 bg-black/60 rounded-2xl backdrop-blur-sm border border-white/10">
                <h1 className="text-3xl md:text-5xl font-extrabold text-blue-500 mb-2">
                  {currentLive.class_type}
                </h1>
                <h2 className="text-xl md:text-2xl text-gray-200 mb-8">
                  පන්තිය ආරම්භ වීමට තව...
                </h2>
                <div className="text-6xl md:text-8xl font-mono font-bold text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
                  {countdown ? (
                    `${String(countdown.m).padStart(2, '0')}:${String(countdown.s).padStart(2, '0')}`
                  ) : (
                    "00:00"
                  )}
                </div>
                {countdown?.m === 0 && countdown?.s === 0 && (
                  <p className="mt-6 text-green-400 animate-pulse text-lg font-semibold">
                    ඇඩ්මින් විසින් පන්තිය ආරම්භ කරන තුරු රැඳී සිටින්න...
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="z-10 text-center">
              <h1 className="text-3xl font-bold text-gray-300 mb-4">{currentLive.class_type}</h1>
              <p className="text-xl text-gray-400">පන්තිය අද දින {currentLive.time} ට ආරම්භ වේ.</p>
            </div>
          )}
        </div>
      )}

      {/* පන්තිය Live අවස්ථාවේ (ඇඩ්මින් Start කළ පසු) */}
      {currentLive.status === 'live' && (
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-gray-900 border border-green-500/30">
          <div className="bg-green-600/20 text-green-400 px-4 py-2 flex items-center gap-3 font-semibold border-b border-green-500/20">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            LIVE NOW: {currentLive.class_type} - {currentLive.title}
          </div>
          
          {/* Zoom Integration Area */}
          <div className="w-full h-full flex-1 min-h-[60vh] bg-black relative">
            {/* මෙතනට ඔබේ Zoom Web SDK component එක හෝ iframe එක භාවිතා කරන්න.
              උදාහරණයක් ලෙස iframe එකක් භාවිතා කරන්නේ නම්:
            */}
            <iframe 
              src={currentLive.zoom_join_url} 
              allow="camera; microphone; fullscreen; display-capture"
              className="absolute inset-0 w-full h-full border-0"
              title="Zoom Live Class"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassPlayer;