import { supabase } from '../supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import screenfull from 'screenfull';

import { Play, Lock, CheckCircle, Clock, ArrowLeft } from 'lucide-react';

interface StudentRecordingsProps {
  student: any; 
  onBack: () => void; 
}

export default function StudentRecordings({ student, onBack }: StudentRecordingsProps) {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [availableMonths, setAvailableMonths] = useState<{year: string, month: string}[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('current');
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, boolean>>({});
  
  // Player State
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false); 
  
  // Realtime Watch Tracking Refs
  const currentViewRecordIdRef = useRef<string | null>(null);
  const totalWatchedSecondsRef = useRef<number>(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const playerContainerRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear().toString();
  const currentMonthNumStr = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  useEffect(() => {
    if (student) {
      fetchRecordingsAndPayments();
    }

    const channel = supabase.channel('realtime-payments-recordings')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'payments', 
        filter: `username=eq.${student.username}` 
      }, () => {
        fetchRecordingsAndPayments(); 
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      stopWatchTimeTracking();
    };
  }, [student, selectedFilter]);

  // Tracking Effect
  useEffect(() => {
    if (isPlaying && selectedVideo && isReady) {
      startWatchTimeTracking();
    } else {
      stopWatchTimeTracking();
    }
    return () => { stopWatchTimeTracking(); };
  }, [isPlaying, selectedVideo, isReady]);

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

      let processedData = recData || [];

      // --- 🎯 සාම්පල් වීඩියෝව Inject කිරීම (2026 Revision) ---
      const sampleVideo = {
        id: 'sample_CQVys_VgwKQ',
        title: 'තාපය | උෂ්ණත්වමිතිය | Part 01 (Sample Video)',
        youtube_id: 'CQVys_VgwKQ',
        video_url: 'https://www.youtube.com/watch?v=CQVys_VgwKQ',
        class_type: '2026 Revision',
        year: currentYear,
        month: currentMonthName, // Current month එකට දමා ඇත, එවිට Default පෙනේ
        thumbnail_url: 'https://img.youtube.com/vi/CQVys_VgwKQ/maxresdefault.jpg'
      };

      // 2026 Revision පන්තිය සිසුවාට ඇත්නම් හෝ Sample එක පෙන්විය යුතු නම්
      processedData.unshift(sampleVideo);

      if (processedData) {
        setRecordings(processedData);
        const monthsList = Array.from(new Set<string>(processedData.map((r: any) => `${r.year}-${r.month}`)))
          .map((str: string) => {
            const [y, m] = str.split('-');
            return { year: y, month: m };
          });
        setAvailableMonths(monthsList);
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

      if (processedData) {
        processedData.forEach((rec: any) => {
          const recMonthStr = String(rec.month).trim();
          const recYearStr = String(rec.year).trim();
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

            const isMonthMatch = 
              pTargetMonth === standardizedDbMonth || pMonth === standardizedDbMonth || 
              pTargetMonth === recMonthStr || pMonth === recMonthStr || pMonth === `${recYearStr}-${recMonthStr.padStart(2, '0')}`;

            return isClassMatch && isMonthMatch;
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
    stopWatchTimeTracking(); 

    try {
      const { data, error } = await supabase
        .from('recording_views')
        .select('id, watched_seconds')
        .eq('recording_id', selectedVideo.id)
        .eq('username', student.username)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error; // Ignore no rows error

      if (data) {
        currentViewRecordIdRef.current = data.id;
        totalWatchedSecondsRef.current = data.watched_seconds;
      } else {
        const { data: newRec, error: insertError } = await supabase
          .from('recording_views')
          .insert({ recording_id: selectedVideo.id, username: student.username, watched_seconds: 0 })
          .select('id')
          .single();

        if (insertError) throw insertError;
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

          if (tickCounter >= 3 && currentViewRecordIdRef.current) {
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
      console.error("Error initializing watch time tracker:", err);
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
        .update({ 
          watched_seconds: totalWatchedSecondsRef.current,
          last_watched_at: new Date().toISOString()
        })
        .eq('id', currentViewRecordIdRef.current);
    }
  };

  // 🛑 අතිශය නිවැරදි YouTube ID එක ලබාගැනීමේ ශ්‍රිතය
  const getYouTubeId = (video: any) => {
    if (!video) return null;
    
    const rawInput = String(video.video_url || video.youtube_id || video.url || video.link || '');
    const sanitizedInput = rawInput.replace(/[\s"']/g, ''); 
    if (!sanitizedInput) return null;

    const match = sanitizedInput.match(/(?:v=|embed\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const getVideoThumbnail = (video: any) => {
    if (video.thumbnail_url) return video.thumbnail_url;
    const vidId = getYouTubeId(video);
    if (vidId) return `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`;
    return 'https://via.placeholder.com/640x360.png?text=Video+Recording';
  };

  const handleVideoClick = (video: any, isUnlocked: boolean) => {
    if (isUnlocked || video.id.startsWith('sample_')) {
      setSelectedVideo(video);
      setIsReady(false); 
      setIsPlaying(true); 
    } else {
      alert(`ඔබ තවමත් ${video.year} ${video.month} මාසය සඳහා ${video.class_type} පන්තියට මුදල් ගෙවා නොමැත. කරුණාකර මුදල් ගෙවා වීඩියෝව නරඹන්න.`);
    }
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

  // Modal එක ඇතුළත Iframe එක සඳහා Embed URL එක සෑදීම
  const selectedYtId = selectedVideo ? getYouTubeId(selectedVideo) : null;
  const embedUrl = selectedYtId 
      ? `https://www.youtube.com/embed/${selectedYtId}?autoplay=1&rel=0&modestbranding=1` 
      : "";

  return (
    <div className="bg-slate-950 min-h-screen text-white p-4 md:p-8 animate-in fade-in duration-500">
      
      {/* Header, Back Button & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-full transition flex items-center justify-center"
            title="Back to Dashboard"
          >
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
          className="bg-slate-900 border border-slate-700 text-white px-4 py-2 rounded-xl focus:outline-none focus:border-blue-500"
        >
          <option value="current">මෙම මාසය ({currentYear} {currentMonthName})</option>
          {availableMonths.map((m, idx) => (
            <option key={idx} value={`${m.year}-${m.month}`}>{m.year} - {m.month}</option>
          ))}
        </select>
      </div>

      {/* Videos Grouped by Class Type */}
      {Object.keys(groupedRecordings).length === 0 ? (
        <div className="text-center py-20 text-slate-500">මෙම මාසය සඳහා වීඩියෝ කිසිවක් ලබා දී නොමැත.</div>
      ) : (
        Object.entries(groupedRecordings).map(([classType, videos]: [string, any]) => (
          <div key={classType} className="mb-10">
            <h2 className="text-xl font-bold text-emerald-400 mb-4 border-b border-slate-800 pb-2">{classType}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {videos.map((video: any) => {
                const isSample = video.id.startsWith('sample_');
                const isUnlocked = isSample || paymentStatuses[`${video.class_type}-${video.year}-${video.month}`] || false;
                
                return (
                  <div 
                    key={video.id}
                    onClick={() => handleVideoClick(video, isUnlocked)}
                    className={`relative group rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-300 ${
                      !isUnlocked ? 'border-red-900/50 opacity-80' : 
                      isSample ? 'border-purple-500/50 hover:border-purple-400' :
                      'border-emerald-500/50 hover:border-emerald-400'
                    }`}
                  >
                    <div className="relative aspect-video bg-slate-900">
                      <img 
                        src={getVideoThumbnail(video)} 
                        alt={video.title}
                        className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${!isUnlocked && 'grayscale blur-[2px]'}`}
                        onError={(e) => {
                           (e.target as HTMLImageElement).src = 'https://via.placeholder.com/640x360.png?text=Video+Recording';
                        }}
                      />
                      
                      <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-md border border-slate-600 px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider text-white z-10 shadow-lg">
                        <span className="text-blue-400">{video.class_type}</span> | {video.year} {video.month}
                      </div>

                      {isSample && (
                        <div className="absolute top-2 left-2 bg-purple-600 px-2 py-1 rounded text-[10px] font-bold text-white z-10 shadow-lg animate-pulse">
                          FREE SAMPLE
                        </div>
                      )}

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
                    </div>

                    <div className="p-4 bg-slate-900/90 relative z-30">
                      <h3 className="text-white font-semibold line-clamp-2 text-sm">{video.title}</h3>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="flex items-center gap-1 text-xs text-emerald-400"><Play size={14} /> වීඩියෝව නරඹන්න</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Video Player Modal (Using Raw Embed Iframe) */}
      {selectedVideo && embedUrl && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-2 md:p-10 animate-in zoom-in duration-300">
          
          {/* Close Button Header */}
          <div className="w-full max-w-6xl flex justify-between items-center mb-4 z-50 px-2">
            <h3 className="text-white font-bold drop-shadow-md text-lg truncate max-w-[80%]">{selectedVideo.title}</h3>
            <button 
              onClick={() => { 
                stopWatchTimeTracking(); 
                setSelectedVideo(null); 
                setIsPlaying(false); 
                setIsReady(false);
                if (screenfull.isEnabled && screenfull.isFullscreen) screenfull.exit(); 
              }}
              className="bg-slate-800 hover:bg-red-500 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors shadow-lg"
              title="Close Video"
            >
              ✕
            </button>
          </div>

          <div 
            ref={playerContainerRef}
            className="w-full max-w-6xl aspect-video bg-black rounded-2xl overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.8)]"
          >
            
            {/* වීඩියෝව ලෝඩ් වනතුරු පෙන්වන Loading Spinner එක */}
            {!isReady && (
              <div className="absolute inset-0 z-30 bg-black flex flex-col items-center justify-center pointer-events-none">
                <div className="w-12 h-12 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-400 text-sm animate-pulse">වීඩියෝව සූදානම් වෙමින් පවතී...</p>
              </div>
            )}

            {/* 🔥 Official Native YouTube Iframe Embed 🔥 */}
            <iframe 
              width="100%" 
              height="100%" 
              src={embedUrl} 
              title="YouTube video player" 
              frameBorder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
              referrerPolicy="strict-origin-when-cross-origin" 
              allowFullScreen
              className="z-0 relative"
              onLoad={() => setIsReady(true)}
            ></iframe>

          </div>
        </div>
      )}

    </div>
  );
}