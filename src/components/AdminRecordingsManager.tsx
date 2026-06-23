import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Plus, Trash2, CheckCircle, AlertCircle, Youtube, Eye } from 'lucide-react';

interface Recording {
  id: string;
  title: string;
  youtube_id: string;
  video_url: string; // අලුතින් එකතු කරන ලද Column එක
  year: string;
  month: string;
  class_type: string;
  thumbnail_url: string;
}

// අලුතින් එකතු කල Interface එක
interface RecordingView {
  recording_id: string;
  username: string;
  watched_seconds: number;
}

export default function AdminRecordingsManager() {
  const [classes, setClasses] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  
  // Views ගබඩා කරගැනීමට State එකක්
  const [viewsMap, setViewsMap] = useState<Record<string, RecordingView[]>>({});
  // කුමන වීඩියෝවේ View List එක ඕපන් වෙලාද යන්න තබා ගැනීමට
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Form States
  const [title, setTitle] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const years = ['2023', '2024', '2025', '2026', '2027', '2028'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  useEffect(() => {
    fetchClasses();
    fetchRecordings();
    fetchViews();
  }, []);

  const fetchClasses = async () => {
    const { data, error } = await supabase.from('class_types_config').select('*').eq('is_active', true);
    if (data) setClasses(data);
    if (error) console.error("Error fetching classes:", error);
  };

  const fetchRecordings = async () => {
    const { data, error } = await supabase.from('recordings').select('*').order('created_at', { ascending: false });
    if (data) setRecordings(data as Recording[]);
    if (error) console.error("Error fetching recordings:", error);
  };

  // Views ලබාගන්නා Function එක
  const fetchViews = async () => {
    const { data, error } = await supabase.from('recording_views').select('*');
    if (data) {
      // Data ටික recording_id එකට අනුව Group කිරීම
      const groupedViews: Record<string, RecordingView[]> = {};
      data.forEach((view: RecordingView) => {
        if (!groupedViews[view.recording_id]) {
          groupedViews[view.recording_id] = [];
        }
        groupedViews[view.recording_id].push(view);
      });
      setViewsMap(groupedViews);
    }
    if (error) console.error("Error fetching views:", error);
  };

  const extractYouTubeID = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleClassToggle = (className: string) => {
    setSelectedClasses(prev => prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const ytId = extractYouTubeID(youtubeLink);
    if (!ytId) {
      setMessage({ type: 'error', text: 'නිවැරදි YouTube Link එකක් ලබාදෙන්න.' });
      return;
    }
    if (selectedClasses.length === 0) {
      setMessage({ type: 'error', text: 'අවම වශයෙන් එක් පන්ති වර්ගයක් හෝ තෝරන්න.' });
      return;
    }

    setLoading(true);
    const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
    
    // Player එක සඳහා සම්පූර්ණ Standard YouTube Link එක සකසා ගැනීම
    const standardVideoUrl = `https://www.youtube.com/watch?v=${ytId}`; 

    try {
      const recordsToInsert = selectedClasses.map(classType => ({
        title, 
        youtube_id: ytId, 
        video_url: standardVideoUrl, // සම්පූර්ණ ලින්ක් එක Database එකට යැවීම
        year: selectedYear, 
        month: selectedMonth, 
        class_type: classType, 
        thumbnail_url: thumbnailUrl
      }));
      
      const { error } = await supabase.from('recordings').insert(recordsToInsert);
      if (error) throw error;

      setMessage({ type: 'success', text: 'වීඩියෝව සාර්ථකව පද්ධතියට ඇතුලත් කරන ලදී!' });
      setTitle(''); setYoutubeLink(''); setSelectedClasses([]); fetchRecordings();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'වීඩියෝව ඇතුලත් කිරීමේදී දෝෂයක් මතු විය.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const password = window.prompt("මෙම වීඩියෝව මකා දැමීමට Admin Password එක ලබාදෙන්න:");
    
    if (password === null) return; 
    
    if (password !== "admin123") {
      alert("වැරදි මුරපදයක්! වීඩියෝව මකා දැමීම ප්‍රතික්ෂේප කර ඇත.");
      return;
    }

    if (window.confirm("ඔබට නිසැකවම මෙය මකා දැමීමට අවශ්‍යද?")) {
      const { error } = await supabase.from('recordings').delete().eq('id', id);
      if (error) {
        alert('දෝෂයක් මතු විය: ' + error.message);
      } else {
        fetchRecordings();
      }
    }
  };

  const formatWatchTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const groupedRecordings = recordings.reduce((acc: Record<string, Recording[]>, rec) => {
    if (!acc[rec.class_type]) acc[rec.class_type] = [];
    acc[rec.class_type].push(rec);
    return acc;
  }, {});

  return (
    <div className="lg:col-span-12 w-full min-h-screen bg-slate-900 flex-1 p-4 md:p-8 text-slate-200">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <Video className="w-8 h-8 text-blue-500" />
          <h1 className="text-2xl font-bold text-white">Recordings Manager</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
          
          {/* Add New Recording Form */}
          <div className="lg:col-span-1 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl h-fit">
            <h2 className="text-lg font-semibold text-emerald-400 mb-6 flex items-center gap-2">
              <Plus size={20} /> නව වීඩියෝවක් එක් කරන්න
            </h2>

            {message && (
              <div className={`p-4 mb-6 rounded-xl flex items-start gap-3 ${message.type === 'error' ? 'bg-red-900/30 border border-red-800 text-red-300' : 'bg-emerald-900/30 border border-emerald-800 text-emerald-300'}`}>
                {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}
                <p className="text-sm">{message.text}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">පාඩමේ මාතෘකාව (Keyword)</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="උදා: ධාරා විද්‍යාව - Part 01" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">YouTube Link එක</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Youtube className="h-5 w-5 text-slate-500" />
                  </div>
                  <input type="url" required value={youtubeLink} onChange={(e) => setYoutubeLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              {/* Year & Month Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">අවුරුද්ද (Type or Select)</label>
                  <input
                    type="text"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    list="year-list"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="උදා: 2026"
                  />
                  <datalist id="year-list">
                    {years.map(y => <option key={y} value={y} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">මාසය</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none"
                  >
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Classes */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">අදාල පන්ති වර්ග තෝරන්න</label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {classes.map((cls, idx) => {
                    const classTypeName = cls.class_types || cls.class_type || '';
                    return (
                      <label key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800 cursor-pointer transition">
                        <input type="checkbox" checked={selectedClasses.includes(classTypeName)} onChange={() => handleClassToggle(classTypeName)} className="w-4 h-4 text-blue-500 rounded border-slate-600 bg-slate-700 focus:ring-blue-500" />
                        <span className="text-sm">{classTypeName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2">
                {loading ? 'වීඩියෝව එක් කරමින් පවතී...' : 'වීඩියෝව පද්ධතියට එක් කරන්න'}
              </button>
            </form>
          </div>

          {/* Recordings List Grouped by Class Type */}
          <div className="lg:col-span-2 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <h2 className="text-lg font-semibold text-blue-400 mb-6">දැනට පද්ධතියේ ඇති වීඩියෝ</h2>

            <div className="max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
              {Object.keys(groupedRecordings).length === 0 ? (
                <div className="text-center py-10 text-slate-500">තවමත් වීඩියෝ කිසිවක් එක් කර නොමැත.</div>
              ) : (
                Object.entries(groupedRecordings).map(([classType, recs]) => (
                  <div key={classType} className="mb-8">
                    {/* Class Name Header */}
                    <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">
                      {classType} පන්තිය
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {recs.map((rec) => {
                        const recViews = viewsMap[rec.id] || [];
                        
                        return (
                          <div key={rec.id} className="bg-slate-900 rounded-xl overflow-visible border border-slate-800 flex flex-col relative">
                            <div className="relative aspect-video rounded-t-xl overflow-hidden">
                              <img src={rec.thumbnail_url} alt={rec.title} className="w-full h-full object-cover" />
                              <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs text-blue-400 font-bold border border-slate-700">
                                {rec.year} - {rec.month}
                              </div>
                            </div>
                            
                            <div className="p-4 flex-1 flex flex-col justify-between">
                              <div className="flex justify-between items-start gap-2">
                                <h3 className="text-sm font-semibold text-white line-clamp-2">{rec.title}</h3>
                                
                                {/* Eye Icon with Popover Wrapper */}
                                <div 
                                  className="relative" 
                                  onMouseLeave={() => setActiveViewId(null)}
                                >
                                  <button 
                                    onClick={() => setActiveViewId(rec.id)}
                                    className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                                    title="නැරඹූ සිසුන්"
                                  >
                                    <Eye size={14} />
                                    <span className="text-xs font-bold">{recViews.length}</span>
                                  </button>

                                  {/* Popover List */}
                                  {activeViewId === rec.id && (
                                    <div className="absolute right-0 top-8 w-56 bg-slate-800 border border-slate-700 shadow-2xl rounded-lg p-2 z-50">
                                      <h4 className="text-xs font-bold text-slate-400 border-b border-slate-700 pb-2 mb-2">
                                        නැරඹූ සිසුන් ({recViews.length})
                                      </h4>
                                      <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                                        {recViews.length === 0 ? (
                                          <p className="text-xs text-slate-500 text-center py-2">කිසිවෙකු නරඹා නැත</p>
                                        ) : (
                                          recViews.map((v, i) => (
                                            <div key={i} className="flex justify-between items-center text-xs p-1 hover:bg-slate-700 rounded">
                                              <span className="text-slate-200">{v.username}</span>
                                              <span className="text-blue-400">{formatWatchTime(v.watched_seconds)}</span>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <button
                                onClick={() => handleDelete(rec.id)}
                                className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded-lg transition text-sm border border-red-900/50"
                              >
                                <Trash2 size={16} /> ඉවත් කරන්න
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}