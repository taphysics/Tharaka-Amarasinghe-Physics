import { supabase } from '../supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import screenfull from 'screenfull';
import { 
  Play, Lock, ArrowLeft, Pause, Maximize, X, 
  Rewind, FastForward, Settings, Volume2, VolumeX, RotateCcw, ChevronRight 
} from 'lucide-react';

interface StudentRecordingsProps {
  student: any; 
  onBack: () => void; 
}

export default function StudentRecordings({ student, onBack }: StudentRecordingsProps) {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [availableMonths, setAvailableMonths] = useState<{year: string, month: string}[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('current');
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, boolean>>({});
  const [watchHistory, setWatchHistory] = useState<Record<string, any>>({});
  
  // Player State
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false); 
  const [hasEnded, setHasEnded] = useState(false);
  const [showControls, setShowControls] = useState(true); // For Mobile Support
  
  // Custom Controls State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  
  // Settings Dropdown Menu State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsMenuMode, setSettingsMenuMode] = useState<'main' | 'speed' | 'quality'>('main');
  const [currentQuality, setCurrentQuality] = useState('hd1080');
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);

  // Realtime Watch Tracking Refs
  const currentViewRecordIdRef = useRef<string | null>(null);
  const totalWatchedSecondsRef = useRef<number>(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentYear = new Date().getFullYear().toString();
  const currentMonthNumStr = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  // Load YouTube Iframe API
  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const handleOutsideClose = (event: MouseEvent | TouchEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClose);
    document.addEventListener('touchstart', handleOutsideClose);
    
    return () => {
      document.removeEventListener('mousedown', handleOutsideClose);
      document.removeEventListener('touchstart', handleOutsideClose);
    };
  }, []);

  useEffect(() => {
    if (student) {
      fetchRecordingsAndPayments();
    }
    return () => {
      stopWatchTimeTracking().catch(console.error);
    };
  }, [student, selectedFilter]);

  useEffect(() => {
    if (isPlaying && selectedVideo && isReady && !hasEnded) {
      startWatchTimeTracking();
    } else {
      stopWatchTimeTracking().catch(console.error);
    }
    return () => { stopWatchTimeTracking().catch(console.error); };
  }, [isPlaying, selectedVideo, isReady, hasEnded]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && isReady && !hasEnded) {
      interval = setInterval(() => {
        if (ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
          setCurrentTime(ytPlayerRef.current.getCurrentTime());
          setDuration(ytPlayerRef.current.getDuration() || 0);
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isReady, hasEnded]);

  // Handle Mobile / Desktop Controls auto-hide
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isSettingsOpen) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    if (isPlaying) {
      resetControlsTimeout();
    } else {
      setShowControls(true);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, isSettingsOpen]);

  const isCurrentVideoUnlocked = selectedVideo 
    ? paymentStatuses[`${selectedVideo.class_type}-${selectedVideo.year}-${selectedVideo.month}`] || false
    : false;

  useEffect(() => {
    const selectedYtId = selectedVideo ? getYouTubeId(selectedVideo) : null;
    if (!selectedVideo || !selectedYtId || !isCurrentVideoUnlocked) return;

    let player: any;

    const initPlayer = () => {
      player = new (window as any).YT.Player('youtube-player-container', {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0, 
          disablekb: 1, 
          fs: 0, 
          rel: 0, 
          modestbranding: 1,
          enablejsapi: 1,
          iv_load_policy: 3,
          showinfo: 0,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event: any) => {
            setIsReady(true);
            setIsPlaying(true);
            setHasEnded(false);
            
            // Forcing 1080p quality via loadVideoById Workaround
            event.target.loadVideoById({
              videoId: selectedYtId,
              suggestedQuality: 'hd1080'
            });

            event.target.setVolume(volume);
            
            setTimeout(() => {
              if (event.target.getAvailableQualityLevels) {
                const qualities = event.target.getAvailableQualityLevels();
                setAvailableQualities(qualities);
                if (qualities.includes('hd1080')) setCurrentQuality('hd1080');
              }
            }, 1000);
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === (window as any).YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setHasEnded(false);
              setDuration(player.getDuration());
              
              if (currentQuality !== 'Auto') {
                 player.setPlaybackQuality(currentQuality);
              }
            } else if (state === (window as any).YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              setShowControls(true);
            } else if (state === (window as any).YT.PlayerState.ENDED) {
              setIsPlaying(false);
              setHasEnded(true);
              setShowControls(true);
              stopWatchTimeTracking().catch(console.error);
            }
          }
        }
      });
      ytPlayerRef.current = player;
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (ytPlayerRef.current && ytPlayerRef.current.destroy) {
        ytPlayerRef.current.destroy();
        ytPlayerRef.current = null;
      }
    };
  }, [selectedVideo]);

  const fetchRecordingsAndPayments = async () => {
    try {
      const studentClasses = student.class_types || [];
      if (studentClasses.length === 0) {
        setRecordings([]);
        return;
      }

      const { data: recData, error: recError } = await supabase
        .from('recordings') 
        .select('*')
        .in('class_type', studentClasses)
        .order('created_at', { ascending: true }); 
      
      if (recError) throw recError;

      if (recData) {
        setRecordings(recData);
        const monthsList = Array.from(new Set<string>(recData.map((r: any) => `${r.year}-${r.month}`)))
          .map((str: string) => {
            const [y, m] = str.split('-');
            return { year: y, month: m };
          });
        setAvailableMonths(monthsList);
      }

      const { data: viewsData, error: viewsError } = await supabase
        .from('recording_views')
        .select('*')
        .eq('username', student.username);

      if (!viewsError && viewsData) {
        const historyMap: Record<string, any> = {};
        viewsData.forEach((view: any) => {
          historyMap[view.recording_id] = view;
        });
        setWatchHistory(historyMap);
      }

      const { data: payData, error: payError } = await supabase
        .from('payments')
        .select('*')
        .eq('username', student.username);

      if (payError) throw payError;

      const statusMap: Record<string, boolean> = {};
      
      const formatYearMonth = (year: any, month: any) => {
        let yStr = String(year).trim();
        let mStr = String(month).trim();
        const monthMap: Record<string, string> = {
            'january': '01', 'jan': '01', '1': '01', 'february': '02', 'feb': '02', '2': '02',
            'march': '03', 'mar': '03', '3': '03', 'april': '04', 'apr': '04', '4': '04',
            'may': '05', '5': '05', 'june': '06', 'jun': '06', '6': '06',
            'july': '07', 'jul': '07', '7': '07', 'august': '08', 'aug': '08', '8': '08',
            'september': '09', 'sep': '09', '9': '09', 'october': '10', 'oct': '10', 
            'november': '11', 'nov': '11', 'december': '12', 'dec': '12'
        };
        const mappedMonth = monthMap[mStr.toLowerCase()] || mStr.padStart(2, '0');
        return `${yStr}-${mappedMonth}`;
      };

      if (recData) {
        recData.forEach((rec: any) => {
          const recMonthStr = String(rec.month).trim();
          const recYearMonthStr = `${rec.year}-${rec.month}`;
          const standardizedDbMonth = formatYearMonth(rec.year, rec.month); 

          const isGloballyFree = student.plan_type?.toLowerCase() === 'free'; 
          const isThisMonthFree = student.free_months?.includes(recMonthStr) || 
                                  student.free_months?.includes(recYearMonthStr) || 
                                  student.free_months?.includes(standardizedDbMonth);
          
          const paymentRecord = payData?.find((p: any) => {
            const pClass = String(p.class_type || p.class_name || "").toLowerCase().trim();
            const rClass = String(rec.class_type || "").toLowerCase().trim();
            const isClassMatch = pClass === rClass || pClass.includes(rClass) || rClass.includes(pClass);
            
            const pTargetMonth = String(p.target_month || "").trim();
            const pMonth = String(p.month || "").trim();

            return isClassMatch && (pTargetMonth === standardizedDbMonth || pMonth === standardizedDbMonth || pTargetMonth === recMonthStr);
          });
          
          const pStatus = paymentRecord?.status?.toLowerCase()?.trim();
          const isPaid = pStatus === 'paid' || pStatus === 'free' || pStatus === 'approved' || pStatus === 'success';
          
          statusMap[`${rec.class_type}-${rec.year}-${rec.month}`] = isGloballyFree || isThisMonthFree || isPaid; 
        });
      }
      setPaymentStatuses(statusMap);
    } catch (error) {
      console.error("Error fetching recordings & payments:", error);
    }
  };

  // මෙය පවතින startWatchTimeTracking ශ්‍රිතය වෙනුවට ආදේශ කරන්න
const startWatchTimeTracking = async () => {
  if (!selectedVideo || !student) return;
  
  // කලින් තිබූ ඉන්ටර්වල් එක නතර කරන්න
  if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);

  try {
    // 1. දැනටමත් පවතින රෙකෝඩ් එකක් ඇත්දැයි බැලීම
    const { data: existingView, error: fetchError } = await supabase
      .from('recording_views')
      .select('id, watched_seconds')
      .eq('recording_id', selectedVideo.id)
      .eq('username', student.username)
      .maybeSingle();

    if (existingView) {
      currentViewRecordIdRef.current = existingView.id;
      totalWatchedSecondsRef.current = existingView.watched_seconds || 0;
    } else {
      // 2. අලුත් රෙකෝඩ් එකක් සෑදීම
      const { data: newRec, error: insertError } = await supabase
        .from('recording_views')
        .insert({ 
          recording_id: selectedVideo.id, 
          username: student.username, 
          watched_seconds: 0,
          last_watched_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (newRec) {
        currentViewRecordIdRef.current = newRec.id;
        totalWatchedSecondsRef.current = 0;
        // ස්ටේට් එක අප්ඩේට් කරන්න
        setWatchHistory(prev => ({ ...prev, [selectedVideo.id]: { watched_seconds: 0 } }));
      }
    }

    // 3. සෑම තත්පර 10 කට වරක්ම සුපබේස් වෙත දත්ත යැවීම (වඩාත් නිවැරදි වීමට)
    syncIntervalRef.current = setInterval(async () => {
      if (isPlaying && !hasEnded && currentViewRecordIdRef.current) {
        totalWatchedSecondsRef.current += 10; // සෑම තත්පර 10කදී 10ක් එකතු වේ
        
        await supabase
          .from('recording_views')
          .update({ 
            watched_seconds: totalWatchedSecondsRef.current, 
            last_watched_at: new Date().toISOString() 
          })
          .eq('id', currentViewRecordIdRef.current);
      }
    }, 10000); 

  } catch (err) {
    console.error("Error starting tracking:", err);
  }
};

  const stopWatchTimeTracking = async () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    if (currentViewRecordIdRef.current && totalWatchedSecondsRef.current > 0) {
      await supabase
        .from('recording_views')
        .update({ watched_seconds: totalWatchedSecondsRef.current, last_watched_at: new Date().toISOString() })
        .eq('id', currentViewRecordIdRef.current);
      
      const { data: viewsData } = await supabase
        .from('recording_views')
        .select('*')
        .eq('username', student.username);
        
      if (viewsData) {
        const historyMap: Record<string, any> = {};
        viewsData.forEach((view: any) => { historyMap[view.recording_id] = view; });
        setWatchHistory(historyMap);
      }
    }
  };

  const getYouTubeId = (video: any) => {
    if (!video) return null;
    const rawInput = String(video.video_url || video.youtube_id || video.url || '');
    const match = rawInput.replace(/[\s"']/g, '').match(/(?:v=|embed\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const getVideoThumbnail = (video: any) => {
    if (video.thumbnail_url) return video.thumbnail_url;
    const vidId = getYouTubeId(video);
    return vidId ? `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg` : 'https://via.placeholder.com/640x360.png?text=Video+Recording';
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!ytPlayerRef.current || !isCurrentVideoUnlocked) return;
    if (isPlaying) {
      ytPlayerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      ytPlayerRef.current.playVideo();
      setIsPlaying(true);
      setHasEnded(false);
    }
    resetControlsTimeout();
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ytPlayerRef.current) return;
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    ytPlayerRef.current.seekTo(newTime, true);
    resetControlsTimeout();
  };

  const seekForward = () => {
    if (!ytPlayerRef.current) return;
    const target = Math.min(duration, ytPlayerRef.current.getCurrentTime() + 10);
    setCurrentTime(target);
    ytPlayerRef.current.seekTo(target, true);
    resetControlsTimeout();
  };

  const seekBackward = () => {
    if (!ytPlayerRef.current) return;
    const target = Math.max(0, ytPlayerRef.current.getCurrentTime() - 10);
    setCurrentTime(target);
    ytPlayerRef.current.seekTo(target, true);
    resetControlsTimeout();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseInt(e.target.value);
    setVolume(newVol);
    if (ytPlayerRef.current) {
      ytPlayerRef.current.setVolume(newVol);
      if (newVol > 0) {
        ytPlayerRef.current.unMute();
        setIsMuted(false);
      }
    }
    resetControlsTimeout();
  };

  const toggleMute = () => {
    if (!ytPlayerRef.current) return;
    if (isMuted) {
      ytPlayerRef.current.unMute();
      ytPlayerRef.current.setVolume(volume || 50);
      setIsMuted(false);
    } else {
      ytPlayerRef.current.mute();
      setIsMuted(true);
    }
    resetControlsTimeout();
  };

  const handleSpeedSelect = (speed: number) => {
    setPlaybackRate(speed);
    if (ytPlayerRef.current && ytPlayerRef.current.setPlaybackRate) {
      ytPlayerRef.current.setPlaybackRate(speed);
    }
    setIsSettingsOpen(false);
    resetControlsTimeout();
  };

  // 1080p Workaround function implemented here as well
  const handleQualitySelect = (quality: string) => {
    setCurrentQuality(quality);
    if (ytPlayerRef.current && ytPlayerRef.current.loadVideoById) {
      const currentVidTime = ytPlayerRef.current.getCurrentTime();
      ytPlayerRef.current.loadVideoById({
         videoId: getYouTubeId(selectedVideo),
         startSeconds: currentVidTime,
         suggestedQuality: quality
      });
    }
    setIsSettingsOpen(false);
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    const playerEl = document.getElementById('custom-player-wrapper');
    if (playerEl && screenfull.isEnabled) {
      screenfull.toggle(playerEl);
    }
    resetControlsTimeout();
  };

  const filteredRecordings = recordings.filter((r: any) => {
    if (selectedFilter === 'current') {
        return r.year === currentYear && (
            r.month === currentMonthNumStr || r.month === currentMonthName || r.month === String(new Date().getMonth() + 1)
        );
    }
    const [fYear, fMonth] = selectedFilter.split('-');
    return r.year === fYear && r.month === fMonth;
  });

  const groupedRecordings = filteredRecordings.reduce((acc: any, video: any) => {
    acc[video.class_type] = acc[video.class_type] || [];
    acc[video.class_type].push(video);
    return acc;
  }, {} as Record<string, any[]>);

  const getNextVideo = () => {
    if (!selectedVideo) return null;
    const currentIndex = filteredRecordings.findIndex(v => v.id === selectedVideo.id);
    if (currentIndex !== -1 && currentIndex < filteredRecordings.length - 1) {
      return filteredRecordings[currentIndex + 1];
    }
    return null;
  };
  const nextVideo = getNextVideo();

  const sliderPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const playerLineStyle = {
    background: `linear-gradient(to right, #64748b 0%, #64748b ${sliderPercentage}%, #3b82f6 ${sliderPercentage}%, #3b82f6 100%)`
  };

  return (
    <div className="bg-slate-950 min-h-screen text-white p-4 md:p-8 animate-in fade-in duration-500">
      
      <style>{`
        @keyframes unwatched-glow {
          0%, 100% { border-color: rgba(16, 185, 129, 0.6); box-shadow: 0 0 10px rgba(16, 185, 129, 0.2); }
          50% { border-color: rgba(52, 211, 153, 1); box-shadow: 0 0 18px rgba(52, 211, 153, 0.5); }
        }
        .animate-unwatched { animation: unwatched-glow 2.5s infinite ease-in-out; }
        @keyframes pulse-red-dot {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 8px #ef4444; }
        }
        .animate-dot-red { animation: pulse-red-dot 1.5s infinite ease-in-out; }
        .custom-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #ef4444 !important; cursor: pointer;
          border: 2px solid #ffffff; transition: transform 0.1s;
        }
        .custom-slider::-moz-range-thumb {
          width: 14px; height: 14px; border: 2px solid #ffffff;
          border-radius: 50%; background: #ef4444 !important; cursor: pointer;
        }
        .custom-slider::-webkit-slider-thumb:hover { transform: scale(1.25); }
      `}</style>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-full transition flex items-center justify-center">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-400">Class Recordings</h1>
            <p className="text-slate-400 text-sm mt-1">ඔබේ පන්තිවල මඟහැරුණු කොටස් මෙතැනින් නරඹන්න</p>
          </div>
        </div>

        <select 
          value={selectedFilter} onChange={(e) => setSelectedFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white px-4 py-2 rounded-xl focus:outline-none focus:border-blue-500"
        >
          <option value="current">මෙම මාසය ({currentYear} {currentMonthName})</option>
          {availableMonths.map((m, idx) => (
            <option key={idx} value={`${m.year}-${m.month}`}>{m.year} - {m.month}</option>
          ))}
        </select>
      </div>

      {/* Grid Dashboard */}
{Object.keys(groupedRecordings).length === 0 ? (
  <div className="text-center py-20 text-slate-500">මෙම මාසය සඳහා වීඩියෝ කිසිවක් ලබා දී නොමැත.</div>
) : (
  Object.entries(groupedRecordings).map(([classType, videos]: [string, any]) => (
    <div key={classType} className="mb-10">
      <h2 className="text-xl font-bold text-emerald-400 mb-4 border-b border-slate-800 pb-2">{classType}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {videos.map((video: any) => {
          const isUnlocked = paymentStatuses[`${video.class_type}-${video.year}-${video.month}`] || false;
          
          const viewRecord = watchHistory[video.id];
          const watchedSeconds = viewRecord ? viewRecord.watched_seconds : 0;
          const videoTotalDuration = video.duration || video.duration_seconds || 3600; 
          
          // වීඩියෝව නැරඹූ තත්ත්වය නිවැරදිව තීරණය කිරීම
          let watchState: 'unwatched' | 'partial' | 'completed' = 'unwatched';
          if (viewRecord && watchedSeconds > 0) {
            // 85% වඩා වැඩි නම් completed ලෙස සලකන්න (මෙහි අගය ඔබට අවශ්‍ය පරිදි වෙනස් කළ හැක)
            if (watchedSeconds >= (videoTotalDuration * 0.85)) {
              watchState = 'completed';
            } else {
              watchState = 'partial';
            }
          }

          const thumbnailProgressPercent = videoTotalDuration > 0 ? Math.min((watchedSeconds / videoTotalDuration) * 100, 100) : 0;

          return (
            <div 
              key={video.id}
              onClick={async () => {
                if (!isUnlocked) return;
                setSelectedVideo(video);
                setIsReady(false);
                setHasEnded(false);
                setShowControls(true);
                
                if (!watchHistory[video.id]) {
                   setWatchHistory(prev => ({
                     ...prev,
                     [video.id]: { recording_id: video.id, watched_seconds: 0 }
                   }));
                   await supabase.from('recording_views').insert({
                      recording_id: video.id,
                      username: student.username,
                      watched_seconds: 1,
                      views: 1
                   });
                }
              }}
              className={`relative group rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl ${
                !isUnlocked 
                  ? 'border-red-900/40 opacity-75' 
                  : watchState === 'unwatched'
                  ? 'border-emerald-500 animate-unwatched bg-slate-900'
                  : 'border-slate-800 bg-slate-900 hover:border-blue-500'
              }`}
            >
              <div className="relative aspect-video bg-slate-950">
                <img src={getVideoThumbnail(video)} alt={video.title} className="w-full h-full object-cover" />
                
                {/* NEW / UNWATCHED Badge */}
                {isUnlocked && watchState === 'unwatched' && (
                  <div className="absolute top-2 left-2 bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow z-10 uppercase tracking-wider">
                    NEW / UNWATCHED
                  </div>
                )}

                {/* Progress Bar - පෙන්වන්නේ partial නම් පමණි */}
                {isUnlocked && watchState === 'partial' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-800/80 z-20">
                    <div className="h-full bg-red-600 relative transition-all duration-300" style={{ width: `${thumbnailProgressPercent}%` }}>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-dot-red" />
                    </div>
                  </div>
                )}

                {!isUnlocked ? (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
                    <Lock className="w-8 h-8 text-red-500 mb-1" />
                    <span className="text-red-400 font-bold text-xs">ගෙවීම් කර නොමැත</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-12 h-12 text-white" fill="currentColor" />
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-slate-900">
                <h3 className="text-white font-medium text-sm line-clamp-1">{video.title}</h3>
                
                {/* Status Text - completed නම් partial පණිවිඩය පෙන්වන්නේ නැත */}
                {isUnlocked && watchState === 'partial' && (
                  <p className="text-red-400 font-semibold text-[11px] mt-1">බාගෙට නරඹා ඇත (Partially Watched)</p>
                )}
                {isUnlocked && watchState === 'completed' && (
                  <p className="text-emerald-400 font-semibold text-[11px] mt-1">සම්පූර්ණයෙන්ම නරඹා ඇත</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ))
)}

      {/* Custom Player Window */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-2 md:p-6 animate-in zoom-in duration-200">
          
          <div className="w-full max-w-5xl flex justify-between items-center mb-3 px-1">
            <h3 className="text-slate-200 font-semibold text-base truncate max-w-[80%]">{selectedVideo.title}</h3>
            <button 
              onClick={() => { 
                stopWatchTimeTracking().catch(console.error); 
                setSelectedVideo(null); 
                setIsPlaying(false); 
                setIsReady(false);
                setHasEnded(false);
                if (screenfull.isEnabled && screenfull.isFullscreen) screenfull.exit(); 
              }}
              className="bg-slate-900 text-slate-400 hover:text-white rounded-full w-9 h-9 flex items-center justify-center transition"
            >
              <X size={18} />
            </button>
          </div>

          <div 
            id="custom-player-wrapper" 
            className="w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden relative border border-slate-800 shadow-2xl"
            onMouseMove={resetControlsTimeout}
            onClick={resetControlsTimeout}
            onTouchStart={resetControlsTimeout}
          >
            
            {!isCurrentVideoUnlocked ? (
              <div className="absolute inset-0 bg-slate-950 z-40 flex flex-col items-center justify-center p-6 text-center select-none">
                <Lock className="w-16 h-16 text-red-500 mb-4 animate-bounce" />
                <h2 className="text-xl font-bold text-red-400 mb-2">වීඩියෝව අක්‍රීය කර ඇත (Player Disabled)</h2>
              </div>
            ) : (
              <>
                {!isReady && !hasEnded && (
                  <div className="absolute inset-0 z-30 bg-black flex flex-col items-center justify-center pointer-events-none">
                    <div className="w-10 h-10 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin mb-3"></div>
                    <p className="text-slate-500 text-xs tracking-wider">වීඩියෝව සූදානම් වෙමින් පවතී (1080p HD)...</p>
                  </div>
                )}

                {hasEnded && (
                  <div className="absolute inset-0 bg-slate-950/95 z-30 flex flex-col items-center justify-center p-4 text-center select-none animate-in fade-in duration-300">
                    {nextVideo ? (
                      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4">
                        <span className="text-blue-400 text-xs font-bold uppercase tracking-widest block mb-2">ඊළඟ රෙකෝඩින් වීඩියෝව</span>
                        <div className="relative aspect-video rounded-xl overflow-hidden mb-3">
                          <img src={getVideoThumbnail(nextVideo)} alt={nextVideo.title} className="w-full h-full object-cover" />
                          <button 
                            onClick={() => {
                              setSelectedVideo(nextVideo);
                              setIsReady(false);
                              setHasEnded(false);
                              setShowControls(true);
                            }}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center hover:bg-black/20 transition duration-300 group/btn"
                          >
                            <div className="bg-blue-500 p-4 rounded-full shadow-lg group-hover/btn:scale-110 transition"><Play size={24} fill="white" /></div>
                          </button>
                        </div>
                        <h4 className="text-white text-sm font-medium line-clamp-1 mb-3">{nextVideo.title}</h4>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <p className="text-slate-400 text-sm mb-4">මෙම කොටස සඳහා නැරඹීමට තවත් ඉදිරි වීඩියෝ නොමැත.</p>
                        <button 
                          onClick={() => {
                            if (ytPlayerRef.current) {
                              ytPlayerRef.current.seekTo(0);
                              ytPlayerRef.current.playVideo();
                              setHasEnded(false);
                              setIsPlaying(true);
                            }
                          }}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition shadow-lg"
                        >
                          <RotateCcw size={16} /> නැවත මුල සිට බලන්න (Replay)
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="w-full h-full pointer-events-none z-0">
                  <div id="youtube-player-container" className="w-full h-full"></div>
                </div>

                <div className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                  {!isPlaying && isReady && !hasEnded && showControls && (
                    <div className="bg-black/50 p-4 rounded-full text-white animate-pulse"><Play size={28} fill="white" /></div>
                  )}
                </div>

                <div className="absolute inset-0 z-15 pointer-events-none flex items-center justify-center opacity-[0.03] select-none">
                  <p className="text-white text-2xl md:text-4xl font-extrabold rotate-[-25deg] tracking-widest">{student.username}</p>
                </div>

                {/* Mobile & Desktop Supported Controls Bar */}
                <div 
                  className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-14 pb-3 px-4 z-20 transition-opacity duration-300 ${
                    showControls ? 'opacity-100 visible' : 'opacity-0 invisible'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  
                  <div className="w-full relative flex items-center mb-3.5 group/timeline z-30">
                    <input 
                      type="range" min={0} max={duration || 100} value={currentTime} onChange={handleScrubChange} style={playerLineStyle}
                      className="custom-slider w-full h-1 rounded-lg appearance-none cursor-pointer group-hover/timeline:h-1.5 transition-all outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between relative z-30">
                    <div className="flex items-center gap-4">
                      <button onClick={togglePlay} className="text-white hover:text-blue-400 transition transform active:scale-95">
                        {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                      </button>

                      <div className="flex items-center gap-2.5">
                        <button onClick={seekBackward} className="text-slate-300 hover:text-white transition"><Rewind size={18} /></button>
                        <button onClick={seekForward} className="text-slate-300 hover:text-white transition"><FastForward size={18} /></button>
                      </div>

                      <div className="hidden md:flex items-center gap-2 group/vol">
                        <button onClick={toggleMute} className="text-slate-300 hover:text-white transition">
                          {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>
                        <input 
                          type="range" min="0" max="100" value={isMuted ? 0 : volume} onChange={handleVolumeChange}
                          className="w-0 opacity-0 group-hover/vol:w-16 group-hover/vol:opacity-100 transition-all duration-300 h-1 bg-slate-600 appearance-none rounded accent-blue-500 cursor-pointer"
                        />
                      </div>

                      <span className="text-slate-300 text-xs font-mono select-none">
                        {formatTime(currentTime)} <span className="text-slate-600">/</span> {formatTime(duration)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative" ref={settingsRef}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(!isSettingsOpen); setSettingsMenuMode('main'); resetControlsTimeout(); }}
                          className={`transition p-1 rounded-lg ${isSettingsOpen ? 'text-blue-400 bg-slate-900' : 'text-slate-300 hover:text-white'}`}
                        >
                          <Settings size={18} />
                        </button>

                        {isSettingsOpen && (
                          <div onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
                            className="absolute bottom-10 right-0 bg-slate-950 border border-slate-800 text-white rounded-xl shadow-2xl p-2 w-48 text-xs select-none animate-in fade-in slide-in-from-bottom-2 duration-200"
                          >
                            {settingsMenuMode === 'main' && (
                              <div className="flex flex-col gap-0.5">
                                <button onClick={() => setSettingsMenuMode('speed')} className="flex items-center justify-between p-2 hover:bg-slate-900 rounded-lg text-left transition">
                                  <span>වේගය (Speed)</span>
                                  <span className="text-blue-400 font-bold flex items-center">{playbackRate}x <ChevronRight size={14} /></span>
                                </button>
                                <button onClick={() => setSettingsMenuMode('quality')} className="flex items-center justify-between p-2 hover:bg-slate-900 rounded-lg text-left transition">
                                  <span>තත්ත්වය (Quality)</span>
                                  <span className="text-blue-400 font-bold flex items-center capitalize">{currentQuality.replace('hd', '')} <ChevronRight size={14} /></span>
                                </button>
                              </div>
                            )}

                            {settingsMenuMode === 'speed' && (
                              <div className="flex flex-col gap-0.5">
                                <div className="p-1.5 font-bold text-slate-500 border-b border-slate-900 mb-1">Select Speed</div>
                                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                                  <button key={speed} onClick={() => handleSpeedSelect(speed)}
                                    className={`p-2 rounded-lg text-left transition ${playbackRate === speed ? 'bg-blue-600 font-bold text-white' : 'hover:bg-slate-900 text-slate-300'}`}
                                  >
                                    {speed === 1 ? 'Normal' : `${speed}x`}
                                  </button>
                                ))}
                              </div>
                            )}

                            {settingsMenuMode === 'quality' && (
                              <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                                <div className="p-1.5 font-bold text-slate-500 border-b border-slate-900 mb-1">Select Quality</div>
                                {availableQualities.length === 0 ? (
                                  ['highres', 'hd1080', 'hd720', 'large', 'medium', 'small', 'default'].map((q) => (
                                    <button key={q} onClick={() => handleQualitySelect(q)}
                                      className={`p-2 rounded-lg text-left transition capitalize ${currentQuality === q ? 'bg-blue-600 font-bold text-white' : 'hover:bg-slate-900 text-slate-300'}`}
                                    >
                                      {q === 'large' ? '480p' : q === 'medium' ? '360p' : q === 'default' ? 'Auto' : q === 'highres' ? 'Max (Original)' : q.replace('hd', '')}
                                    </button>
                                  ))
                                ) : (
                                  availableQualities.map((q) => (
                                    <button key={q} onClick={() => handleQualitySelect(q)}
                                      className={`p-2 rounded-lg text-left transition capitalize ${currentQuality === q ? 'bg-blue-600 font-bold text-white' : 'hover:bg-slate-900 text-slate-300'}`}
                                    >
                                      {q === 'large' ? '480p' : q === 'medium' ? '360p' : q === 'default' ? 'Auto' : q === 'highres' ? 'Max (Original)' : q.replace('hd', '')}
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <button onClick={toggleFullscreen} className="text-slate-300 hover:text-white transition">
                        <Maximize size={18} />
                      </button>
                    </div>
                  </div>

                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}