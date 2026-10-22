import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { emitRealtimeEvent, subscribeRealtimeEvents } from '../realtimeSync';
import SecurityPasswordModal from './SecurityPasswordModal';
import { 
  Video, Plus, Trash2, CheckCircle, AlertCircle, Youtube, Eye, FileText, 
  ExternalLink, Link2, Download, BookOpen, RefreshCw, Search, Filter, Check, X, Film
} from 'lucide-react';

interface Recording {
  id: string;
  title: string;
  youtube_id: string;
  video_url: string;
  year: string;
  month: string;
  class_type: string;
  thumbnail_url: string;
  created_at?: string;
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
  currentStaff?: any;
}

export default function AdminRecordingsManager({ initialTab = 'recordings', currentStaff }: AdminRecordingsManagerProps) {
  const isLecturer = currentStaff?.role === 'lecturer';

  const canLecturerEdit = (createdAt?: string) => {
    if (!isLecturer) return true;
    if (!createdAt) return false;
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return diffMs <= 60 * 60 * 1000;
  };

  const getRemainingMinutes = (createdAt?: string) => {
    if (!createdAt) return 0;
    const diffMs = 60 * 60 * 1000 - (Date.now() - new Date(createdAt).getTime());
    return Math.max(0, Math.floor(diffMs / 60000));
  };

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
  const [detectedYtId, setDetectedYtId] = useState<string | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [recSearch, setRecSearch] = useState('');
  const [recFilterClass, setRecFilterClass] = useState('all');

  // ---------------- TUTES & PAPERS STATES ----------------
  const [tutesList, setTutesList] = useState<TuteResource[]>([]);
  const [tuteTitle, setTuteTitle] = useState('');
  const [tuteType, setTuteType] = useState<'tute' | 'paper'>('tute');
  const [tuteLink, setTuteLink] = useState('');
  const [tuteSelectedClasses, setTuteSelectedClasses] = useState<string[]>([]);
  const [tuteYear, setTuteYear] = useState(new Date().getFullYear().toString());
  const [tuteMonth, setTuteMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));
  const [tuteDesc, setTuteDesc] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [tuteLoading, setTuteLoading] = useState(false);
  const [tuteMessage, setTuteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [tuteSearch, setTuteSearch] = useState('');
  const [tuteFilterClass, setTuteFilterClass] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'recording' | 'tute'; id: string; title: string; created_at?: string } | null>(null);

  const years = ['2024', '2025', '2026', '2027', '2028'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const monthMap: Record<string, string> = {
    'January': '01', 'February': '02', 'March': '03', 'April': '04',
    'May': '05', 'June': '06', 'July': '07', 'August': '08',
    'September': '09', 'October': '10', 'November': '11', 'December': '12'
  };

  // Bulletproof YouTube ID Extractor (Works with ANY link: unlisted, live, embed, short, query params, etc.)
  const extractYouTubeID = (url: string): string | null => {
    if (!url) return null;
    const cleanUrl = url.replace(/["'<>]/g, '').trim();

    // 1. Direct 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
      return cleanUrl;
    }

    try {
      // 2. Parse via standard URL object
      const urlToParse = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') 
        ? cleanUrl 
        : `https://${cleanUrl}`;
      const parsedUrl = new URL(urlToParse);
      
      // youtu.be/ID (Typical unlisted link sharing format)
      if (parsedUrl.hostname.includes('youtu.be')) {
        const pathPart = parsedUrl.pathname.replace(/^\//, '').split('/')[0].split('?')[0];
        if (pathPart && /^[a-zA-Z0-9_-]{11}$/.test(pathPart)) {
          return pathPart;
        }
      }

      // youtube.com search params ?v=ID
      const vParam = parsedUrl.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      // /live/ID, /embed/ID, /shorts/ID, /v/ID
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      for (let i = 0; i < pathSegments.length; i++) {
        const seg = pathSegments[i];
        if (['live', 'embed', 'shorts', 'v', 'video'].includes(seg.toLowerCase())) {
          const nextSeg = pathSegments[i + 1]?.split('?')[0];
          if (nextSeg && /^[a-zA-Z0-9_-]{11}$/.test(nextSeg)) {
            return nextSeg;
          }
        }
      }
    } catch (e) {
      // Continue to regex patterns
    }

    // 3. Robust Regex Fallbacks
    const patterns = [
      /youtu\.be\/([a-zA-Z0-9_-]{11})/i,
      /[?&]v=([a-zA-Z0-9_-]{11})/i,
      /\/live\/([a-zA-Z0-9_-]{11})/i,
      /\/embed\/([a-zA-Z0-9_-]{11})/i,
      /\/shorts\/([a-zA-Z0-9_-]{11})/i,
      /\/video\/([a-zA-Z0-9_-]{11})/i,
      /(?:v=|be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/i
    ];

    for (const pat of patterns) {
      const match = cleanUrl.match(pat);
      if (match && match[1]) return match[1];
    }

    // 4. Any 11 char base64 string following slash or equals
    const generalMatch = cleanUrl.match(/[/=]([a-zA-Z0-9_-]{11})(?:[?&#/!]|$)/);
    if (generalMatch && generalMatch[1]) return generalMatch[1];

    return null;
  };

  // Listen to youtubeLink changes and detect ID in real time
  useEffect(() => {
    const id = extractYouTubeID(youtubeLink);
    setDetectedYtId(id);
  }, [youtubeLink]);

  useEffect(() => {
    fetchClasses();
    fetchRecordings();
    fetchViews();
    fetchTutes();

    const unsub = subscribeRealtimeEvents((type) => {
      if (type === 'recording_added' || type === 'recording_deleted') {
        fetchRecordings();
      }
      if (type === 'tute_added' || type === 'tute_deleted') {
        fetchTutes();
      }
    });
    return unsub;
  }, []);

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase.from('class_types_config').select('*').eq('is_active', true);
      if (data && data.length > 0) {
        setClasses(data);
        return;
      }
    } catch (e) {}
    // Fallback default classes
    setClasses([
      { id: '1', class_type: '2026 Theory' },
      { id: '2', class_type: '2026 Revision' },
      { id: '3', class_type: '2027 Theory' },
      { id: '4', class_type: '2027 Revision' },
      { id: '5', class_type: '2027 Paper Class' },
      { id: '6', class_type: '2028 Theory' },
      { id: '7', class_type: '2028 Revision' },
      { id: '8', class_type: '2028 Paper Class' },
    ]);
  };

  const fetchRecordings = async () => {
    try {
      const { data, error } = await supabase.from('recordings').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Supabase fetch recordings error:', error);
      }
      if (data) {
        setRecordings(data as Recording[]);
      }
    } catch (e) {
      console.error('Fetch recordings exception:', e);
    }
  };

  const fetchViews = async () => {
    try {
      const { data, error } = await supabase.from('recording_views').select('*');
      if (data) {
        const groupedViews: Record<string, RecordingView[]> = {};
        data.forEach((view: RecordingView) => {
          if (!groupedViews[view.recording_id]) groupedViews[view.recording_id] = [];
          groupedViews[view.recording_id].push(view);
        });
        setViewsMap(groupedViews);
      }
    } catch (e) {}
  };

  const fetchTutes = async () => {
    try {
      const { data, error } = await supabase
        .from('class_resources')
        .select('*')
        .in('type', ['tute', 'paper'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase fetch tutes error:', error);
      }
      if (data) {
        setTutesList(data as TuteResource[]);
      }
    } catch (e) {
      console.error('Fetch tutes exception:', e);
    }
  };

  // ---------------- RECORDINGS HANDLERS ----------------
  const handleClassToggle = (className: string) => {
    setSelectedClasses(prev => prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]);
  };

  const handleSubmitRecording = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const ytId = extractYouTubeID(youtubeLink);
    if (!ytId) {
      setMessage({ 
        type: 'error', 
        text: 'නිවැරදි YouTube Link එකක් හෝ Video ID එකක් ලබාදෙන්න. (උදා: https://youtu.be/... හෝ unlisted link)' 
      });
      return;
    }

    if (selectedClasses.length === 0) {
      setMessage({ type: 'error', text: 'අවම වශයෙන් එක් පන්ති වර්ගයක් හෝ තෝරන්න.' });
      return;
    }

    setLoading(true);
    const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    const standardVideoUrl = `https://www.youtube.com/watch?v=${ytId}`; 
    const nowIso = new Date().toISOString();

    const recordsToInsert: Recording[] = selectedClasses.map(classType => ({
      id: crypto.randomUUID(),
      title: title.trim(), 
      youtube_id: ytId, 
      video_url: standardVideoUrl,
      year: selectedYear, 
      month: selectedMonth, 
      class_type: classType, 
      thumbnail_url: thumbnailUrl,
      created_at: nowIso
    }));

    try {
      const { error: insertError } = await supabase.from('recordings').insert(recordsToInsert);
      if (insertError) {
        console.error('Supabase recordings insert error:', insertError);
        throw new Error(insertError.message || 'Supabase වෙත රෙකෝඩින් ඇතුළත් කිරීමට නොහැකි විය.');
      }

      setRecordings(prev => [...recordsToInsert, ...prev]);

      // Realtime broadcast to student dashboards
      emitRealtimeEvent('recording_added', recordsToInsert);

      setMessage({ type: 'success', text: `රෙකෝඩින් ${recordsToInsert.length} ක් සාර්ථකව Supabase ඩේටාබේස් වෙත එක් කරන ලදී!` });
      setTitle('');
      setYoutubeLink('');
      setDetectedYtId(null);
      setSelectedClasses([]);
      await fetchRecordings();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'දත්ත ඇතුළත් කිරීමේදී දෝෂයක් සිදුවිය: ' + (err.message || '') });
    } finally {
      setLoading(false);
    }
  };

  const executeDeleteTarget = async () => {
    if (!deleteTarget) return;
    if (isLecturer && !canLecturerEdit(deleteTarget.created_at)) {
      alert("පැය 1 ක කාලය ඉක්මවා ඇති බැවින් මෙම අයිතමය මකා දැමිය හැක්කේ ප්‍රධාන පරිපාලක (Super Admin / Admin / Manager) මඟින් පමණි.");
      setDeleteTarget(null);
      return;
    }
    try {
      if (deleteTarget.type === 'recording') {
        const { error: delErr } = await supabase.from('recordings').delete().eq('id', deleteTarget.id);
        if (delErr) {
          alert('රෙකෝඩින් එක මකා දැමීමට නොහැකි විය: ' + delErr.message);
          return;
        }

        setRecordings(prev => prev.filter(r => r.id !== deleteTarget.id));
        emitRealtimeEvent('recording_deleted', { id: deleteTarget.id });
        await fetchRecordings();
      } else {
        const { error: delErr } = await supabase.from('class_resources').delete().eq('id', deleteTarget.id);
        if (delErr) {
          alert('ටියුට් / ලේඛනය මකා දැමීමට නොහැකි විය: ' + delErr.message);
          return;
        }

        setTutesList(prev => prev.filter(t => t.id !== deleteTarget.id));
        emitRealtimeEvent('tute_deleted', { id: deleteTarget.id });
        await fetchTutes();
      }
      setDeleteTarget(null);
    } catch (err: any) {
      console.error(err);
      alert('මකා දැමීමේදී දෝෂයක් සිදුවිය: ' + (err?.message || ''));
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
    const nowIso = new Date().toISOString();

    const descPrefix = allowDownload ? '[ALLOW_DOWNLOAD] ' : '';
    const rawDesc = tuteDesc.trim();
    const finalDesc = `${descPrefix}${rawDesc}`.trim() || (allowDownload ? '[ALLOW_DOWNLOAD]' : undefined);

    const newResource: TuteResource = {
      id: crypto.randomUUID(),
      title: tuteTitle.trim(),
      type: tuteType,
      link: tuteLink.trim(),
      target_month: targetMonthStr,
      target_classes: tuteSelectedClasses,
      description: finalDesc,
      date_added: new Date().toISOString().split('T')[0],
      created_at: nowIso
    };

    try {
      const { error: tuteErr } = await supabase.from('class_resources').insert([newResource]);
      if (tuteErr) {
        console.error('Supabase class_resources insert error:', tuteErr);
        throw new Error(tuteErr.message || 'Supabase වෙත ටියුට් / ලේඛනය ඇතුළත් කිරීමට නොහැකි විය.');
      }

      setTutesList(prev => [newResource, ...prev]);
      emitRealtimeEvent('tute_added', newResource);

      setTuteMessage({ type: 'success', text: 'ටියුට් එක සාර්ථකව Supabase ඩේටාබේස් වෙත ඇතුළත් කරන ලදී!' });
      setTuteTitle('');
      setTuteLink('');
      setTuteDesc('');
      setTuteSelectedClasses([]);
      await fetchTutes();
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
      if (error) {
        alert('මකා දැමීමේදී දෝෂයක් සිදුවිය: ' + error.message);
        return;
      }

      setTutesList(prev => prev.filter(t => t.id !== id));
      emitRealtimeEvent('tute_deleted', { id });
      await fetchTutes();
    } catch (err: any) {
      console.error(err);
      alert('දෝෂයකි: ' + (err?.message || ''));
    }
  };

  const lecturerClasses: string[] | null = (isLecturer && currentStaff?.assigned_classes && currentStaff.assigned_classes.length > 0)
    ? currentStaff.assigned_classes
    : null;

  const displayClasses = lecturerClasses
    ? classes.filter(c => lecturerClasses.includes(c.class_type))
    : classes;

  useEffect(() => {
    if (lecturerClasses && lecturerClasses.length === 1) {
      setSelectedClasses([lecturerClasses[0]]);
      setTuteSelectedClasses([lecturerClasses[0]]);
    }
  }, [currentStaff]);

  // Filtered recordings
  const filteredRecordings = recordings.filter(r => {
    if (lecturerClasses && !lecturerClasses.includes(r.class_type)) return false;
    if (recFilterClass !== 'all' && r.class_type !== recFilterClass) return false;
    if (recSearch.trim()) {
      const q = recSearch.toLowerCase();
      const matchTitle = (r.title || '').toLowerCase().includes(q);
      const matchClass = (r.class_type || '').toLowerCase().includes(q);
      const matchYear = (r.year || '').includes(q);
      const matchMonth = (r.month || '').toLowerCase().includes(q);
      return matchTitle || matchClass || matchYear || matchMonth;
    }
    return true;
  });

  // Filtered tutes
  const filteredTutes = tutesList.filter(t => {
    if (lecturerClasses) {
      const tClasses = t.target_classes || [];
      if (!tClasses.some((tc: string) => lecturerClasses.includes(tc))) return false;
    }
    if (tuteFilterClass !== 'all') {
      const tClasses = t.target_classes || [];
      if (!tClasses.includes(tuteFilterClass)) return false;
    }
    if (tuteSearch.trim()) {
      const q = tuteSearch.toLowerCase();
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchMonth = (t.target_month || '').includes(q);
      return matchTitle || matchDesc || matchMonth;
    }
    return true;
  });

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      
      {/* Top Header & Sub-Tab Switcher - Full Screen Width */}
      <div className="bg-slate-900 border border-slate-800 p-5 md:p-6 rounded-3xl shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">
              <BookOpen className="text-amber-400" size={26} /> Tutes &amp; Recordings මධ්‍යස්ථානය
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Google Drive ලින්ක් මගින් ටියුට් / ප්‍රශ්න පත්‍ර සහ YouTube Unlisted / Public ලින්ක් මගින් පන්ති රෙකෝඩින් පුළුල් තිරයෙන් පහසුවෙන් කළමනාකරණය කරන්න.
            </p>
          </div>
        </div>

        {/* Large Tab Switcher */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <button
            type="button"
            onClick={() => setActiveTab('tutes')}
            className={`p-4 md:p-5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              activeTab === 'tutes'
                ? 'bg-blue-600/20 border-blue-500 shadow-xl shadow-blue-900/30 ring-2 ring-blue-500/50'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`p-3.5 rounded-2xl ${activeTab === 'tutes' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40' : 'bg-slate-800 text-blue-400'}`}>
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-extrabold text-white flex items-center gap-2">
                  📚 ටියුට් සහ පේපර්ස් (Google Drive)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Google Drive View Link මගින් සිසුන්ට ආරක්ෂිතව ලේඛන සපයන්න</p>
              </div>
            </div>
            <span className={`text-xs font-black px-3 py-1.5 rounded-xl ${activeTab === 'tutes' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {activeTab === 'tutes' ? 'ක්‍රියාකාරීයි ✓' : 'තෝරන්න'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('recordings')}
            className={`p-4 md:p-5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              activeTab === 'recordings'
                ? 'bg-amber-500/20 border-amber-500 shadow-xl shadow-amber-900/30 ring-2 ring-amber-500/50'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`p-3.5 rounded-2xl ${activeTab === 'recordings' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/40' : 'bg-slate-800 text-amber-400'}`}>
                <Video size={24} />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-extrabold text-white flex items-center gap-2">
                  📹 වීඩියෝ රෙකෝඩින් (YouTube Records)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">YouTube Unlisted &amp; Public වීඩියෝ රෙකෝඩින් කළමනාකරණය</p>
              </div>
            </div>
            <span className={`text-xs font-black px-3 py-1.5 rounded-xl ${activeTab === 'recordings' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
              {activeTab === 'recordings' ? 'ක්‍රියාකාරීයි ✓' : 'තෝරන්න'}
            </span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: TUTES & PAPERS MANAGER (GOOGLE DRIVE LINKS) - FULL WIDTH
         ========================================================================= */}
      {activeTab === 'tutes' && (
        <div className="space-y-6">
          
          {/* Form Card (Full Width) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Plus size={20} className="text-blue-400" /> නව ටියුට් / ප්‍රශ්න පත්‍රයක් එක් කරන්න (Add Tute)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Google Drive ලින්ක් එක මගින් සිසුන්ට ආරක්ෂිතව PDF ටියුට් ලබා දෙන්න.</p>
              </div>
            </div>

            {tuteMessage && (
              <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 ${
                tuteMessage.type === 'success' 
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' 
                  : 'bg-red-500/15 border border-red-500/30 text-red-300'
              }`}>
                {tuteMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                {tuteMessage.text}
              </div>
            )}

            <form onSubmit={handleSubmitTute} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                
                {/* 1. Title */}
                <div className="md:col-span-2">
                  <label className="text-slate-300 font-bold text-xs block mb-1.5">ටියුට් / ප්‍රශ්න පත්‍රයේ නම (Title) *</label>
                  <input
                    type="text"
                    required
                    placeholder="උදා: යාන්ත්‍ර විද්‍යාව - සිද්ධාන්ත ටියුට් 01 (Theory Sheet 01)"
                    value={tuteTitle}
                    onChange={(e) => setTuteTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* 2. Type */}
                <div>
                  <label className="text-slate-300 font-bold text-xs block mb-1.5">ලේඛන වර්ගය (Type) *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button"
                      onClick={() => setTuteType('tute')}
                      className={`py-3 rounded-2xl border text-xs flex items-center justify-center gap-1.5 font-bold cursor-pointer transition ${
                        tuteType === 'tute' ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500/40' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <FileText size={15} /> ටියුට් (Tute)
                    </button>
                    <button 
                      type="button"
                      onClick={() => setTuteType('paper')}
                      className={`py-3 rounded-2xl border text-xs flex items-center justify-center gap-1.5 font-bold cursor-pointer transition ${
                        tuteType === 'paper' ? 'bg-rose-600/20 border-rose-500 text-rose-300 ring-1 ring-rose-500/40' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Download size={15} /> පේපර් (Paper)
                    </button>
                  </div>
                </div>

              </div>

              {/* Google Drive Link */}
              <div>
                <label className="text-slate-300 font-bold text-xs block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Link2 size={14} className="text-blue-400" /> Google Drive Link එක (View / Preview URL) *
                  </span>
                  {tuteLink.trim() && (
                    <a
                      href={tuteLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink size={13} /> Test Link (නව ටැබ් එකකින් බලන්න)
                    </a>
                  )}
                </label>
                <div className="flex gap-2.5">
                  <input
                    type="url"
                    required
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                    value={tuteLink}
                    onChange={(e) => setTuteLink(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                  {tuteLink.trim() && (
                    <a
                      href={tuteLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-2xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
                    >
                      <ExternalLink size={14} /> Test
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  💡 Google Drive Share විකල්පයන්හි 'Anyone with the link can view' ලෙස තෝරා ඇති බව තහවුරු කරගන්න.
                </p>
              </div>

              {/* Classes, Year & Month */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* Target Classes */}
                <div className="lg:col-span-8">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-300 font-bold text-xs">අදාළ පන්ති වර්ගය(න්) තෝරන්න *</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTuteSelectedClasses(displayClasses.map(c => c.class_type))}
                        className="text-[10px] text-blue-400 hover:underline font-bold cursor-pointer"
                      >
                        සියල්ල තෝරන්න (Select All)
                      </button>
                      <span className="text-slate-600 text-xs">|</span>
                      <button
                        type="button"
                        onClick={() => setTuteSelectedClasses([])}
                        className="text-[10px] text-slate-400 hover:underline font-bold cursor-pointer"
                      >
                        හිස් කරන්න (Clear)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 bg-slate-950 p-3.5 rounded-2xl border border-slate-800 max-h-48 overflow-y-auto">
                    {displayClasses.map((cls) => (
                      <label key={cls.id} className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white p-1 text-xs">
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

                {/* Year & Month */}
                <div className="lg:col-span-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-bold text-xs block mb-1.5">වසර</label>
                    <select
                      value={tuteYear}
                      onChange={(e) => setTuteYear(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-3 text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                    >
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 font-bold text-xs block mb-1.5">මාසය</label>
                    <select
                      value={tuteMonth}
                      onChange={(e) => setTuteMonth(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-3 text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                    >
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

              </div>

              {/* Description */}
              <div>
                <label className="text-slate-300 font-bold text-xs block mb-1.5">කෙටි විස්තරයක් (අමතර උපදෙස්)</label>
                <textarea
                  rows={2}
                  placeholder="උදා: පළමු සතියේ සාකච්ඡා කෙරෙන ප්‍රශ්නාවලිය. සජීවී පන්තියට පෙර සම්පූර්ණ කරන්න."
                  value={tuteDesc}
                  onChange={(e) => setTuteDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Allow Student Download Permission */}
              <div className="p-3.5 bg-slate-950/90 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <label className="text-white font-bold text-xs flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allowDownload}
                      onChange={(e) => setAllowDownload(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-0 accent-emerald-500 cursor-pointer"
                    />
                    <span>සිසුන්ට මෙම PDF එක Download කිරීමට අවසර දෙන්න (Allow Student Download)</span>
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5 ml-6">
                    ටික් කර ඇති විට ගෙවීම් කළ සිසුන්ගේ Dashboard එකේ ඍජුවම බාගත හැකි Download Button එක දිස්වේ.
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border shrink-0 ${allowDownload ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                  {allowDownload ? 'DOWNLOAD ALLOWED' : 'VIEW ONLY'}
                </span>
              </div>

              <button
                type="submit"
                disabled={tuteLoading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition shadow-xl shadow-blue-900/40 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus size={16} /> {tuteLoading ? 'ඇතුළත් වෙමින් පවතී...' : 'ටියුට් එක සාර්ථකව පද්ධතියට එක් කරන්න (Save Tute)'}
              </button>
            </form>
          </div>

          {/* Tutes List Stream (Full Width Table/Grid) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <FileText size={20} className="text-blue-400" /> දැනට ඇතුළත් කර ඇති ටියුට් &amp; ප්‍රශ්න පත්‍ර
                </h3>
                <p className="text-xs text-slate-400">මුළු ලේඛන ගණන: {tutesList.length}</p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <select
                  value={tuteFilterClass}
                  onChange={(e) => setTuteFilterClass(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-3.5 py-2 rounded-xl focus:outline-none"
                >
                  <option value="all">සියලු පන්ති (All Classes)</option>
                  {displayClasses.map(c => (
                    <option key={c.id} value={c.class_type}>{c.class_type}</option>
                  ))}
                </select>

                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ටියුට් සොයන්න..."
                    value={tuteSearch}
                    onChange={(e) => setTuteSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-white pl-9 pr-3 py-2 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  onClick={fetchTutes}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RefreshCw size={13} /> Refresh
                </button>
              </div>
            </div>

            {filteredTutes.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs space-y-2">
                <FileText size={32} className="mx-auto text-slate-600" />
                <p className="font-bold">කිසිදු ටියුට් එකක් හමු නොවීය.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTutes.map((tute) => {
                  const isTute = tute.type === 'tute';
                  const targetClasses = tute.target_classes || [];

                  return (
                    <div
                      key={tute.id}
                      className="p-5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-3xl flex flex-col justify-between gap-4 transition shadow-md group"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl uppercase border ${
                            isTute ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}>
                            {isTute ? '📄 Tute' : '📝 Paper'}
                          </span>

                          {tute.target_month && (
                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg">
                              📅 {tute.target_month}
                            </span>
                          )}
                        </div>

                        <h4 className="font-extrabold text-sm text-white group-hover:text-blue-300 transition line-clamp-2" title={tute.title}>
                          {tute.title}
                        </h4>

                        {tute.description && (
                          <p className="text-xs text-slate-400 line-clamp-2">
                            {tute.description}
                          </p>
                        )}

                        {targetClasses.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {targetClasses.map((c, i) => (
                              <span key={i} className="text-[10px] bg-slate-900 border border-slate-800 text-amber-300 font-bold px-2 py-0.5 rounded-lg">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-900 gap-2">
                        <a
                          href={tute.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                          title="Google Drive Link එක පරික්ෂා කරන්න"
                        >
                          <ExternalLink size={13} /> View Link
                        </a>

                        {isLecturer && !canLecturerEdit(tute.created_at) ? (
                          <span 
                            className="text-[10px] bg-slate-900 border border-slate-800 text-slate-500 px-2 py-1.5 rounded"
                            title="පැය 1 ඉක්මවා ඇති බැවින් මැකීම කළ හැක්කේ සුපර් ඇඩ්මින් / ඇඩ්මින් / මැනේජර් මඟින් පමණි."
                          >
                            🔒 Locked (&gt;1h)
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteTarget({ type: 'tute', id: tute.id, title: tute.title, created_at: tute.created_at })}
                            className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-xl transition cursor-pointer"
                            title={isLecturer ? `ඉවත් කරන්න (Delete - ${getRemainingMinutes(tute.created_at)} mins left)` : "ඉවත් කරන්න (Delete)"}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
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
          SECTION 2: RECORDINGS MANAGER (YOUTUBE VIDEOS) - FULL WIDTH & FIXED PARSER
         ========================================================================= */}
      {activeTab === 'recordings' && (
        <div className="space-y-6">
          
          {/* Add Recording Form (Full Width) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Plus size={20} className="text-amber-400" /> නව වීඩියෝ රෙකෝඩින් එකක් එක් කරන්න (Add Class Recording)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                YouTube Unlisted හෝ Public ඕනෑම ලින්ක් එකක් ඇතුළත් කරන්න. ලින්ක් එක ඇතුළත් කළ විගස පහතින් Preview එක දිස්වේ.
              </p>
            </div>

            {message && (
              <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 ${
                message.type === 'success' 
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' 
                  : 'bg-red-500/15 border border-red-500/30 text-red-300'
              }`}>
                {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmitRecording} className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* Title */}
                <div className="lg:col-span-6">
                  <label className="text-slate-300 font-bold text-xs block mb-1.5">වීඩියෝවේ මාතෘකාව (Title) *</label>
                  <input
                    type="text"
                    required
                    placeholder="උදා: 2027 Theory - චලිතය Day 01 (Motion Day 01)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* YouTube Link with Realtime ID & Thumbnail Preview */}
                <div className="lg:col-span-6">
                  <label className="text-slate-300 font-bold text-xs block mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Youtube size={15} className="text-red-500" /> YouTube Video Link (URL හෝ Unlisted Link) *
                    </span>
                    {detectedYtId && (
                      <span className="text-emerald-400 text-xs font-mono font-bold flex items-center gap-1">
                        <Check size={13} /> Valid ID: {detectedYtId}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="උදා: https://youtu.be/... හෝ https://www.youtube.com/watch?v=... (Unlisted or Public)"
                    value={youtubeLink}
                    onChange={(e) => setYoutubeLink(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    💡 YouTube Unlisted ලින්ක්, Short ලින්ක් (`youtu.be/`), Live ලින්ක් හෝ සම්පූර්ණ URL ඕනෑම ආකෘතියකට සහය දක්වයි.
                  </p>
                </div>

              </div>

              {/* Live Preview Box if valid ID detected */}
              {detectedYtId && (
                <div className="p-4 bg-slate-950/80 border border-amber-500/40 rounded-2xl flex flex-col sm:flex-row items-center gap-4 animate-in fade-in duration-200">
                  <img
                    src={`https://img.youtube.com/vi/${detectedYtId}/hqdefault.jpg`}
                    alt="Preview"
                    className="w-36 h-24 object-cover rounded-xl border border-slate-800 shrink-0 shadow-md bg-slate-900"
                    onError={(e: any) => {
                      e.target.src = `https://img.youtube.com/vi/${detectedYtId}/default.jpg`;
                    }}
                  />
                  <div className="space-y-1 text-xs min-w-0 flex-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                      ✓ YouTube Video හඳුනාගන්නා ලදී
                    </span>
                    <p className="font-bold text-white text-sm">
                      {title || 'වීඩියෝ මාතෘකාව ඉහතින් ඇතුළත් කරන්න'}
                    </p>
                    <p className="text-slate-400 font-mono text-[11px]">
                      Video ID: <span className="text-amber-400 font-bold">{detectedYtId}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Class Types & Year/Month Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                <div className="lg:col-span-8">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-300 font-bold text-xs">අදාළ පන්ති වර්ගය(න්) තෝරන්න *</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedClasses(displayClasses.map(c => c.class_type))}
                        className="text-[10px] text-amber-400 hover:underline font-bold cursor-pointer"
                      >
                        සියල්ල තෝරන්න (Select All)
                      </button>
                      <span className="text-slate-600 text-xs">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedClasses([])}
                        className="text-[10px] text-slate-400 hover:underline font-bold cursor-pointer"
                      >
                        හිස් කරන්න (Clear)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 bg-slate-950 p-3.5 rounded-2xl border border-slate-800 max-h-48 overflow-y-auto">
                    {displayClasses.map((cls) => (
                      <label key={cls.id} className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white p-1 text-xs">
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

                {/* Year & Month */}
                <div className="lg:col-span-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-bold text-xs block mb-1.5">වසර</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-3 text-white text-xs font-bold focus:outline-none focus:border-amber-500"
                    >
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 font-bold text-xs block mb-1.5">මාසය</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-3 text-white text-xs font-bold focus:outline-none focus:border-amber-500"
                    >
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl transition shadow-xl shadow-amber-500/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus size={16} /> {loading ? 'ඇතුළත් වෙමින් පවතී...' : 'රෙකෝඩින් එක සාර්ථකව පද්ධතියට එක් කරන්න (Save Recording)'}
              </button>
            </form>
          </div>

          {/* Recordings Stream (Full Width Grid) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Youtube size={22} className="text-red-500" /> දැනට පද්ධතියේ පවතින රෙකෝඩින්
                </h3>
                <p className="text-xs text-slate-400">මුළු වීඩියෝ ගණන: {recordings.length}</p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <select
                  value={recFilterClass}
                  onChange={(e) => setRecFilterClass(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-3.5 py-2 rounded-xl focus:outline-none"
                >
                  <option value="all">සියලු පන්ති (All Classes)</option>
                  {displayClasses.map(c => (
                    <option key={c.id} value={c.class_type}>{c.class_type}</option>
                  ))}
                </select>

                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="රෙකෝඩින් සොයන්න..."
                    value={recSearch}
                    onChange={(e) => setRecSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-white pl-9 pr-3 py-2 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  onClick={fetchRecordings}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RefreshCw size={13} /> Refresh
                </button>
              </div>
            </div>

            {filteredRecordings.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs space-y-2">
                <Video size={32} className="mx-auto text-slate-600" />
                <p className="font-bold">කිසිදු රෙකෝඩින් එකක් හමු නොවීය.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRecordings.map((rec) => {
                  const views = viewsMap[rec.id] || [];

                  return (
                    <div
                      key={rec.id}
                      className="p-5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-3xl flex flex-col justify-between gap-4 transition shadow-md group"
                    >
                      <div className="space-y-3">
                        <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
                          <img
                            src={rec.thumbnail_url}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            onError={(e: any) => {
                              const ytId = rec.youtube_id;
                              if (ytId) e.target.src = `https://img.youtube.com/vi/${ytId}/default.jpg`;
                            }}
                          />
                          <div className="absolute top-2.5 left-2.5">
                            <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg shadow-md font-mono">
                              {rec.class_type}
                            </span>
                          </div>
                          <div className="absolute bottom-2.5 right-2.5 bg-black/80 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                            {rec.year} - {rec.month}
                          </div>
                        </div>

                        <h4 className="font-extrabold text-sm text-white group-hover:text-amber-400 transition line-clamp-2" title={rec.title}>
                          {rec.title}
                        </h4>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-900 gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setActiveViewId(activeViewId === rec.id ? null : rec.id)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-xl border border-slate-800 flex items-center gap-1.5 transition cursor-pointer"
                            title="නැරඹූ සිසුන්"
                          >
                            <Eye size={13} className="text-amber-400" /> {views.length} Views
                          </button>

                          <a
                            href={rec.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition"
                            title="YouTube වෙතින් බලන්න"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>

                        {isLecturer && !canLecturerEdit(rec.created_at) ? (
                          <span 
                            className="text-[10px] bg-slate-900 border border-slate-800 text-slate-500 px-2 py-1.5 rounded"
                            title="පැය 1 ඉක්මවා ඇති බැවින් මැකීම කළ හැක්කේ සුපර් ඇඩ්මින් / ඇඩ්මින් / මැනේජර් මඟින් පමණි."
                          >
                            🔒 Locked (&gt;1h)
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteTarget({ type: 'recording', id: rec.id, title: rec.title, created_at: rec.created_at })}
                            className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-xl transition cursor-pointer"
                            title={isLecturer ? `ඉවත් කරන්න (Delete - ${getRemainingMinutes(rec.created_at)} mins left)` : "ඉවත් කරන්න (Delete)"}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      {/* Views Dropdown Drawer if active */}
                      {activeViewId === rec.id && (
                        <div className="mt-2 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-1.5 text-xs animate-in fade-in">
                          <span className="font-bold text-slate-300 block border-b border-slate-800 pb-1">නැරඹූ සිසුන්ගේ ලැයිස්තුව:</span>
                          {views.length === 0 ? (
                            <p className="text-slate-500 text-[11px] italic">තවමත් කිසිදු සිසුවෙකු නරඹා නොමැත.</p>
                          ) : (
                            <div className="max-h-28 overflow-y-auto space-y-1">
                              {views.map((v, idx) => (
                                <div key={idx} className="flex justify-between text-[11px]">
                                  <span className="text-amber-400">@{v.username}</span>
                                  <span className="text-slate-400 font-mono">{Math.floor(v.watched_seconds / 60)} min</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Security Password Protected Deletion Modal */}
      {deleteTarget && (
        <SecurityPasswordModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onConfirm={executeDeleteTarget}
          title={deleteTarget.type === 'recording' ? 'පන්ති රෙකෝඩින් ඉවත් කිරීම (Delete Recording)' : 'ටියුට් / නිබන්ධන ඉවත් කිරීම (Delete Resource)'}
          description="මෙම අයිතමය දත්ත ගබඩාවෙන් ස්ථිරවම මකා දැමීමට කරුණාකර පරිපාලක ආරක්ෂක මුරපදය ඇතුළත් කරන්න."
          itemSummary={deleteTarget.title}
          actionButtonText="ස්ථිරවම මකා දමන්න (Delete Now)"
          isDangerous={true}
        />
      )}

    </div>
  );
}