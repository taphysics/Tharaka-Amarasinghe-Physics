import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import screenfull from 'screenfull';
import { supabase } from '../lib/supabaseClient'; // ඔබගේ Supabase file path එකට වෙනස් කරන්න
import { Play, Pause, Maximize, Minimize, SkipBack, SkipForward, Lock, CheckCircle, Clock, RotateCcw, Volume2, VolumeX } from 'lucide-react';

interface StudentRecordingsProps {
  student: any; // Main Dashboard එකෙන් එවන student data මෙතනට ලබාගන්න
}

export default function StudentRecordings({ student }: StudentRecordingsProps) {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [availableMonths, setAvailableMonths] = useState<{year: string, month: string}[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('current');
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, boolean>>({});
  const [videoProgress, setVideoProgress] = useState<Record<string, { playedSeconds: number, status: string }>>({});
  
  // Player State
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [played, setPlayed] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  
  const playerRef = useRef<ReactPlayer>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  const currentYear = new Date().getFullYear().toString();
  const currentMonth = new Date().toLocaleString('default', { month: 'long' }); // e.g., "June"

  useEffect(() => {
    if (student) {
      fetchRecordingsAndPayments();
      loadSavedProgress();
    }

    // Real-time Payment Updates Listener (ඔබ ඉල්ලූ පරිදි ගෙවූ සැනින් Unlock වීමට)
    const channel = supabase.channel('realtime-payments-recordings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `student_id=eq.${student.student_id || student.id}` }, 
      () => {
        fetchRecordingsAndPayments(); // ගෙවීමක් වෙනස් වූ සැනින් නැවත දත්ත ලබාගනී
      }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [student, selectedFilter]);

  // දත්ත ලබා ගැනීමේ Function එක
  const fetchRecordingsAndPayments = async () => {
    try {
      // 1. Recordings ලබා ගැනීම
      const { data: recData } = await supabase
        .from('recordings') // ඔබගේ Recordings ටේබල් එකේ නම
        .select('*')
        .in('class_type', typeof student.class_type === 'string' ? JSON.parse(student.class_type) : student.class_type)
        .order('created_at', { ascending: true }); // දැමූ පිළිවෙළට
      
      if (recData) {
        setRecordings(recData);
        // Filter එක සඳහා මාස සහ අවුරුදු වෙන් කර ගැනීම
        const months = Array.from(new Set(recData.map(r => `${r.year}-${r.month}`)))
          .map(str => {
            const [y, m] = str.split('-');
            return { year: y, month: m };
          });
        setAvailableMonths(months);
      }

      // 2. Payments පරීක්ෂා කිරීම (වීඩියෝ Unlock ද Lock ද යන්න සෙවීමට)
      const { data: payData } = await supabase
        .from('payments')
        .select('*')
        .eq('student_id', student.student_id || student.id);

      const statusMap: Record<string, boolean> = {};
      if (recData && payData) {
        recData.forEach(rec => {
          const isFreeStudent = student.is_paid === false || student.free_months?.includes(rec.month);
          const paymentRecord = payData.find(p => 
            p.class_type === rec.class_type && 
            (p.month === rec.month || p.month === `${rec.year}-${rec.month}`)
          );
          
          const isPaid = paymentRecord?.status?.toLowerCase() === 'paid' || paymentRecord?.status?.toLowerCase() === 'free';
          // Key එක: "ClassType-Year-Month"
          statusMap[`${rec.class_type}-${rec.year}-${rec.month}`] = isFreeStudent || isPaid; 
        });
      }
      setPaymentStatuses(statusMap);
    } catch (error) {
      console.error("Error fetching recordings:", error);
    }
  };

  // Video Progress Local Storage එකෙන් ලබාගැනීම (Database එකට වුවද වෙනස් කළ හැක)
  const loadSavedProgress = () => {
    const saved = localStorage.getItem(`video_progress_${student.id}`);
    if (saved) setVideoProgress(JSON.parse(saved));
  };

  const saveProgress = (videoId: string, seconds: number, status: string) => {
    const newProgress = { ...videoProgress, [videoId]: { playedSeconds: seconds, status } };
    setVideoProgress(newProgress);
    localStorage.setItem(`video_progress_${student.id}`, JSON.stringify(newProgress));
  };

  // ප්ලේයර් එකේ සෙටින්ග්ස්
  const handleReady = () => {
    if (selectedVideo && videoProgress[selectedVideo.id]?.playedSeconds) {
      const savedTime = videoProgress[selectedVideo.id].playedSeconds;
      // කලින් නවත්වපු තැනින් තත්පර 10ක් පසුපසට යාම
      const resumeTime = savedTime > 10 ? savedTime - 10 : 0; 
      playerRef.current?.seekTo(resumeTime, 'seconds');
    }
    setIsPlaying(true);
  };

  const handleProgress = (state: any) => {
    setPlayed(state.played);
    if (selectedVideo && isPlaying) {
      const isEnded = state.played >= 0.99;
      saveProgress(selectedVideo.id, state.playedSeconds, isEnded ? 'completed' : 'watching');
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (selectedVideo) saveProgress(selectedVideo.id, 0, 'completed');
  };

  const toggleFullscreen = () => {
    if (screenfull.isEnabled && playerContainerRef.current) {
      screenfull.toggle(playerContainerRef.current);
      setIsFullscreen(!isFullscreen);
    }
  };

  // වීඩියෝ Lock/Unlock පරීක්ෂා කර ප්ලේ කිරීම
  const handleVideoClick = (video: any, isUnlocked: boolean) => {
    if (isUnlocked) {
      setSelectedVideo(video);
      setPlayed(0);
    } else {
      alert(`ඔබ තවමත් ${video.year} ${video.month} සඳහා ${video.class_type} පන්තියට මුදල් ගෙවා නොමැත. කරුණාකර මුදල් ගෙවා වීඩියෝව නරඹන්න.`);
    }
  };

  // Filtered Videos
  const filteredRecordings = recordings.filter(r => {
    if (selectedFilter === 'current') return r.year === currentYear && r.month === currentMonth;
    const [fYear, fMonth] = selectedFilter.split('-');
    return r.year === fYear && r.month === fMonth;
  });

  // පන්ති වර්ග (class_type) අනුව Group කිරීම
  const groupedRecordings = filteredRecordings.reduce((acc, video) => {
    acc[video.class_type] = acc[video.class_type] || [];
    acc[video.class_type].push(video);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="bg-slate-950 min-h-screen text-white p-4 md:p-8 animate-in fade-in duration-500">
      
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-blue-400">Class Recordings</h1>
          <p className="text-slate-400 text-sm mt-1">ඔබේ පන්තිවල මඟහැරුණු කොටස් මෙතැනින් නරඹන්න</p>
        </div>

        <select 
          value={selectedFilter}
          onChange={(e) => setSelectedFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white px-4 py-2 rounded-xl focus:outline-none focus:border-blue-500"
        >
          <option value="current">මෙම මාසය ({currentYear} {currentMonth})</option>
          {availableMonths.map((m, idx) => (
            <option key={idx} value={`${m.year}-${m.month}`}>{m.year} - {m.month}</option>
          ))}
        </select>
      </div>

      {/* Videos Grouped by Class Type */}
      {Object.keys(groupedRecordings).length === 0 ? (
        <div className="text-center py-20 text-slate-500">මෙම මාසය සඳහා වීඩියෝ කිසිවක් ලබා දී නොමැත.</div>
      ) : (
        Object.entries(groupedRecordings).map(([classType, videos]) => (
          <div key={classType} className="mb-10">
            <h2 className="text-xl font-bold text-emerald-400 mb-4 border-b border-slate-800 pb-2">{classType}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {videos.map((video) => {
                const isUnlocked = paymentStatuses[`${video.class_type}-${video.year}-${video.month}`] || false;
                const prog = videoProgress[video.id];
                const isCompleted = prog?.status === 'completed';
                const isWatching = prog?.status === 'watching';
                
                return (
                  <div 
                    key={video.id}
                    onClick={() => handleVideoClick(video, isUnlocked)}
                    className={`relative group rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-300 ${
                      !isUnlocked ? 'border-red-900/50 opacity-80' : 
                      isCompleted ? 'border-slate-700 bg-slate-900' :
                      isWatching ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse-slow' : 
                      'border-emerald-500/50 hover:border-emerald-400'
                    }`}
                  >
                    {/* Thumbnail Area */}
                    <div className="relative aspect-video bg-slate-900">
                      <img 
                        src={video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`} 
                        alt={video.title}
                        className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${!isUnlocked && 'grayscale blur-[2px]'}`}
                      />
                      
                      {/* Top Right Sticker */}
                      <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-md border border-slate-600 px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider text-white z-10 shadow-lg">
                        <span className="text-blue-400">{video.class_type}</span> | {video.year} {video.month}
                      </div>

                      {/* Overlays based on Status */}
                      {!isUnlocked ? (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-4 text-center z-20">
                          <Lock className="w-10 h-10 text-red-500 mb-2" />
                          <p className="text-red-400 font-bold text-sm">මෙම මාසයට ගෙවීම් කර නොමැත</p>
                          <p className="text-slate-300 text-xs mt-1">කරුණාකර මුදල් ගෙවා වීඩියෝව නරඹන්න</p>
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                          <Play className="w-16 h-16 text-white drop-shadow-2xl" fill="currentColor" />
                        </div>
                      )}

                      {/* Progress Bar under thumbnail */}
                      {isWatching && isUnlocked && (
                        <div className="absolute bottom-0 left-0 h-1.5 bg-slate-800 w-full z-20">
                          <div 
                            className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" 
                            style={{ width: `${(prog.playedSeconds / (video.duration_seconds || 3600)) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Video Details */}
                    <div className="p-4 bg-slate-900/90 relative z-30">
                      <h3 className="text-white font-semibold line-clamp-2 text-sm">{video.title}</h3>
                      <div className="flex items-center gap-2 mt-3">
                        {isCompleted ? (
                          <span className="flex items-center gap-1 text-xs text-slate-400"><CheckCircle size={14} /> නරඹා අවසන්</span>
                        ) : isWatching ? (
                          <span className="flex items-center gap-1 text-xs text-blue-400"><Clock size={14} /> නැවත නරඹන්න</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-emerald-400"><Play size={14} /> නව වීඩියෝවකි</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* ==================== CUSTOM VIDEO PLAYER MODAL ==================== */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-2 md:p-10 animate-in zoom-in duration-300">
          <div 
            ref={playerContainerRef}
            className="w-full max-w-6xl aspect-video bg-black rounded-2xl overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.8)] group"
            onMouseMove={() => {
              setShowControls(true);
              clearTimeout(controlsTimeoutRef.current);
              controlsTimeoutRef.current = setTimeout(() => { if(isPlaying) setShowControls(false) }, 3000);
            }}
            onMouseLeave={() => { if(isPlaying) setShowControls(false) }}
          >
            {/* React Player (YouTube iframe wrapper) */}
            <ReactPlayer
              ref={playerRef}
              url={`https://www.youtube.com/watch?v=${selectedVideo.youtube_id}`}
              width="100%"
              height="100%"
              playing={isPlaying}
              volume={volume}
              muted={isMuted}
              playbackRate={playbackRate}
              onReady={handleReady}
              onProgress={handleProgress}
              onEnded={handleEnded}
              controls={false} // YouTube controls සැඟවීම
              config={{
                youtube: { playerVars: { showinfo: 0, rel: 0, modestbranding: 1, disablekb: 1 } }
              }}
              className="pointer-events-none" // YouTube එක මත Click කිරීම වැලැක්වීම
            />

            {/* Custom UI Overlay (පාලක පුවරුව) */}
            <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 flex flex-col justify-between transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
              
              {/* Top Bar */}
              <div className="p-4 flex justify-between items-center">
                <h3 className="text-white font-bold drop-shadow-md">{selectedVideo.title}</h3>
                <button 
                  onClick={() => { setSelectedVideo(null); setIsPlaying(false); if(isFullscreen) screenfull.exit(); }}
                  className="bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-full p-2 transition"
                >
                  ✕
                </button>
              </div>

              {/* End Screen Play Again Button */}
              {!isPlaying && played >= 0.99 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
                  <button onClick={() => { playerRef.current?.seekTo(0); setIsPlaying(true); }} className="flex flex-col items-center text-white hover:text-blue-400 transition">
                    <RotateCcw size={48} className="mb-2" />
                    <span>නැවත ප්ලේ කරන්න</span>
                  </button>
                </div>
              )}

              {/* Bottom Controls */}
              <div className="p-4 space-y-2">
                {/* Progress Bar */}
                <div 
                  className="h-2 bg-slate-600/50 rounded-full cursor-pointer relative"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    playerRef.current?.seekTo(percent, 'fraction');
                  }}
                >
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${played * 100}%` }} />
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-blue-400">
                      {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                    </button>
                    
                    <button onClick={() => playerRef.current?.seekTo(playerRef.current.getCurrentTime() - 10)} className="text-white hover:text-blue-400" title="තත්පර 10ක් ආපස්සට">
                      <SkipBack size={20} />
                    </button>

                    <div className="flex items-center gap-2 group/vol relative">
                      <button onClick={() => setIsMuted(!isMuted)} className="text-white hover:text-blue-400">
                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <input 
                        type="range" min={0} max={1} step="any" value={volume}
                        onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                        className="w-20 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer hidden group-hover/vol:block"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <select 
                      value={playbackRate} 
                      onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                      className="bg-transparent text-white text-sm font-bold outline-none cursor-pointer"
                    >
                      <option value={0.5} className="text-black">0.5x</option>
                      <option value={1} className="text-black">1.0x (Normal)</option>
                      <option value={1.25} className="text-black">1.25x</option>
                      <option value={1.5} className="text-black">1.5x</option>
                      <option value={2} className="text-black">2.0x</option>
                    </select>

                    <button onClick={toggleFullscreen} className="text-white hover:text-blue-400">
                      {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}