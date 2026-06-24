import { supabase } from '../supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import screenfull from 'screenfull';
import { Play, Pause, Lock, ArrowLeft, RotateCcw, RotateCw, Maximize, Minimize, Volume2, VolumeX, Gauge } from 'lucide-react';

interface StudentRecordingsProps {
  student: any; 
  onBack: () => void; 
}

export default function StudentRecordings({ student, onBack }: StudentRecordingsProps) {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [availableMonths, setAvailableMonths] = useState<{year: string, month: string}[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('current');
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, boolean>>({});
  
  // Custom Player States
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false); 
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [blackoutActive, setBlackoutActive] = useState(false); // For Screenshot/Record Alert

  // Dynamic Watermark State
  const [watermarkPos, setWatermarkPos] = useState({ top: '20%', left: '20%' });
  
  // Realtime Watch Tracking Refs
  const currentViewRecordIdRef = useRef<string | null>(null);
  const totalWatchedSecondsRef = useRef<number>(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uiUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const watermarkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear().toString();
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  // YouTube Iframe API Load කිරීම
  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // මෘදුකාංග මගින් Screen capture/Screenshot හඳුනාගැනීමේ මූලික උපක්‍රමයක්
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' || 
        (e.ctrlKey && e.key === 'p') || 
        (e.metaKey && e.shiftKey && e.key === 's')
      ) {
        setBlackoutActive(true);
        setTimeout(() => setBlackoutActive(false), 3000); // තත්පර 3 කින් නැවත සාමාන්‍ය වේ
        alert("ආරක්ෂිත හේතූන් මත මෙම පද්ධතිය තුළ Screen रिकॉर्डिंग හෝ Screenshots තහනම් කර ඇත!");
      }
    };

    window.addEventListener('keyup', handleKeyDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keyup', handleKeyDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (student) {
      fetchRecordingsAndPayments();
    }
    return () => {
      stopWatchTimeTracking();
      stopUIUpdates();
    };
  }, [student, selectedFilter]);

  // Player සහ Tracking සක්‍රීය/අක්‍රීය කිරීමේ Effect එක
  useEffect(() => {
    if (isPlaying && selectedVideo && isReady) {
      startWatchTimeTracking();
      startUIUpdates();
      startWatermarkMovement();
    } else {
      stopWatchTimeTracking();
      stopUIUpdates();
      stopWatermarkMovement();
    }
    return () => { 
      stopWatchTimeTracking(); 
      stopUIUpdates();
      stopWatermarkMovement();
    };
  }, [isPlaying, selectedVideo, isReady]);

  // YouTube Player එක Custom Variables සමඟ ස්ථාපනය
  useEffect(() => {
    const selectedYtId = selectedVideo ? getYouTubeId(selectedVideo) : null;
    if (!selectedVideo || !selectedYtId) return;

    let player: any;

    const initPlayer = () => {
      player = new (window as any).YT.Player('youtube-player-container', {
        height: '100%',
        width: '100%',
        videoId: selectedYtId,
        playerVars: {
          autoplay: 1,
          controls: 0,          // යූටියුබ් එකේ සාමාන්‍ය පාලක පැනලය සම්පූර්ණයෙන්ම ඉවත් කරයි
          rel: 0,               // අදාළ නොවන වීඩියෝ පෙන්වීම නවත්වයි
          modestbranding: 1,    // යූටියුබ් ලෝගෝ එක අවම කරයි
          disablekb: 1,         // යූටියුබ් කීබෝඩ් ෂෝට්කට් අක්‍රීය කරයි
          fs: 0,                // යූටියුබ් Fullscreen බටන් එක ඉවත් කරයි
          iv_load_policy: 3,    // වීඩියෝව මත මැදින් මතුවන දැන්වීම්/Annotations ඉවත් කරයි
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            setIsReady(true);
            setIsPlaying(true);
            setDuration(player.getDuration());
          },
          onStateChange: (event: any) => {
            if (event.data === (window as any).YT.PlayerState.PLAYING) {
              setIsPlaying(true);
            } else if (event.data === (window as any).YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (event.data === (window as any).YT.PlayerState.ENDED) {
              setIsPlaying(false);
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

  // Fullscreen වෙනස්වීම් නිරීක්ෂණය
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!(screenfull.isEnabled && screenfull.isFullscreen));
    };
    if (screenfull.isEnabled) {
      screenfull.on('change', onFullscreenChange);
    }
    return () => {
      if (screenfull.isEnabled) screenfull.off('change', onFullscreenChange);
    };
  }, []);

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
      setRecordings(recData || []);

      if (recData) {
        const monthsList = Array.from(new Set<string>(recData.map((r: any) => `${r.year}-${r.month}`)))
          .map((str: string) => {
            const [y, m] = str.split('-');
            return { year: y, month: m };
          });
        setAvailableMonths(monthsList);
      }

      const { data: payData } = await supabase
        .from('payments')
        .select('*')
        .eq('username', student.username);

      const statusMap: Record<string, boolean> = {};
      
      recData?.forEach((rec: any) => {
        const isGloballyFree = student.plan_type?.toLowerCase() === 'free'; 
        const paymentRecord = payData?.find((p: any) => p.status === 'approved');
        statusMap[`${rec.class_type}-${rec.year}-${rec.month}`] = isGloballyFree || !!paymentRecord; 
      });
      setPaymentStatuses(statusMap);
    } catch (error) {
      console.error(error);
    }
  };

  // විනාඩි 5 න් 5 ට Supabase වෙත දත්ත යැවීමේ පද්ධතිය
  const startWatchTimeTracking = async () => {
    if (!selectedVideo || !student) return;
    stopWatchTimeTracking(); 

    try {
      const { data, error } = await supabase
        .from('recording_views')
        .select('id, watched_seconds')
        .eq('recording_id', selectedVideo.id)
        .eq('username', student.username)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        currentViewRecordIdRef.current = data.id;
        totalWatchedSecondsRef.current = data.watched_seconds;
      } else {
        const { data: newRec } = await supabase
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
        }
      }

      let tickCounter = 0;
      syncIntervalRef.current = setInterval(async () => {
        if (isPlaying) {
          totalWatchedSecondsRef.current += 1;
          tickCounter += 1;

          // සෑම විනාඩි 5 කට වරක්ම (තත්පර 300) ඩේටාබේස් සින්ක් කිරීම
          if (tickCounter >= 300 && currentViewRecordIdRef.current) {
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
    // වීඩියෝව නවත්වන විට අවසන් තත්පර ගණන සින්ක් කිරීම
    if (currentViewRecordIdRef.current && totalWatchedSecondsRef.current > 0) {
      await supabase
        .from('recording_views')
        .update({ 
          watched_seconds: totalWatchedSecondsRef.current,
          last_watched_at: new Date().toISOString()
        })
        .eq('id', currentViewRecordIdRef.current);
    }
  };

  // Custom UI සේවා (Timeline updates)
  const startUIUpdates = () => {
    uiUpdateIntervalRef.current = setInterval(() => {
      if (ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
        setCurrentTime(ytPlayerRef.current.getCurrentTime());
      }
    }, 500);
  };

  const stopUIUpdates = () => {
    if (uiUpdateIntervalRef.current) clearInterval(uiUpdateIntervalRef.current);
  };

  // වීඩියෝව පුරා නම චලනය කරවීම (Watermark Movement)
  const startWatermarkMovement = () => {
    watermarkIntervalRef.current = setInterval(() => {
      const top = Math.floor(Math.random() * 80) + 10;
      const left = Math.floor(Math.random() * 70) + 10;
      setWatermarkPos({ top: `${top}%`, left: `${left}%` });
    }, 4000); // සෑම තත්පර 4 කට වරක්ම නම වෙනස් තැනකට යයි
  };

  const stopWatermarkMovement = () => {
    if (watermarkIntervalRef.current) clearInterval(watermarkIntervalRef.current);
  };

  // Custom Player Controls Methods
  const togglePlay = () => {
    if (!ytPlayerRef.current) return;
    if (isPlaying) {
      ytPlayerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      ytPlayerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  const skipTime = (amount: number) => {
    if (!ytPlayerRef.current) return;
    const current = ytPlayerRef.current.getCurrentTime();
    ytPlayerRef.current.seekTo(Math.max(0, Math.min(duration, current + amount)), true);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ytPlayerRef.current) return;
    const newTime = parseFloat(e.target.value);
    ytPlayerRef.current.seekTo(newTime, true);
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ytPlayerRef.current) return;
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    ytPlayerRef.current.setVolume(newVolume);
    setIsMuted(newVolume === 0);
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
  };

  const changeSpeed = (rate: number) => {
    if (!ytPlayerRef.current) return;
    ytPlayerRef.current.setPlaybackRate(rate);
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = () => {
    if (screenfull.isEnabled && playerWrapperRef.current) {
      screenfull.toggle(playerWrapperRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getYouTubeId = (video: any) => {
    if (!video) return null;
    const rawInput = String(video.video_url || video.youtube_id || '');
    const match = rawInput.replace(/[\s"']/g, '').match(/(?:v=|embed\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const getVideoThumbnail = (video: any) => {
    const vidId = getYouTubeId(video);
    return vidId ? `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg` : 'https://via.placeholder.com/640x360.png';
  };

  const handleVideoClick = (video: any, isUnlocked: boolean) => {
    if (isUnlocked) {
      setSelectedVideo(video);
      setIsReady(false); 
      setIsPlaying(true); 
    } else {
      alert(`කරුණාකර මෙම පන්තිය සඳහා මුදල් ගෙවා වීඩියෝව සක්‍රීය කරගන්න.`);
    }
  };

  const filteredRecordings = recordings.filter((r: any) => {
    if (selectedFilter === 'current') return r.year === currentYear;
    const [fYear, fMonth] = selectedFilter.split('-');
    return r.year === fYear && r.month === fMonth;
  });

  const groupedRecordings = filteredRecordings.reduce((acc: any, video: any) => {
    acc[video.class_type] = acc[video.class_type] || [];
    acc[video.class_type].push(video);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="bg-slate-950 min-h-screen text-white p-4 md:p-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-full transition">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-400">Class Recordings</h1>
            <p className="text-slate-400 text-sm mt-1">ඔබේ පන්තිවල මඟහැරුණු කොටස් මෙතැනින් නරඹන්න</p>
          </div>
        </div>

        <select 
          value={selectedFilter}
          onChange={(e) => setSelectedFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white px-4 py-2 rounded-xl"
        >
          <option value="current">මෙම මාසය ({currentYear} {currentMonthName})</option>
          {availableMonths.map((m, idx) => (
            <option key={idx} value={`${m.year}-${m.month}`}>{m.year} - {m.month}</option>
          ))}
        </select>
      </div>

      {/* Videos List */}
      {Object.keys(groupedRecordings).length === 0 ? (
        <div className="text-center py-20 text-slate-500">මෙම මාසය සඳහා වීඩියෝ කිසිවක් ලබා දී නොමැත.</div>
      ) : (
        Object.entries(groupedRecordings).map(([classType, videos]: [string, any]) => (
          <div key={classType} className="mb-10">
            <h2 className="text-xl font-bold text-emerald-400 mb-4 border-b border-slate-800 pb-2">{classType}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {videos.map((video: any) => {
                const isUnlocked = paymentStatuses[`${video.class_type}-${video.year}-${video.month}`] || false;
                return (
                  <div 
                    key={video.id}
                    onClick={() => handleVideoClick(video, isUnlocked)}
                    className={`rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-300 ${!isUnlocked ? 'border-red-900/50 opacity-80' : 'border-emerald-500/50 hover:border-emerald-400'}`}
                  >
                    <div className="relative aspect-video bg-slate-900">
                      <img src={getVideoThumbnail(video)} alt={video.title} className={`w-full h-full object-cover ${!isUnlocked && 'grayscale blur-[2px]'}`} />
                      {!isUnlocked ? (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-4">
                          <Lock className="w-10 h-10 text-red-500 mb-2" />
                          <p className="text-red-400 font-bold text-sm">ගෙවීම් කර නොමැත</p>
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Play className="w-16 h-16 text-white" fill="currentColor" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-slate-900/90">
                      <h3 className="text-white font-semibold text-sm line-clamp-2">{video.title}</h3>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* 🛡️ Advanced Custom Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/98 z-50 flex flex-col items-center justify-center p-2 md:p-6 select-none" onContextMenu={(e) => e.preventDefault()}>
          
          <div className="w-full max-w-5xl flex justify-between items-center mb-3 px-2">
            <h3 className="text-slate-200 font-bold text-sm md:text-base truncate max-w-[80%]">{selectedVideo.title}</h3>
            <button 
              onClick={() => { 
                stopWatchTimeTracking(); 
                setSelectedVideo(null); 
                setIsPlaying(false); 
                setIsReady(false);
                if (screenfull.isEnabled && screenfull.isFullscreen) screenfull.exit(); 
              }}
              className="bg-slate-800 hover:bg-red-600 text-white rounded-full w-9 h-9 flex items-center justify-center transition"
            >
              ✕
            </button>
          </div>

          {/* Player Main Wrapper */}
          <div ref={playerWrapperRef} className="w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden relative group shadow-2xl border border-slate-800">
            
            {/* 1. Loading Screen */}
            {!isReady && (
              <div className="absolute inset-0 z-40 bg-slate-950 flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-3"></div>
                <p className="text-slate-400 text-xs">ආරක්ෂිත වීඩියෝ ධාරාව සක්‍රීය වෙමින් පවතී...</p>
              </div>
            )}

            {/* 2. 🚨 Blackout Layer (For Screen Captures) */}
            {blackoutActive && (
              <div className="absolute inset-0 z-50 bg-black flex items-center justify-center text-center p-6">
                <p className="text-red-500 font-bold text-lg">Screen Recording හඳුනා ගන්නා ලදී. පද්ධතිය අවහිර කරන ලදි!</p>
              </div>
            )}

            {/* 3. 🎯 Invisible Interaction Blocker Layer (Blocking Native Right-Clicks/Menus) */}
            <div className="absolute inset-0 z-20 bg-transparent cursor-default"></div>

            {/* 4. 👤 Dynamic Moving Watermark Layer */}
            {isReady && (
              <div 
                className="absolute z-30 text-white/15 font-bold tracking-wider pointer-events-none text-xs md:text-sm select-none transition-all duration-1000 ease-in-out uppercase"
                style={{ top: watermarkPos.top, left: watermarkPos.left }}
              >
                {student.username} • {student.username}
              </div>
            )}

            {/* Native YouTube Target (Stays Behind the Transparent Overlay) */}
            <div id="youtube-player-container" className="w-full h-full z-0 pointer-events-none"></div>

            {/* 5. 🎛️ Completely Custom HTML Player Control Bar */}
            {isReady && (
              <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col gap-3">
                
                {/* Timeline Slider */}
                <div className="flex items-center gap-3 w-full">
                  <span className="text-xs text-slate-300">{formatTime(currentTime)}</span>
                  <input 
                    type="range" 
                    min={0} 
                    max={duration || 100} 
                    value={currentTime} 
                    onChange={handleSeekChange}
                    className="w-full h-1.5 bg-slate-700 accent-blue-500 rounded-lg cursor-pointer appearance-none"
                  />
                  <span className="text-xs text-slate-300">{formatTime(duration)}</span>
                </div>

                {/* Control Action Buttons */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <button onClick={togglePlay} className="text-white hover:text-blue-400 transition">
                      {isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
                    </button>

                    <button onClick={() => skipTime(-10)} className="text-white hover:text-blue-400 transition" title="Rewind 10s">
                      <RotateCcw size={18} />
                    </button>
                    
                    <button onClick={() => skipTime(10)} className="text-white hover:text-blue-400 transition" title="Forward 10s">
                      <RotateCw size={18} />
                    </button>

                    {/* Volume Controls */}
                    <div className="flex items-center gap-2">
                      <button onClick={toggleMute} className="text-white hover:text-blue-400 transition">
                        {isMuted ? <VolumeX size={18}/> : <Volume2 size={18}/>}
                      </button>
                      <input 
                        type="range" min={0} max={100} value={isMuted ? 0 : volume} 
                        onChange={handleVolumeChange}
                        className="w-16 md:w-20 h-1 bg-slate-700 accent-white rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Right Controls: Speed & Fullscreen */}
                  <div className="flex items-center gap-4 relative">
                    
                    {/* Speed Selector */}
                    <div className="relative">
                      <button 
                        onClick={() => setShowSpeedMenu(!showSpeedMenu)} 
                        className="flex items-center gap-1 text-xs bg-slate-800/80 px-2 py-1 rounded hover:bg-slate-700 text-white transition"
                      >
                        <Gauge size={14}/> {playbackRate}x
                      </button>
                      
                      {showSpeedMenu && (
                        <div className="absolute bottom-8 right-0 bg-slate-900 border border-slate-700 rounded-lg py-1 w-20 flex flex-col shadow-xl text-xs">
                          {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                            <button 
                              key={rate} onClick={() => changeSpeed(rate)}
                              className={`px-3 py-1 text-left hover:bg-blue-600 transition ${playbackRate === rate ? 'text-blue-400 font-bold' : 'text-white'}`}
                            >
                              {rate}x
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Fullscreen Trigger */}
                    <button onClick={toggleFullscreen} className="text-white hover:text-blue-400 transition">
                      {isFullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}
                    </button>
                  </div>

                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}