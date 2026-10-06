import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Plus, Trash2, CheckCircle, AlertCircle, Youtube, Eye, FileText, ExternalLink, Link2, Download, BookOpen } from 'lucide-react';

interface Recording {
  id: string;
  title: string;
  youtube_id: string;
  video_url: string;
  year: string;
  month: string;
  class_type: string;
  thumbnail_url: string;
}

interface RecordingView {
  recording_id: string;
  username: string;
  watched_seconds: number;
}

interface TuteResource {
  id: string;
  title: string;
  description?: string;
  type: string;
  link: string;
  target_month?: string;
  target_classes?: string[];
  date_added?: string;
  created_at?: string;
}

interface AdminRecordingsManagerProps {
  initialTab?: 'recordings' | 'tutes';
}

export default function AdminRecordingsManager({ initialTab = 'recordings' }: AdminRecordingsManagerProps) {
  const [activeTab, setActiveTab] = useState<'recordings' | 'tutes'>(initialTab);
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // ---------------- RECORDINGS STATES ----------------
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [viewsMap, setViewsMap] = useState<Record<string, RecordingView[]>>({});
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // ---------------- TUTES & PAPERS STATES ----------------
  const [tutesList, setTutesList] = useState<TuteResource[]>([]);
  const [tuteTitle, setTuteTitle] = useState('');
  const [tuteType, setTuteType] = useState<'tute' | 'paper'>('tute');
  const [tuteLink, setTuteLink] = useState('');
  const [tuteSelectedClasses, setTuteSelectedClasses] = useState<string[]>([]);
  const [tuteYear, setTuteYear] = useState(new Date().getFullYear().toString());
  const [tuteMonth, setTuteMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));
  const [tuteDesc, setTuteDesc] = useState('');
  const [tuteLoading, setTuteLoading] = useState(false);
  const [tuteMessage, setTuteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const years = ['2024', '2025', '2026', '2027', '2028'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const monthMap: Record<string, string> = {
    'January': '01', 'February': '02', 'March': '03', 'April': '04',
    'May': '05', 'June': '06', 'July': '07', 'August': '08',
    'September': '09', 'October': '10', 'November': '11', 'December': '12'
  };

  useEffect(() => {
    fetchClasses();
    fetchRecordings();
    fetchViews();
    fetchTutes();
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

  const fetchViews = async () => {
    const { data, error } = await supabase.from('recording_views').select('*');
    if (data) {
      const groupedViews: Record<string, RecordingView[]> = {};
      data.forEach((view: RecordingView) => {
        if (!groupedViews[view.recording_id]) groupedViews[view.recording_id] = [];
        groupedViews[view.recording_id].push(view);
      });
      setViewsMap(groupedViews);
    }
    if (error) console.error("Error fetching views:", error);
  };

  const fetchTutes = async () => {
    const { data, error } = await supabase
      .from('class_resources')
      .select('*')
      .in('type', ['tute', 'paper'])
      .order('created_at', { ascending: false });

    if (data) setTutesList(data as TuteResource[]);
    if (error) console.error("Error fetching tutes:", error);
  };

  // ---------------- RECORDINGS HANDLERS ----------------
  const extractYouTubeID = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleClassToggle = (className: string) => {
    setSelectedClasses(prev => prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]);
  };

  const handleSubmitRecording = async (e: React.FormEvent) => {
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
    const standardVideoUrl = `https://www.youtube.com/watch?v=${ytId}`; 

    try {
      const recordsToInsert = selectedClasses.map(classType => ({
        title, 
        youtube_id: ytId, 
        video_url: standardVideoUrl,
        year: selectedYear, 
        month: selectedMonth, 
        class_type: classType, 
        thumbnail_url: thumbnailUrl
      }));
      
      const { error } = await supabase.from('recordings').insert(recordsToInsert);
      if (error) throw error;

      setMessage({ type: 'success', text: 'රෙකෝඩින් සාර්ථකව ඇතුළත් කරන ලදී!' });
      setTitle('');
      setYoutubeLink('');
      setSelectedClasses([]);
      fetchRecordings();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'දත්ත ඇතුළත් කිරීමේදී දෝෂයක් සිදුවිය.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecording = async (id: string) => {
    if (!window.confirm('මෙම රෙකෝඩින් එක ඉවත් කිරීමට අවශ්‍යද?')) return;
    try {
      const { error } = await supabase.from('recordings').delete().eq('id', id);
      if (error) throw error;
      fetchRecordings();
    } catch (err) {
      console.error(err);
    }
  };

  // ---------------- TUTES HANDLERS ----------------
  const handleTuteClassToggle = (className: string) => {
    setTuteSelectedClasses(prev => prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]);
  };

  const handleSubmitTute = async (e: React.FormEvent) => {
    e.preventDefault();
    setTuteMessage(null);

    if (!tuteTitle.trim()) {
      setTuteMessage({ type: 'error', text: 'ටියුට් එකේ නම ඇතුළත් කරන්න.' });
      return;
    }

    if (!tuteLink.trim()) {
      setTuteMessage({ type: 'error', text: 'Google Drive Link එක ඇතුළත් කරන්න.' });
      return;
    }

    if (tuteSelectedClasses.length === 0) {
      setTuteMessage({ type: 'error', text: 'අවම වශයෙන් එක් පන්ති වර්ගයක් හෝ තෝරන්න.' });
      return;
    }

    setTuteLoading(true);
    const mNum = monthMap[tuteMonth] || '01';
    const targetMonthStr = `${tuteYear}-${mNum}`;

    try {
      const newResource = {
        title: tuteTitle.trim(),
        description: tuteDesc.trim() || null,
        type: tuteType,
        link: tuteLink.trim(),
        target_month: targetMonthStr,
        target_classes: tuteSelectedClasses,
        date_added: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('class_resources').insert([newResource]);
      if (error) throw error;

      setTuteMessage({ type: 'success', text: 'ටියුට් එක සාර්ථකව ඇතුළත් කරන ලදී!' });
      setTuteTitle('');
      setTuteLink('');
      setTuteDesc('');
      setTuteSelectedClasses([]);
      fetchTutes();
    } catch (err: any) {
      console.error(err);
      setTuteMessage({ type: 'error', text: 'ටියුට් එක ඇතුළත් කිරීමේදී දෝෂයක් සිදුවිය: ' + (err.message || '') });
    } finally {
      setTuteLoading(false);
    }
  };

  const handleDeleteTute = async (id: string) => {
    if (!window.confirm('මෙම ටියුට් / ලේඛනය ඉවත් කිරීමට අවශ්‍යද?')) return;
    try {
      const { error } = await supabase.from('class_resources').delete().eq('id', id);
      if (error) throw error;
      fetchTutes();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header & Sub-Tab Switcher */}
        <div className="bg-slate-900 border border-slate-800 p-5 md:p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <BookOpen className="text-amber-400" /> Tutes &amp; Records කළමනාකරණය
              </h1>
              <p className="text-xs text-slate-400 mt-1">Google Drive ලින්ක් මගින් ටියුට් / පේපර්ස් සහ YouTube පන්ති රෙකෝඩින් පහසුවෙන් කළමනාකරණය කරන්න.</p>
            </div>
          </div>

          {/* Prominent Two-Button Mode Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('tutes')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                activeTab === 'tutes'
                  ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-900/30 ring-1 ring-blue-500/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${activeTab === 'tutes' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-blue-400'}`}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    📚 ටියුට් සහ පේපර්ස් (Google Drive)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Google Drive View Link මගින් සිසුන්ට ටියුට් ලබා දෙන්න</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${activeTab === 'tutes' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {activeTab === 'tutes' ? 'තෝරා ඇත ✓' : 'තෝරන්න'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recordings')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                activeTab === 'recordings'
                  ? 'bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-900/30 ring-1 ring-amber-500/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${activeTab === 'recordings' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-amber-400'}`}>
                  <Video size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    📹 වීඩියෝ රෙකෝඩින් (YouTube Records)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">පන්ති වීඩියෝ රෙකෝඩින් සහ ශිෂ්‍ය නරඹීම් පරීක්ෂාව</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${activeTab === 'recordings' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                {activeTab === 'recordings' ? 'තෝරා ඇත ✓' : 'තෝරන්න'}
              </span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            SECTION 1: TUTES & PAPERS MANAGER (GOOGLE DRIVE LINKS)
           ========================================================================= */}
        {activeTab === 'tutes' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
            
            {/* Form Column (5 cols) */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl h-fit space-y-5">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus size={18} className="text-blue-400" /> අලුත් ටියුට් / පේපර් එකක් එක් කරන්න
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Google Drive ලින්ක් එක මගින් සිසුන්ට ටියුට් ලබා දෙන්න.</p>
              </div>

              {tuteMessage && (
                <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                  tuteMessage.type === 'success' 
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' 
                    : 'bg-red-500/15 border border-red-500/30 text-red-300'
                }`}>
                  {tuteMessage.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                  {tuteMessage.text}
                </div>
              )}

              <form onSubmit={handleSubmitTute} className="space-y-4 text-xs">
                {/* 1. Tute Title */}
                <div>
                  <label className="text-slate-300 font-bold block mb-1.5">ටියුට් / ප්‍රශ්න පත්‍රයේ නම (Title) *</label>
                  <input
                    type="text"
                    required
                    placeholder="උදා: යාන්ත්‍ර විද්‍යාව - සිද්ධාන්ත ටියුට් 01"
                    value={tuteTitle}
                    onChange={(e) => setTuteTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* 2. Type */}
                <div className="grid grid-cols-2 gap-2">
                  <label 
                    onClick={() => setTuteType('tute')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition ${
                      tuteType === 'tute' ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText size={14} /> ටියුට් (Tute)
                  </label>
                  <label 
                    onClick={() => setTuteType('paper')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition ${
                      tuteType === 'paper' ? 'bg-rose-600/20 border-rose-500 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Download size={14} /> පේපර් (Paper)
                  </label>
                </div>

                {/* 3. Google Drive Link with test preview */}
                <div>
                  <label className="text-slate-300 font-bold block mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Link2 size={13} className="text-blue-400" /> Google Drive Link එක (View / Download URL) *
                    </span>
                    {tuteLink.trim() && (
                      <a
                        href={tuteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline"
                        title="ලින්ක් එක අලුත් ටැබ් එකකින් පරීක්ෂා කරන්න"
                      >
                        <ExternalLink size={11} /> Test Link
                      </a>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      required
                      placeholder="https://drive.google.com/file/d/..."
                      value={tuteLink}
                      onChange={(e) => setTuteLink(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-[11px] focus:outline-none focus:border-blue-500"
                    />
                    {tuteLink.trim() && (
                      <a
                        href={tuteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition"
                      >
                        <ExternalLink size={12} /> Test
                      </a>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Google Drive Share settings හි 'Anyone with the link can view' ලෙස සකසා ඇති බව තහවුරු කරගන්න.</p>
                </div>

                {/* 4. Target Classes */}
                <div>
                  <label className="text-slate-300 font-bold block mb-1.5">අදාළ පන්ති වර්ගය(න්) තෝරන්න *</label>
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800 max-h-36 overflow-y-auto">
                    {classes.map((cls) => (
                      <label key={cls.id} className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white p-1">
                        <input
                          type="checkbox"
                          checked={tuteSelectedClasses.includes(cls.class_type)}
                          onChange={() => handleTuteClassToggle(cls.class_type)}
                          className="rounded text-blue-600 focus:ring-0"
                        />
                        <span className="truncate">{cls.class_type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 5. Year & Month */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1.5">වසර</label>
                    <select
                      value={tuteYear}
                      onChange={(e) => setTuteYear(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-blue-500"
                    >
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 font-bold block mb-1.5">මාසය</label>
                    <select
                      value={tuteMonth}
                      onChange={(e) => setTuteMonth(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-blue-500"
                    >
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* 6. Description */}
                <div>
                  <label className="text-slate-300 font-bold block mb-1.5">කෙටි විස්තරයක් (අමතර උපදෙස්)</label>
                  <textarea
                    rows={2}
                    placeholder="උදා: පළමු සතියේ සාකච්ඡා කෙරෙන ප්‍රශ්නාවලිය"
                    value={tuteDesc}
                    onChange={(e) => setTuteDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={tuteLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-blue-900/30 cursor-pointer disabled:opacity-50"
                >
                  {tuteLoading ? 'ඇතුළත් වෙමින් පවතී...' : 'ටියුට් එක ඇතුළත් කරන්න (Save Tute)'}
                </button>
              </form>
            </div>

            {/* List Column (7 cols) */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <FileText size={18} className="text-blue-400" /> දැනට ඇතුළත් කර ඇති ටියුට් &amp; පේපර්ස්
                  </h3>
                  <p className="text-xs text-slate-400">මුළු ටියුට් ගණන: {tutesList.length}</p>
                </div>

                <button
                  onClick={fetchTutes}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Refresh
                </button>
              </div>

              {tutesList.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs">
                  තවමත් ටියුට් හෝ පේපර්ස් ඇතුළත් කර නොමැත. වම්පස පෝරමයෙන් ඇතුළත් කරන්න.
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
                  {tutesList.map((tute) => {
                    const isTute = tute.type === 'tute';
                    const targetClasses = tute.target_classes || [];

                    return (
                      <div
                        key={tute.id}
                        className="p-4 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition"
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                              isTute ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            }`}>
                              {isTute ? 'Tute' : 'Paper'}
                            </span>
                            {tute.target_month && (
                              <span className="text-[10px] font-mono text-slate-400">
                                📅 {tute.target_month}
                              </span>
                            )}
                          </div>

                          <h4 className="font-bold text-sm text-white truncate" title={tute.title}>
                            {tute.title}
                          </h4>

                          {targetClasses.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {targetClasses.map((c, i) => (
                                <span key={i} className="text-[9px] bg-slate-900 border border-slate-800 text-amber-400 font-bold px-1.5 py-0.5 rounded">
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <a
                            href={tute.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                            title="Google Drive Link එක පරික්ෂා කරන්න"
                          >
                            <ExternalLink size={13} /> Drive
                          </a>

                          <button
                            onClick={() => handleDeleteTute(tute.id)}
                            className="p-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded-xl transition cursor-pointer"
                            title="ඉවත් කරන්න"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            SECTION 2: RECORDINGS MANAGER (YOUTUBE VIDEOS)
           ========================================================================= */}
        {activeTab === 'recordings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
            
            {/* Form Column (5 cols) */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl h-fit space-y-5">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus size={18} className="text-amber-400" /> අලුත් වීඩියෝ රෙකෝඩින් එකක් එක් කරන්න
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">YouTube Link එකක් මගින් පන්ති රෙකෝඩින් එක් කරන්න.</p>
              </div>

              {message && (
                <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                  message.type === 'success' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/15 border border-red-500/30 text-red-300'
                }`}>
                  {message.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmitRecording} className="space-y-4 text-xs">
                <div>
                  <label className="text-slate-300 font-bold block mb-1.5">වීඩියෝවේ මාතෘකාව (Title) *</label>
                  <input
                    type="text"
                    required
                    placeholder="උදා: 2026 Revision - චලිතය Day 01"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-bold block mb-1.5">YouTube Video Link (URL) *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://youtu.be/... හෝ https://www.youtube.com/watch?v=..."
                    value={youtubeLink}
                    onChange={(e) => setYoutubeLink(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-[11px] focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-bold block mb-1.5">අදාළ පන්ති වර්ගය(න්) තෝරන්න *</label>
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800 max-h-36 overflow-y-auto">
                    {classes.map((cls) => (
                      <label key={cls.id} className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white p-1">
                        <input
                          type="checkbox"
                          checked={selectedClasses.includes(cls.class_type)}
                          onChange={() => handleClassToggle(cls.class_type)}
                          className="rounded text-amber-500 focus:ring-0"
                        />
                        <span className="truncate">{cls.class_type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1.5">වසර</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                    >
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 font-bold block mb-1.5">මාසය</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                    >
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'ඇතුළත් වෙමින් පවතී...' : 'රෙකෝඩින් එක ඇතුළත් කරන්න (Save)'}
                </button>
              </form>
            </div>

            {/* List Column (7 cols) */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Youtube size={18} className="text-red-500" /> දැනට පවතින රෙකෝඩින්
                  </h3>
                  <p className="text-xs text-slate-400">මුළු වීඩියෝ ගණන: {recordings.length}</p>
                </div>
                <button
                  onClick={fetchRecordings}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Refresh
                </button>
              </div>

              {recordings.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs">
                  තවමත් රෙකෝඩින් ඇතුළත් කර නොමැත.
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
                  {recordings.map((rec) => {
                    const views = viewsMap[rec.id] || [];

                    return (
                      <div
                        key={rec.id}
                        className="p-4 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <img
                            src={rec.thumbnail_url}
                            alt=""
                            className="w-16 h-12 object-cover rounded-xl border border-slate-800 shrink-0 bg-slate-900"
                          />
                          <div className="space-y-1 min-w-0">
                            <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold">
                              {rec.class_type}
                            </span>
                            <h4 className="font-bold text-sm text-white truncate" title={rec.title}>
                              {rec.title}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {rec.year} {rec.month}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            onClick={() => setActiveViewId(activeViewId === rec.id ? null : rec.id)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1 transition cursor-pointer"
                            title="නැරඹූ සිසුන්"
                          >
                            <Eye size={13} /> {views.length}
                          </button>

                          <button
                            onClick={() => handleDeleteRecording(rec.id)}
                            className="p-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded-xl transition cursor-pointer"
                            title="ඉවත් කරන්න"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}