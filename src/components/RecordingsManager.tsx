import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Play, Lock, Eye, Calendar } from 'lucide-react';

interface Props {
  currentStudent: any;
  isPaid: boolean;
}

const RecordingsManager: React.FC<Props> = ({ currentStudent, isPaid }) => {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [progressData, setProgressData] = useState<{ [key: string]: any }>({});
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [selectedMonth, setSelectedMonth] = useState<string>('06');
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchRecordingsAndStates();
  }, [selectedYear, selectedMonth]);

  const fetchRecordingsAndStates = async () => {
    // 1. Recordings Fetching
    const { data: recData } = await supabase
      .from('recordings')
      .select('*')
      .eq('target_year', selectedYear)
      .eq('target_month', selectedMonth);

    if (recData) setRecordings(recData);

    // 2. Fetch User Progress Watch History Matrix
    const { data: progData } = await supabase
      .from('user_video_progress')
      .select('*')
      .eq('student_username', currentStudent.username);

    if (progData) {
      const progMap = progData.reduce((acc: any, curr: any) => {
        acc[curr.recording_id] = curr;
        return acc;
      }, {});
      setProgressData(progMap);
    }
  };

  const handleWatchVideo = async (video: any) => {
    if (!isPaid) return;
    setActiveVideoUrl(video.embed_code);

    // 🔗 Resume Location Trigger Point Handler Setup
    const lastProgress = progressData[video.id]?.watched_seconds || 0;
    console.log(`Resuming video from timestamp spot: ${lastProgress}s`);
  };

  return (
    <div className="space-y-6">
      {/* GLOBAL DRILLDOWN TIME FILTERS */}
      <div className="flex flex-wrap gap-4 items-center bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-amber-500" />
          <span className="text-xs font-bold text-slate-400">Filter Lectures:</span>
        </div>
        <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs font-bold rounded-xl p-2 px-3 text-white focus:outline-none">
          <option value="2026">Year: 2026</option>
          <option value="2025">Year: 2025</option>
        </select>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs font-bold rounded-xl p-2 px-3 text-white focus:outline-none">
          <option value="06">Month: June</option>
          <option value="05">Month: May</option>
          <option value="04">Month: April</option>
        </select>
      </div>

      {/* GRID DISPLAY FLOW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recordings.map((video) => {
          const state = progressData[video.id];
          const isCompleted = state?.is_completed;
          const isPartial = state && !state.is_completed;
          
          // Color Variant Definitions Matrix Rule
          const stateStickerColor = isCompleted 
            ? 'bg-slate-800 text-slate-400 border-slate-700' // Gray
            : isPartial 
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse' // Partial Yellow Anim
              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'; // Green New Unread

          const accessBlocked = !isPaid;

          return (
            <div key={video.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col group">
              {/* Thumbnail Container */}
              <div className="relative aspect-video bg-black overflow-hidden border-b border-slate-800">
                <img src={video.thumbnail_url} alt="Cover Thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition duration-300 opacity-60" />
                <div className="absolute inset-0 bg-slate-950/40" />
                
                {/* Center Touch Trigger Action Button */}
                <button 
                  onClick={() => handleWatchVideo(video)}
                  disabled={accessBlocked}
                  className="absolute inset-0 flex items-center justify-center z-20 group"
                >
                  <div className={`p-4 rounded-full shadow-2xl transform group-hover:scale-110 transition duration-200 ${accessBlocked ? 'bg-red-600/20 border border-red-500/40 text-red-500' : 'bg-amber-500 text-slate-950'}`}>
                    {accessBlocked ? <Lock size={20} /> : <Play size={20} className="fill-current" />}
                  </div>
                </button>

                {/* State Progress Ring Overlay Indicators */}
                <span className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-md ${stateStickerColor}`}>
                  {isCompleted ? 'Watched' : isPartial ? 'In Progress' : 'New Archive'}
                </span>
              </div>

              {/* Information Strip Content block */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 text-[10px] font-mono font-bold rounded text-amber-400 uppercase tracking-widest">{video.class_type}</span>
                  <h4 className="font-bold text-sm text-white mt-2 leading-snug line-clamp-2">{video.title}</h4>
                </div>

                {/* Contextual Access Error Messages Injection */}
                {accessBlocked && (
                  <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-2.5 text-[11px] text-red-400 font-medium">
                    ⚠️ ඔබ මෙම {video.class_type} ({selectedYear}-{selectedMonth}) පන්ති කාණ්ඩය සඳහා ගෙවීම් සිදුකර නොමැත. කරුණාකර ප්‍රවේශය ලබා ගැනීමට පියවන්න.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* FLOATING LIGHTBOX PLAYER FRAME */}
      {activeVideoUrl && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl relative bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
            <button onClick={() => setActiveVideoUrl(null)} className="absolute top-4 right-4 z-50 bg-slate-900 border border-slate-700 p-2 text-white rounded-xl hover:bg-slate-800 transition">Close</button>
            <div className="aspect-video w-full">
              <iframe src={activeVideoUrl} className="w-full h-full" allowFullScreen allow="autoplay" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordingsManager;