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
  const [showControls, setShowControls] = useState(true); 
  
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

  const startWatchTimeTracking = async () => {
    if (!selectedVideo || !student) return;
    
    if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
    }

    try {
      const { data } = await supabase
        .from('recording_views')
        .select('id, watched_seconds')
        .eq('recording_id', selectedVideo.id)
        .eq('username', student.username)
        .maybeSingle();

      if (data) {
        currentViewRecordIdRef.current = data.id;
        totalWatchedSecondsRef.current = data.watched_seconds || 1;
      } else {
        const { data: newRec } = await supabase
          .from('recording_views')
          .insert({ 
              recording_id: selectedVideo.id, 
              username: student.username, 
              watched_seconds: 1,
              last_watched_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (newRec) {
          currentViewRecordIdRef.current = newRec.id;
          totalWatchedSecondsRef.current = 1;
        }
      }

      let tickCounter = 0;
      syncIntervalRef.current = setInterval(async () => {
        if (isPlaying && !hasEnded) {
          totalWatchedSecondsRef.current += 1;
          tickCounter += 1;

          // තත්පර 15කට වරක් දත්ත යාවත්කාලීන කරයි (කලින් තිබුනේ විනාඩි 5)
          if (tickCounter >= 15 && currentViewRecordIdRef.current) {
            tickCounter = 0;
            await supabase
              .from('recording_views')
              .update({ 
                  watched_seconds: totalWatchedSecondsRef.current, 
                  last_watched_at: new Date().toISOString() 
              })
              .eq('id', currentViewRecordIdRef.current);
          }
        }
      }, 1000);

    } catch (err) {
      console.error(err);
    }
  };

  const stopWatchTimeTracking = async () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    
    if (currentViewRecordIdRef.current && totalWatchedSecondsRef.current > 0 && selectedVideo) {
      // ඩේටාබේස් එක අප්ඩේට් කිරීම
      await supabase
        .from('recording_views')
        .update({ 
            watched_seconds: totalWatchedSecondsRef.current, 
            last_watched_at: new Date().toISOString() 
        })
        .eq('id', currentViewRecordIdRef.current);
      
      // UI එක ක්ෂණිකව අප්ඩේට් කිරීම (Full fetch එකක් වෙනුවට)
      setWatchHistory(prev => ({
        ...prev,
        [selectedVideo.id]: {
            ...prev[selectedVideo.id],
            recording_id: selectedVideo.id,
            watched_seconds: totalWatchedSecondsRef.current
        }
      }));
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
                
                let watchState: 'unwatched' | 'partial' | 'completed' = 'unwatched';
                if (viewRecord && watchedSeconds > 0) {
                  if (watchedSeconds >= (videoTotalDuration * 0.90)) {
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
                      
                      // ක්ලික් කල සැනින් ඩේටාබේස් එකට ඇතුලත් කර Unwatched තත්වය ඉවත් කිරීම
                      if (!viewRecord || watchedSeconds < 1) {
                         
                         setWatchHistory(prev => ({
                           ...prev,
                           [video.id]: { recording_id: video.id, watched_seconds: 1 }
                         }));
                         
                         const { data: existingData } = await supabase
                           .from('recording_views')
                           .select('id')
                           .eq('recording_id', video.id)
                           .eq('username', student.username)
                           .maybeSingle();

                         if (!existingData) {
                           await supabase.from('recording_views').insert({
                              recording_id: video.id,
                              username: student.username,
                              watched_seconds: 1,
                              last_watched_at: new Date().toISOString()
                           });
                         }
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
                      
                      {isUnlocked && watchState === 'unwatched' && (
                        <div className="absolute top-2 left-2 bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow z-10 uppercase tracking-wider">
                          NEW / UNWATCHED
                        </div>
                      )}

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
            className="w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden relative border border-slate-800 shadow-2xl group"
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
                      <div className="text-center">
                        <p className="text-emerald-400 font-bold mb-4">ඔබ මෙම පන්තියේ සියලුම වීඩියෝ නරඹා අවසන්ය.</p>
                        <button 
                          onClick={() => { 
                            setSelectedVideo(null); setIsPlaying(false); setHasEnded(false); 
                            if (screenfull.isEnabled && screenfull.isFullscreen) screenfull.exit();
                          }} 
                          className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-700 transition"
                        >
                          ප්‍රධාන මෙනුවට යන්න
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                <div id="youtube-player-container" className="w-full h-full pointer-events-none"></div>

                {/* Overlays / Controls */}
                {showControls && !hasEnded && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 flex flex-col gap-2 z-40 transition-opacity duration-300">
                    <input 
                      type="range" min="0" max={duration || 100} value={currentTime} onChange={handleScrubChange}
                      className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer custom-slider"
                      style={playerLineStyle}
                    />
                    <div className="flex items-center justify-between text-white mt-2">
                       <div className="flex items-center gap-4">
                         <button onClick={togglePlay} className="hover:text-blue-400 transition">
                           {isPlaying ? <Pause size={20}/> : <Play size={20}/>}
                         </button>
                         <button onClick={seekBackward} className="hover:text-blue-400 transition"><Rewind size={20}/></button>
                         <button onClick={seekForward} className="hover:text-blue-400 transition"><FastForward size={20}/></button>
                         <div className="flex items-center gap-2 group/vol relative">
                           <button onClick={toggleMute} className="hover:text-blue-400 transition">
                             {isMuted || volume === 0 ? <VolumeX size={20}/> : <Volume2 size={20}/>}
                           </button>
                           <input 
                             type="range" min="0" max="100" value={isMuted ? 0 : volume} onChange={handleVolumeChange} 
                             className="w-0 group-hover/vol:w-20 transition-all duration-300 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer hidden md:block" 
                           />
                         </div>
                         <span className="text-xs font-mono ml-2 opacity-80">{formatTime(currentTime)} / {formatTime(duration)}</span>
                       </div>
                       <div className="flex items-center gap-4 relative" ref={settingsRef}>
                         <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="hover:text-blue-400 transition"><Settings size={20}/></button>
                         <button onClick={toggleFullscreen} className="hover:text-blue-400 transition"><Maximize size={20}/></button>
                         
                         {isSettingsOpen && (
                            <div className="absolute bottom-10 right-0 bg-slate-900 border border-slate-700 rounded-lg p-2 flex flex-col gap-2 min-w-[150px] shadow-2xl">
                               <span className="text-xs text-slate-400 font-bold mb-1 border-b border-slate-700 pb-1 px-1">Playback Speed</span>
                               {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                                 <button 
                                   key={speed} 
                                   onClick={() => handleSpeedSelect(speed)} 
                                   className={`text-sm text-left px-2 py-1.5 hover:bg-slate-800 rounded transition ${playbackRate === speed ? 'text-blue-400 font-bold' : 'text-white'}`}
                                 >
                                   {speed === 1 ? 'Normal' : `${speed}x`}
                                 </button>
                               ))}
                            </div>
                         )}
                       </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}