import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  Volume1, 
  VolumeX, 
  RotateCcw, 
  RotateCw, 
  Maximize2, 
  Minimize2, 
  Radio, 
  Settings, 
  ShieldAlert, 
  Check, 
  Sparkles,
  ChevronDown,
  UserCheck
} from 'lucide-react';

interface YouTubeLivePlayerProps {
  videoUrl: string;
  title?: string;
  studentName?: string;
  className?: string;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

// Helper to extract YouTube video ID from various URL patterns
export const extractYouTubeVideoId = (url: string): string => {
  if (!url) return '';
  const trimmed = url.trim();

  // If it's already an 11-char ID without slashes or query params
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    // Check standard /embed/
    const embedMatch = trimmed.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch && embedMatch[1]) return embedMatch[1];

    // Check /live/ URL format (e.g., https://www.youtube.com/live/VIDEO_ID)
    const liveMatch = trimmed.match(/\/live\/([a-zA-Z0-9_-]{11})/);
    if (liveMatch && liveMatch[1]) return liveMatch[1];

    // Check youtu.be shortlinks
    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch && shortMatch[1]) return shortMatch[1];

    // Parse URL for ?v= query parameter
    const parsedUrl = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const v = parsedUrl.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
      return v;
    }

    // Fallback regex for query params or path segments
    const generalMatch = trimmed.match(/(?:v=|v\/|vi\/|youtu\.be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/);
    if (generalMatch && generalMatch[1]) {
      return generalMatch[1];
    }
  } catch {
    const generalMatch = trimmed.match(/(?:v=|v\/|vi\/|youtu\.be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/);
    if (generalMatch && generalMatch[1]) {
      return generalMatch[1];
    }
  }

  return '';
};

// Formats seconds into HH:MM:SS or MM:SS
const formatTime = (secs: number) => {
  if (!secs || isNaN(secs) || secs < 0) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function YouTubeLivePlayer({
  videoUrl,
  title = 'සජීවී විකාශය (Live Stream)',
  studentName = 'Student',
  className = '',
  onFullscreenChange
}: YouTubeLivePlayerProps) {
  const videoId = extractYouTubeVideoId(videoUrl);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const autoHideTimerRef = useRef<any>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  // Player state
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLiveStream, setIsLiveStream] = useState(true);
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [tapRipple, setTapRipple] = useState<{ side: 'left' | 'right'; id: number } | null>(null);
  const [centerActionRipple, setCenterActionRipple] = useState<{ type: 'play' | 'pause'; id: number } | null>(null);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [playerWidth, setPlayerWidth] = useState<number>(800);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 1. Load YouTube IFrame API script once
  useEffect(() => {
    if (!videoId) {
      setLoadError('වලංගු නොවන YouTube Link එකකි. කරුණාකර නිවැරදි URL එකක් ලබා දෙන්න.');
      return;
    }
    setLoadError(null);

    const loadYT = () => {
      if (window.YT && window.YT.Player) {
        initPlayer();
      } else {
        const existingScript = document.getElementById('youtube-iframe-api-script');
        if (!existingScript) {
          const tag = document.createElement('script');
          tag.id = 'youtube-iframe-api-script';
          tag.src = 'https://www.youtube.com/iframe_api';
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
        }

        const prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (prevReady) prevReady();
          initPlayer();
        };
      }
    };

    loadYT();

    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // 2. Initialize YouTube Player
  const initPlayer = useCallback(() => {
    if (!videoId) return;

    const playerId = `yt-embed-${videoId}`;
    const targetElement = document.getElementById(playerId);
    if (!targetElement) return;

    if (playerRef.current && typeof playerRef.current.destroy === 'function') {
      try {
        playerRef.current.destroy();
      } catch {}
    }

    try {
      playerRef.current = new window.YT.Player(playerId, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,          // Complete hide of YouTube native controls
          disablekb: 1,         // Disable YouTube keyboard shortcuts
          modestbranding: 1,    // Hide YouTube logo
          rel: 0,               // No related videos
          fs: 0,                // No native fullscreen button (custom LMS fullscreen is used)
          playsinline: 1,
          enablejsapi: 1,
          iv_load_policy: 3,    // Hide video annotations
          cc_load_policy: 0,    // Force Subtitles (Captions) OFF by default
          cc_lang_pref: 'none', // No captions language preferred
          origin: typeof window !== 'undefined' ? window.location.origin : undefined
        },
        events: {
          onReady: (event: any) => {
            setIsPlayerReady(true);
            try {
              // Explicitly disable closed captions/subtitles module
              if (typeof event.target.unloadModule === 'function') {
                event.target.unloadModule('captions');
                event.target.unloadModule('cc');
              }
              if (typeof event.target.setOption === 'function') {
                event.target.setOption('captions', 'track', {});
                event.target.setOption('cc', 'track', {});
              }
              event.target.playVideo();
              const vols = event.target.getVolume();
              if (typeof vols === 'number') setVolume(vols);
              setIsMuted(event.target.isMuted());
              
              const quals = event.target.getAvailableQualityLevels();
              if (Array.isArray(quals) && quals.length > 0) {
                setAvailableQualities(quals);
              }
              const q = event.target.getPlaybackQuality();
              if (q) setCurrentQuality(q);
            } catch {}
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
            if (event.data === 1) {
              setIsPlaying(true);
              try {
                if (typeof event.target.unloadModule === 'function') {
                  event.target.unloadModule('captions');
                  event.target.unloadModule('cc');
                }
              } catch {}
            } else if (event.data === 2) {
              setIsPlaying(false);
            }
          },
          onError: (event: any) => {
            console.error('YouTube Player Error code:', event.data);
            if (event.data === 101 || event.data === 150) {
              setLoadError('මෙම වීඩියෝව වෙනත් වෙබ් අඩවි තුළ ප්ලේ කිරීම සීමා (Restricted Embed) කර ඇත.');
            } else if (event.data === 100) {
              setLoadError('වීඩියෝව සොයාගත නොහැක (Not Found or Private).');
            }
          }
        }
      });
    } catch (e) {
      console.error('Error creating YT player:', e);
    }
  }, [videoId]);

  // 3. Periodic tracker for currentTime, duration & Live Edge detection
  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) return;

    const interval = setInterval(() => {
      try {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const cur = playerRef.current.getCurrentTime() || 0;
          const dur = playerRef.current.getDuration() || 0;
          setCurrentTime(cur);
          setDuration(dur);

          // For Live streams, if duration > 0, live edge is near duration
          // If the difference is <= 6 seconds, the student is at the real-time live point
          if (dur > 0) {
            setIsLiveStream(true);
            setIsAtLiveEdge(Math.abs(dur - cur) <= 6);
          }
        }
      } catch {}
    }, 500);

    return () => clearInterval(interval);
  }, [isPlayerReady]);

  // 4. Auto-hide controls after 3 seconds of inactivity
  const resetAutoHideTimer = useCallback(() => {
    setShowControls(true);
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
    }
    autoHideTimerRef.current = setTimeout(() => {
      setShowControls(false);
      setShowQualityMenu(false);
    }, 3000);
  }, []);

  useEffect(() => {
    resetAutoHideTimer();
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, [resetAutoHideTimer]);

  // 5. Fullscreen change listener and Mobile Landscape detector
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (onFullscreenChange) onFullscreenChange(isFs);

      if (isFs && window.innerWidth < 768 && window.innerHeight > window.innerWidth) {
        setIsMobilePortrait(true);
      } else {
        setIsMobilePortrait(false);
      }
    };

    const handleResize = () => {
      if (document.fullscreenElement && window.innerWidth < 768 && window.innerHeight > window.innerWidth) {
        setIsMobilePortrait(true);
      } else {
        setIsMobilePortrait(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', handleResize);
    };
  }, [onFullscreenChange]);

  // Track container width for responsive auto-adjusting player buttons
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setPlayerWidth(containerRef.current.clientWidth || 800);
      }
    };
    updateSize();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setPlayerWidth(entry.contentRect.width);
          }
        }
      });
      ro.observe(containerRef.current);
    }

    window.addEventListener('resize', updateSize);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const isNarrow = playerWidth < 500;
  const isMedium = playerWidth >= 500 && playerWidth < 740;

  // 6. Player Control Functions
  const togglePlay = () => {
    if (!playerRef.current) return;
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
    } catch {}
    resetAutoHideTimer();
  };

  const handleSkip = (seconds: number) => {
    if (!playerRef.current) return;
    try {
      const cur = playerRef.current.getCurrentTime() || 0;
      const target = Math.max(0, cur + seconds);
      playerRef.current.seekTo(target, true);
      setCurrentTime(target);
    } catch {}
    resetAutoHideTimer();
  };

  // Jump to Live Point
  const handleSyncToLive = () => {
    if (!playerRef.current) return;
    try {
      const dur = playerRef.current.getDuration() || 0;
      if (dur > 0) {
        playerRef.current.seekTo(dur, true);
        setCurrentTime(dur);
      }
      playerRef.current.playVideo();
      setIsPlaying(true);
      setIsAtLiveEdge(true);
    } catch {}
    resetAutoHideTimer();
  };

  // Seek bar scrubber
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (!playerRef.current) return;
    try {
      playerRef.current.seekTo(newTime, true);
    } catch {}
    resetAutoHideTimer();
  };

  // Volume & Mute
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (!playerRef.current) return;
    try {
      playerRef.current.setVolume(val);
      if (val === 0) {
        playerRef.current.mute();
        setIsMuted(true);
      } else if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      }
    } catch {}
    resetAutoHideTimer();
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    try {
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
        if (volume === 0) {
          setVolume(50);
          playerRef.current.setVolume(50);
        }
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    } catch {}
    resetAutoHideTimer();
  };

  // Quality selection
  const handleSelectQuality = (qual: string) => {
    if (!playerRef.current) return;
    try {
      if (typeof playerRef.current.setPlaybackQuality === 'function') {
        playerRef.current.setPlaybackQuality(qual);
      }
      if (typeof playerRef.current.setPlaybackQualityRange === 'function') {
        playerRef.current.setPlaybackQualityRange(qual, qual);
      }
      setCurrentQuality(qual);
      setShowQualityMenu(false);
    } catch {}
    resetAutoHideTimer();
  };

  // Fullscreen toggle with orientation lock attempt
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
        // Attempt landscape lock for smooth 16:9 mobile view
        if ('orientation' in screen && (screen.orientation as any)?.lock) {
          try {
            await (screen.orientation as any).lock('landscape');
          } catch {}
        }
      } catch (err) {
        console.warn('Fullscreen request failed:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.warn('Exit fullscreen failed:', err);
      }
    }
    resetAutoHideTimer();
  };

  // 7. Security Shield Touch/Click & Double-Tap Handler
  const handleShieldInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    resetAutoHideTimer();

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();
    const timeDiff = now - lastTapRef.current.time;

    // Center zone: 25% to 75% of screen width -> Immediate Single Tap Play / Pause toggle!
    if (clickX >= width * 0.25 && clickX <= width * 0.75) {
      const willPlay = !isPlaying;
      togglePlay();
      setCenterActionRipple({ type: willPlay ? 'play' : 'pause', id: now });
      setTimeout(() => setCenterActionRipple(null), 700);
      lastTapRef.current = { time: 0, x: 0 };
      return;
    }

    // Outer zones (Left 25% or Right 25%): Check for double tap to skip 5s
    if (timeDiff < 350) {
      if (clickX < width * 0.25) {
        // Double tap on Left -> skip backward 5s
        handleSkip(-5);
        setTapRipple({ side: 'left', id: now });
        setTimeout(() => setTapRipple(null), 600);
      } else if (clickX > width * 0.75) {
        // Double tap on Right -> skip forward 5s
        handleSkip(5);
        setTapRipple({ side: 'right', id: now });
        setTimeout(() => setTapRipple(null), 600);
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      // First tap in outer margins: toggle controls
      lastTapRef.current = { time: now, x: clickX };
      setShowControls(prev => !prev);
    }
  };

  const QUALITY_OPTIONS = [
    { key: 'auto', label: 'Auto (ස්වයංක්‍රීය)', resBadge: 'Auto' },
    { key: 'hd1080', label: '1080p HD', resBadge: 'Full HD' },
    { key: 'hd720', label: '720p HD', resBadge: 'HD' },
    { key: 'large', label: '480p', resBadge: 'SD' },
    { key: 'medium', label: '360p', resBadge: 'Data Saver' },
    { key: 'small', label: '240p', resBadge: 'Low' },
  ];

  const getCleanQualityLabel = (q: string) => {
    if (!q) return 'Auto';
    const lower = q.toLowerCase();
    if (lower === 'auto' || lower === 'default' || lower === 'unknown') return 'Auto';
    if (lower === 'hd1080' || lower === '1080p' || lower === '1080' || lower === 'highres') return '1080p HD';
    if (lower === 'hd720' || lower === '720p' || lower === '720') return '720p HD';
    if (lower === 'large' || lower === '480p' || lower === '480') return '480p';
    if (lower === 'medium' || lower === '360p' || lower === '360') return '360p';
    if (lower === 'small' || lower === '240p' || lower === '240') return '240p';
    if (lower === 'tiny' || lower === '144p' || lower === '144') return '144p';
    return 'Auto';
  };

  const isQualitySelected = (optKey: string, current: string) => {
    if (!current || current === 'auto' || current === 'default' || current.toLowerCase() === 'unknown') {
      return optKey === 'auto';
    }
    const cur = current.toLowerCase();
    if (optKey === 'hd1080' && (cur === 'hd1080' || cur === '1080p' || cur === '1080' || cur === 'highres')) return true;
    if (optKey === 'hd720' && (cur === 'hd720' || cur === '720p' || cur === '720')) return true;
    if (optKey === 'large' && (cur === 'large' || cur === '480p' || cur === '480')) return true;
    if (optKey === 'medium' && (cur === 'medium' || cur === '360p' || cur === '360')) return true;
    if (optKey === 'small' && (cur === 'small' || cur === '240p' || cur === '240')) return true;
    return optKey === cur;
  };

  if (loadError) {
    return (
      <div className="w-full bg-slate-900 border border-red-500/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center text-white min-h-[360px]">
        <ShieldAlert size={40} className="text-red-400 mb-3 animate-pulse" />
        <h3 className="text-base font-bold text-red-300 mb-1">YouTube Live Stream දෝෂයක්</h3>
        <p className="text-xs text-slate-300 max-w-md mb-4">{loadError}</p>
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 max-w-md break-all">
          URL: {videoUrl || 'None provided'}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-video-player="true"
      data-dark-surface="true"
      onContextMenu={(e) => e.preventDefault()}
      onMouseMove={resetAutoHideTimer}
      onTouchStart={resetAutoHideTimer}
      onTouchMove={resetAutoHideTimer}
      className={`relative w-full bg-black overflow-hidden select-none group font-sans ${
        isFullscreen 
          ? 'fixed inset-0 z-[999999] w-screen h-screen m-0 p-0 rounded-none' 
          : `rounded-2xl border border-slate-800 shadow-2xl ${className || 'aspect-video'}`
      }`}
      style={{ touchAction: 'manipulation', colorScheme: 'dark' }}
    >
      {/* 1. Underlying YouTube Iframe Container */}
      <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden flex items-center justify-center">
        <div 
          id={`yt-embed-${videoId}`} 
          className="w-full h-full pointer-events-auto"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* 2. PROTECTED SECURITY SHIELD (Glass Touch & Click Interceptor) */}
      {/* Completely blocks right-click, YouTube title click, channel links & social share */}
      <div
        onClick={handleShieldInteraction}
        className="absolute inset-0 z-20 w-full h-full cursor-pointer bg-transparent"
      >
        {/* Double-tap ripple visual indicators */}
        {tapRipple?.side === 'left' && (
          <div className="absolute left-8 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md border border-white/20 text-white rounded-2xl px-4 py-3 animate-in fade-in zoom-in duration-200">
            <RotateCcw size={28} className="text-amber-400 animate-spin" />
            <span className="text-xs font-bold font-mono mt-1">-5s</span>
          </div>
        )}

        {tapRipple?.side === 'right' && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md border border-white/20 text-white rounded-2xl px-4 py-3 animate-in fade-in zoom-in duration-200">
            <RotateCw size={28} className="text-amber-400 animate-spin" />
            <span className="text-xs font-bold font-mono mt-1">+5s</span>
          </div>
        )}

        {/* Center Action Ripple Indicator (Play / Pause pop animation) */}
        {centerActionRipple && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-black/80 backdrop-blur-md border-2 border-white/40 text-white flex flex-col items-center justify-center shadow-2xl animate-in zoom-in-75 fade-in duration-150">
              {centerActionRipple.type === 'play' ? (
                <Play size={36} className="fill-white text-emerald-400 ml-1" />
              ) : (
                <Pause size={36} className="fill-white text-amber-400" />
              )}
            </div>
          </div>
        )}

        {/* Prominent Center Play Button when Stopped / Paused */}
        {!isPlaying && !centerActionRipple && (
          <div className="absolute inset-0 z-25 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 transform transition hover:scale-110 active:scale-95">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600/95 hover:bg-red-600 text-white flex items-center justify-center shadow-2xl shadow-red-600/60 border-2 border-white transition-all">
                <Play size={34} className="fill-white ml-1.5" />
              </div>
              <span className="px-3.5 py-1 rounded-full bg-slate-950/90 border-2 border-slate-600 text-white text-xs font-bold shadow-xl tracking-wide">
                නැවත ධාවනය කරන්න (Play)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Top Header Glass Shield (Over YouTube's Title/Channel Bar for extra safety) */}
      <div 
        className={`absolute top-0 inset-x-0 z-30 p-2 sm:p-3 bg-gradient-to-b from-black/95 via-black/80 to-transparent flex items-center justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Live Status Badge */}
          <div 
            style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full text-white text-[10px] sm:text-[11px] font-black shadow-lg shadow-red-600/40 border border-red-500 shrink-0"
          >
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white animate-ping"></span>
            <span>YOUTUBE LIVE</span>
          </div>

          <span 
            style={{ color: '#ffffff' }}
            className="text-xs sm:text-sm font-bold text-white truncate max-w-[110px] xs:max-w-[160px] sm:max-w-md drop-shadow-md"
          >
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Student Username Badge watermark - High contrast & always visible on Mobile and Desktop */}
          <div 
            style={{ backgroundColor: '#020617', borderColor: '#475569', color: '#ffffff' }}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl border-2 text-white font-mono font-black text-xs shadow-xl backdrop-blur-md"
          >
            <UserCheck size={14} className="text-emerald-400 shrink-0" />
            <span 
              style={{ color: '#ffffff' }}
              className="text-white font-black tracking-wide truncate max-w-[90px] xs:max-w-[140px] sm:max-w-[220px]"
            >
              {studentName}
            </span>
          </div>

          {/* Direct Live Edge Button in Header */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSyncToLive();
            }}
            style={isAtLiveEdge ? { backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#f87171' } : { backgroundColor: '#fbbf24', color: '#020617', borderColor: '#fde047' }}
            className={`px-2 sm:px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-md ${
              isAtLiveEdge ? 'shadow-red-600/30' : 'animate-pulse'
            }`}
            title="සජීවී විකාශයේ නිවැරදිම Live Point එකට යන්න"
          >
            <Radio size={14} className={isAtLiveEdge ? 'animate-pulse' : ''} />
            <span className={isNarrow ? "hidden" : "hidden xs:inline"}>{isAtLiveEdge ? 'LIVE' : 'Live Point'}</span>
            <span className={isNarrow ? "inline" : "xs:hidden"}>LIVE</span>
          </button>
        </div>
      </div>

      {/* Mobile Landscape Guidance Notice */}
      {isFullscreen && isMobilePortrait && (
        <div className="absolute top-16 inset-x-4 max-w-sm mx-auto z-40 bg-slate-950/95 border border-amber-500/80 backdrop-blur-md rounded-2xl p-3 shadow-2xl text-center animate-in fade-in">
          <p className="text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5">
            <RotateCcw size={14} className="text-amber-400 shrink-0 animate-spin" />
            16:9 සම්පූර්ණ තිරය සඳහා දුරකථනය හරහට (Landscape) හරවන්න
          </p>
        </div>
      )}

      {/* 3. CUSTOM LMS PLAYER CONTROLS (Floating High-Contrast Auto-Adjusting Dock) */}
      <div
        className={`absolute bottom-2 sm:bottom-4 inset-x-1.5 sm:inset-x-4 z-30 bg-slate-950/95 border border-slate-700/90 rounded-2xl p-2 sm:p-3 shadow-2xl backdrop-blur-md transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Timeline Scrubber Bar */}
        <div className="w-full flex items-center gap-2 mb-1.5 sm:mb-2">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="1"
            value={currentTime}
            onChange={handleSeekChange}
            className="w-full h-1.5 sm:h-2 bg-slate-800 hover:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600 transition"
            title="Seek timeline"
          />
        </div>

        {/* Controls Row - Auto-adjusts flexibly to player container width */}
        <div className="flex items-center justify-between text-white text-xs gap-1 sm:gap-2">
          {/* Left Controls: Play/Pause, 5s Skips, Time Display, Live Sync */}
          <div className="flex items-center gap-1 sm:gap-2 shrink min-w-0">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
              className="p-1.5 sm:p-2.5 rounded-xl text-white font-black transition hover:scale-105 active:scale-95 shadow-md shadow-red-600/30 cursor-pointer flex items-center justify-center shrink-0"
              title={isPlaying ? 'Pause (වීඩියෝව නවත්වන්න)' : 'Play (වීඩියෝව ප්ලේ කරන්න)'}
            >
              {isPlaying ? <Pause size={isNarrow ? 15 : 17} /> : <Play size={isNarrow ? 15 : 17} className="fill-white" />}
            </button>

            {/* 5s Skip Backward Button */}
            <button
              onClick={() => handleSkip(-5)}
              style={{ backgroundColor: '#0f172a', borderColor: '#475569', color: '#ffffff' }}
              className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border font-mono font-bold text-[11px] sm:text-xs transition hover:scale-105 cursor-pointer flex items-center gap-0.5 sm:gap-1 shadow-sm shrink-0"
              title="තත්පර 5ක් පසුපසට (Skip -5s)"
            >
              <RotateCcw size={isNarrow ? 12 : 14} />
              <span className="font-bold">-5s</span>
            </button>

            {/* 5s Skip Forward Button */}
            <button
              onClick={() => handleSkip(5)}
              style={{ backgroundColor: '#0f172a', borderColor: '#475569', color: '#ffffff' }}
              className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border font-mono font-bold text-[11px] sm:text-xs transition hover:scale-105 cursor-pointer flex items-center gap-0.5 sm:gap-1 shadow-sm shrink-0"
              title="තත්පර 5ක් ඉදිරියට (Skip +5s)"
            >
              <RotateCw size={isNarrow ? 12 : 14} />
              <span className="font-bold">+5s</span>
            </button>

            {/* Live Point Sync Button */}
            <button
              onClick={handleSyncToLive}
              style={isAtLiveEdge ? { backgroundColor: 'rgba(220, 38, 38, 0.25)', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.6)' } : { backgroundColor: '#fbbf24', color: '#020617', borderColor: '#fde047' }}
              className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-mono font-black flex items-center gap-1 sm:gap-1.5 transition cursor-pointer shadow-sm shrink-0"
              title="සජීවී විකාශයේ නිවැරදිම Live Point එකට යන්න"
            >
              <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isAtLiveEdge ? 'bg-red-500 animate-ping' : 'bg-slate-950'}`}></span>
              <span>{isNarrow ? 'LIVE' : isAtLiveEdge ? 'LIVE' : 'Go to Live'}</span>
            </button>

            {/* Running Time Stamp (Current / Duration) */}
            <div 
              style={{ backgroundColor: '#0f172a', borderColor: '#475569', color: '#ffffff' }}
              className="flex items-center text-[10px] sm:text-xs font-mono font-black border px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-xl shadow-md shrink-0"
            >
              <span className="text-emerald-400 font-extrabold">{formatTime(currentTime)}</span>
              <span className="mx-0.5 sm:mx-1 text-slate-400 font-bold">/</span>
              <span className={isLiveStream ? "text-red-400 font-black animate-pulse" : "text-amber-300 font-bold"}>
                {isLiveStream ? 'LIVE' : formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right Controls: Volume Slider, Quality Selector, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Volume Control - Auto-adapts: Mute button on narrow screens, Slider on wider screens */}
            <div 
              style={{ backgroundColor: '#0f172a', borderColor: '#475569' }}
              className="flex items-center gap-1 sm:gap-1.5 border px-1.5 sm:px-2 py-1 rounded-xl shadow-sm"
            >
              <button
                onClick={toggleMute}
                style={{ color: '#ffffff' }}
                className="p-1 hover:text-white transition cursor-pointer flex items-center justify-center"
                title={isMuted ? 'Unmute (ශබ්දය ක්‍රියාත්මක කරන්න)' : 'Mute (නිහඬ කරන්න)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={isNarrow ? 15 : 16} className="text-red-400" />
                ) : volume < 50 ? (
                  <Volume1 size={isNarrow ? 15 : 16} />
                ) : (
                  <Volume2 size={isNarrow ? 15 : 16} />
                )}
              </button>

              {!isNarrow && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className={`${isMedium ? 'w-10' : 'w-16'} h-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-red-500 transition`}
                  title={`Volume: ${isMuted ? 0 : volume}%`}
                />
              )}
            </div>

            {/* Quality Selector */}
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                style={{ backgroundColor: '#0f172a', borderColor: '#475569', color: '#ffffff' }}
                className="px-2 sm:px-3 py-1 sm:py-1.5 border hover:border-amber-400 rounded-xl text-[11px] sm:text-xs font-mono font-black flex items-center gap-1 sm:gap-1.5 transition cursor-pointer shadow-md"
                title="වීඩියෝ Quality (පැහැදිලි බව) වෙනස් කරන්න"
              >
                <Settings size={isNarrow ? 13 : 15} className="text-amber-400 shrink-0" />
                <span style={{ color: '#ffffff' }} className="font-extrabold text-[11px] sm:text-xs">{getCleanQualityLabel(currentQuality)}</span>
                <ChevronDown size={isNarrow ? 12 : 14} style={{ color: '#cbd5e1' }} />
              </button>

              {/* Quality Dropdown Menu - High Contrast & Guaranteed Visible Text */}
              {showQualityMenu && (
                <div 
                  style={{ backgroundColor: '#020617', borderColor: '#475569' }}
                  className="absolute bottom-full right-0 mb-2 w-52 sm:w-56 border-2 rounded-2xl shadow-2xl p-2 sm:p-2.5 z-50 backdrop-blur-xl"
                >
                  <div className="px-2 py-1.5 border-b border-slate-700/80 mb-1.5 flex items-center justify-between">
                    <span style={{ color: '#f59e0b' }} className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                      <Settings size={13} />
                      වීඩියෝ Quality
                    </span>
                    <span style={{ color: '#94a3b8' }} className="text-[10px] font-mono font-bold">Select</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1.5">
                    {QUALITY_OPTIONS.map((opt) => {
                      const isSelected = isQualitySelected(opt.key, currentQuality);
                      return (
                        <button
                          key={opt.key}
                          onClick={() => handleSelectQuality(opt.key)}
                          style={isSelected ? { backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#ef4444' } : { backgroundColor: '#0f172a', color: '#ffffff', borderColor: '#334155' }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-mono font-black flex items-center justify-between transition cursor-pointer border hover:border-amber-400"
                        >
                          <div className="flex items-center gap-2">
                            <span style={{ color: '#ffffff' }} className="font-extrabold text-xs">
                              {opt.label}
                            </span>
                            {!isSelected && (
                              <span style={{ color: '#cbd5e1', backgroundColor: '#1e293b', borderColor: '#475569' }} className="text-[9px] px-1.5 py-0.5 rounded border font-sans font-bold">
                                {opt.resBadge}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <Check size={15} style={{ color: '#ffffff' }} className="shrink-0 stroke-[3]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              style={{ backgroundColor: '#0f172a', borderColor: '#475569', color: '#ffffff' }}
              className="p-1.5 sm:p-2.5 rounded-xl border font-bold shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center shrink-0"
              title={isFullscreen ? 'Exit Fullscreen (සාමාන්‍ය තිරය)' : 'Fullscreen (සම්පූර්ණ තිරය)'}
            >
              {isFullscreen ? <Minimize2 size={isNarrow ? 15 : 16} /> : <Maximize2 size={isNarrow ? 15 : 16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
