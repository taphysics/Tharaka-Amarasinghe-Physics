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

// Zoom Web Client URL එක නිර්මාණය කිරීම සහ Passcode/Name Auto-fill කිරීම
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
    if (pwd) {
      url.searchParams.set('pwd', pwd);
    }
    url.searchParams.set('prefer', '1');
    return url.toString();
  } catch (error) {
    console.error('Invalid Zoom URL', error);
    return joinUrl;
  }
};

// Class Type එක අනුව වර්ණයක් ලබා දීමේ Function එක
const getClassColor = (type: string) => {
  const colors = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-purple-500/10 text-purple-400 border-purple-500/20',
    'bg-pink-500/10 text-pink-400 border-pink-500/20',
    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    'bg-green-500/10 text-green-400 border-green-500/20',
    'bg-rose-500/10 text-rose-400 border-rose-500/20',
    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  ];
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student | null }) => {
  const [allClasses, setAllClasses] = useState<ScheduledLive[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [viewState, setViewState] = useState<'loading' | 'live' | 'waiting-0s' | 'waiting-30m' | 'waiting-24h' | 'upcoming-list' | 'no-classes'>('loading');
  const [targetClass, setTargetClass] = useState<ScheduledLive | null>(null);
  const [timer, setTimer] = useState({ h: 0, m: 0, s: 0 });

  const studentName = currentUser?.username || 'Student';

  useEffect(() => {
    fetchClassData();
    
    // දත්ත ගබඩාවේ වෙනසක් වූ සැනින් යාවත්කාලීන වීම (Realtime updates)
    const subscription = supabase
      .channel('live-class-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scheduled_lives' },
        () => {
          fetchClassData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [currentUser]);

  const fetchClassData = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      let query = supabase
        .from('scheduled_lives')
        .select('*')
        .in('status', ['scheduled', 'live'])
        .gte('date', today);

      // සිසුවා තෝරාගෙන ඇති පන්ති වලට අදාළ දත්ත පමණක් පෙරීම (Filter by class_types)
      if (currentUser?.class_types && currentUser.class_types.length > 0) {
        query = query.in('class_type', currentUser.class_types);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        // කාලය අනුව නිවැරදිව පෙළගැස්වීම (Sorting by exact DateTime)
        const sortedData = data.sort((a, b) => {
          const timeA = parse(`${a.date} ${a.time}`, 'yyyy-MM-dd HH:mm', new Date()).getTime();
          const timeB = parse(`${b.date} ${b.time}`, 'yyyy-MM-dd HH:mm', new Date()).getTime();
          return timeA - timeB;
        });
        setAllClasses(sortedData);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Timer සහ UI View State පාලනය කරන ප්‍රධාන කොටස
  useEffect(() => {
    if (isLoading) return;
    
    if (allClasses.length === 0) {
      setViewState('no-classes');
      return;
    }

    const interval = setInterval(() => {
      // 1. දැනට ලයිව් එකක් ඇත්දැයි බැලීම
      const live = allClasses.find(c => c.status === 'live');
      if (live) {
        setTargetClass(live);
        setViewState('live');
        return;
      }

      // 2. ලයිව් නැත්නම්, මීළඟට නියමිත පන්තිය ලබා ගැනීම
      const nextScheduled = allClasses.find(c => c.status === 'scheduled');
      if (!nextScheduled) {
        setViewState('no-classes');
        return;
      }

      setTargetClass(nextScheduled);
      const classDateTime = parse(`${nextScheduled.date} ${nextScheduled.time}`, 'yyyy-MM-dd HH:mm', new Date());
      const now = new Date();
      const diffSeconds = differenceInSeconds(classDateTime, now);

      if (diffSeconds > 86400) { // පැය 24 ට වඩා වැඩි නම්
        setViewState('upcoming-list');
      } 
      else if (diffSeconds > 1800) { // විනාඩි 30 සිට පැය 24 දක්වා (වීඩියෝව නැත, සාමාන්‍ය කවුන්ඩවුන් එක)
        setViewState('waiting-24h');
        setTimer({
          h: Math.floor(diffSeconds / 3600),
          m: Math.floor((diffSeconds % 3600) / 60),
          s: diffSeconds % 60
        });
      } 
      else if (diffSeconds > 0) { // අවසන් විනාඩි 30 (වීඩියෝව සමග Pulsing කවුන්ඩවුන් එක)
        setViewState('waiting-30m');
        setTimer({ h: 0, m: Math.floor(diffSeconds / 60), s: diffSeconds % 60 });
      } 
      else { // තත්පර 0 වූ පසු (කවුන්ඩවුන් නැත, වීඩියෝව සහ පණිවිඩය පමණි)
        setViewState('waiting-0s');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [allClasses, isLoading]);


  if (isLoading || viewState === 'loading') {
    return (
      <div className="flex justify-center items-center h-screen bg-black text-white font-semibold">
        දත්ත පූරණය වෙමින් පවතී...
      </div>
    );
  }

  // 1. ඉදිරි දින සඳහා පන්ති නොමැති විට
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

  // 2. පැය 24 ට වඩා කල් ඇති පන්ති ලිස්ට් එක පෙන්වීම
  if (viewState === 'upcoming-list') {
    return (
      <div className="flex flex-col items-center min-h-screen bg-black text-white p-4 md:p-8">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-200 mb-8 mt-4 text-center">ඉදිරියේදී පැවැත්වීමට නියමිත පන්ති</h2>
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allClasses.filter(c => c.status === 'scheduled').map((cls, idx) => (
            <div key={idx} className={`p-6 rounded-2xl border bg-gray-900/80 shadow-lg ${getClassColor(cls.class_type)} border-opacity-30 hover:border-opacity-100 transition-all duration-300`}>
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-black/40 mb-4 inline-block shadow-sm">
                {cls.class_type}
              </span>
              <h3 className="text-xl text-white font-bold mb-4 line-clamp-2 leading-tight">{cls.title}</h3>
              <div className="flex flex-col gap-2 text-sm bg-black/20 p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">දිනය:</span>
                  <span className="text-gray-100 font-medium">{cls.date}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">වේලාව:</span>
                  <span className="text-gray-100 font-medium">{cls.time}</span>
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
      
      {/* 3. පැය 24 කවුන්ඩවුන් එක (වීඩියෝ නොමැතිව) */}
      {viewState === 'waiting-24h' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full h-[60vh] md:h-[75vh] bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl relative overflow-hidden">
          <div className="z-10 text-center p-6 flex flex-col items-center w-full max-w-2xl">
            <span className={`text-xs md:text-sm font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6 ${getClassColor(targetClass.class_type)}`}>
              {targetClass.class_type}
            </span>
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-6 md:mb-8 leading-tight">{targetClass.title}</h1>
            <p className="text-gray-400 mb-6 text-base md:text-lg">පන්තිය ආරම්භ වීමට තව...</p>
            
            <div className="flex gap-3 md:gap-6 text-center">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 md:w-24 md:h-24 bg-black border border-gray-700 rounded-xl flex items-center justify-center text-3xl md:text-5xl font-mono font-black text-white shadow-inner">
                  {String(timer.h).padStart(2, '0')}
                </div>
                <span className="text-gray-500 text-xs md:text-sm mt-2 font-medium">පැය</span>
              </div>
              <div className="text-3xl md:text-5xl font-black text-gray-700 mt-2 md:mt-4">:</div>
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 md:w-24 md:h-24 bg-black border border-gray-700 rounded-xl flex items-center justify-center text-3xl md:text-5xl font-mono font-black text-white shadow-inner">
                  {String(timer.m).padStart(2, '0')}
                </div>
                <span className="text-gray-500 text-xs md:text-sm mt-2 font-medium">විනාඩි</span>
              </div>
              <div className="text-3xl md:text-5xl font-black text-gray-700 mt-2 md:mt-4">:</div>
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 md:w-24 md:h-24 bg-black border border-gray-700 rounded-xl flex items-center justify-center text-3xl md:text-5xl font-mono font-black text-white shadow-inner">
                  {String(timer.s).padStart(2, '0')}
                </div>
                <span className="text-gray-500 text-xs md:text-sm mt-2 font-medium">තත්පර</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. අවසන් විනාඩි 30 (Video + Pulsing Countdown) */}
      {viewState === 'waiting-30m' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full h-[60vh] md:h-[75vh] relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl">
          <video 
            autoPlay loop muted playsInline controls={false}
            className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
          >
            <source src="/videos/waiting-video.mp4" type="video/mp4" />
          </video>
          <div className="relative z-10 flex flex-col items-center p-8 bg-black/60 rounded-3xl backdrop-blur-md border border-white/10 max-w-lg w-[90%] md:w-full mx-4 shadow-2xl">
            <span className={`text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5 shadow-sm ${getClassColor(targetClass.class_type)}`}>
              {targetClass.class_type}
            </span>
            <h2 className="text-lg md:text-xl text-gray-200 text-center mb-6 font-medium">
              පන්තිය ආරම්භ වීමට තව...
            </h2>
            <div className="text-6xl md:text-8xl font-mono font-black text-white tracking-wider drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] animate-pulse">
              {String(timer.m).padStart(2, '0')}:{String(timer.s).padStart(2, '0')}
            </div>
          </div>
        </div>
      )}

      {/* 5. තත්පර 0 වූ පසු ගුරුවරයා එනතෙක් රැඳී සිටීම (0s Threshold) */}
      {viewState === 'waiting-0s' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full h-[60vh] md:h-[75vh] relative rounded-2xl overflow-hidden bg-gray-950 border border-green-500/40 shadow-[0_0_40px_rgba(34,197,94,0.15)]">
          {/* මෙහිදී Video එක වඩාත් පැහැදිලිව පෙනීමට Opacity වැඩි කර ඇත */}
          <video 
            autoPlay loop muted playsInline controls={false}
            className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
          >
            <source src="/videos/waiting-video.mp4" type="video/mp4" />
          </video>
          <div className="relative z-10 flex flex-col items-center p-6 md:p-10 bg-black/70 rounded-3xl backdrop-blur-lg border border-green-500/30 max-w-xl w-[90%] md:w-full mx-4 text-center shadow-2xl">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-5 border border-green-500/30">
              <span className="relative flex h-6 w-6">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-6 w-6 bg-green-500"></span>
              </span>
            </div>
            <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3 ${getClassColor(targetClass.class_type)}`}>
              {targetClass.class_type}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 leading-tight">{targetClass.title}</h2>
            <div className="bg-green-500/10 px-5 py-3 rounded-xl border border-green-500/20 w-full">
              <p className="text-green-400 text-base md:text-lg font-medium">
                ගුරුවරයා පන්තිය ආරම්භ කරන තෙක් රැඳී සිටින්න...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 6. Live තත්ත්වයට පත් වූ විට (Zoom Player එක) */}
      {viewState === 'live' && targetClass && (
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-gray-900 border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
          <div className="bg-green-950/60 text-green-400 px-4 py-3 flex items-center gap-3 font-semibold border-b border-green-500/20 text-sm md:text-base">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            සජීවී විකාශය ක්‍රියාත්මකයි: {targetClass.class_type} - {targetClass.title}
          </div>
          
          <div className="w-full h-[70vh] md:h-[80vh] bg-white relative">
            <iframe 
              src={getEmbeddableZoomUrl(targetClass.zoom_join_url, studentName)} 
              allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *"
              allowFullScreen={true}
              // @ts-ignore - පරණ ජංගම දුරකථන බ්‍රවුසර් වල ෆුල්ස්ක්‍රීන් සහාය ලබා දීමට
              webkitallowfullscreen="true"
              // @ts-ignore
              mozallowfullscreen="true"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals"
              className="absolute inset-0 w-full h-full border-0 rounded-b-2xl"
              title="Zoom Web Client"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassPlayer;