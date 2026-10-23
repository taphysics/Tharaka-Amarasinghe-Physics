import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Smartphone, 
  Search, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Unlock, 
  Lock, 
  Phone, 
  MessageSquare, 
  Eye, 
  Filter,
  UserX,
  History,
  ShieldCheck,
  ChevronDown,
  Copy,
  Check,
  AlertCircle
} from 'lucide-react';
import { 
  DeviceViolationRecord, 
  fetchDeviceViolations, 
  adminManualBlockStudent, 
  adminInstantUnblockStudent, 
  adminClearViolationHistory,
  formatDeviceInfo,
  isStudentBlocked,
  VIOLATION_LADDER
} from '../deviceSecurityService';
import { subscribeRealtimeEvents } from '../realtimeSync';

interface AdminDeviceSecurityManagerProps {
  students: any[];
  onUpdateStudents?: (updater: any) => void;
}

export default function AdminDeviceSecurityManager({ students, onUpdateStudents }: AdminDeviceSecurityManagerProps) {
  const [violations, setViolations] = useState<DeviceViolationRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'blocked' | 'multiple_strikes'>('all');
  const [processingUser, setProcessingUser] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual Block modal / target state
  const [selectedBlockStudent, setSelectedBlockStudent] = useState<any | null>(null);
  const [customBlockDuration, setCustomBlockDuration] = useState<'2h' | '6h' | '24h' | '3d' | '1w' | '2w' | '1mo' | 'permanent'>('2h');

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  const loadData = async () => {
    setLoading(true);
    const data = await fetchDeviceViolations();
    setViolations(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    // Subscribe to realtime updates
    const unsubscribe = subscribeRealtimeEvents((type) => {
      if (type === 'device_force_logout' || type === 'student_updated' || (type as any) === 'device_violation_updated') {
        loadData();
      }
    });

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadData();
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  // Format remaining time nicely with days/hours/mins
  const formatRemaining = (blockedUntil?: string) => {
    if (!blockedUntil) return null;
    if (blockedUntil === 'permanent') return 'සදාකාලික තහනමකි (Permanent)';

    const diff = new Date(blockedUntil).getTime() - Date.now();
    if (diff <= 0) return 'කාලය අවසන් විය (Auto-Unlocking)';

    const totalSecs = Math.floor(diff / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);

    if (days > 0) {
      return `තව දින ${days} පැය ${hours}යි`;
    }
    if (hours > 0) {
      return `තව පැය ${hours} මිනිත්තු ${minutes}යි`;
    }
    return `තව මිනිත්තු ${minutes}යි`;
  };

  // Combine registered students with violations data
  const combinedList = students.map(st => {
    const uNorm = (st.username || '').toLowerCase().trim();
    const studentViolations = violations.filter(v => (v.student_username || '').toLowerCase().trim() === uNorm);
    const latestViolation = studentViolations[0];
    const blockCheck = isStudentBlocked(st);

    const strikeCount = Number(
      st.device_violations_count ?? 
      st.deviceViolationsCount ?? 
      (studentViolations.length > 0 ? studentViolations[0].strike_count : 0)
    );

    const isBlocked = blockCheck.isBlocked || (latestViolation?.is_active && new Date(latestViolation.blocked_until).getTime() > Date.now());
    const blockedUntil = blockCheck.blockedUntil || latestViolation?.blocked_until;

    return {
      student: st,
      username: st.username,
      name: st.name || `${st.firstName || ''} ${st.lastName || ''}`.trim() || st.username,
      whatsapp: st.whatsapp || st.WhatsApp || st.mobile || '',
      strikeCount,
      isBlocked,
      blockedUntil,
      remainingMs: blockCheck.remainingMs,
      latestViolation,
      deviceInfo: st.device_info || st.deviceInfo ? formatDeviceInfo(st.device_info || st.deviceInfo) : '1 Device (Active)'
    };
  });

  // Filter list
  const filteredList = combinedList.filter(item => {
    if (filterType === 'blocked' && !item.isBlocked) return false;
    if (filterType === 'multiple_strikes' && item.strikeCount < 2) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchUser = (item.username || '').toLowerCase().includes(q);
      const matchPhone = (item.whatsapp || '').includes(q);
      if (!matchName && !matchUser && !matchPhone) return false;
    }
    return true;
  });

  const totalBlockedCount = combinedList.filter(i => i.isBlocked).length;
  const totalViolatorsCount = combinedList.filter(i => i.strikeCount > 0).length;

  // Handlers
  const handleUnblock = async (item: any) => {
    const username = item.username;
    setProcessingUser(username);
    try {
      const res = await adminInstantUnblockStudent(username, item.student?.id);
      
      // Update parent students state if available asynchronously
      if (onUpdateStudents) {
        setTimeout(() => {
          onUpdateStudents((prev: any[]) => prev.map(s => {
            if ((s.username || '').toLowerCase().trim() === username.toLowerCase().trim() || (item.student?.id && s.id === item.student.id)) {
              return {
                ...s,
                device_block_until: null,
                deviceBlockUntil: null
              };
            }
            return s;
          }));
        }, 0);
      }

      await loadData();

      if (res.error) {
        showToast('error', `අන්බ්ලොක් කිරීමේදී Database Error එකක් මතු විය: ${res.error}. (කරුණාකර Supabase RLS Fix Script එක ක්‍රියාත්මක කරන්න)`);
      } else {
        showToast('success', `සාර්ථකයි! @${username} සිසුවාගේ ගිණුම සාර්ථකව අන්බ්ලොක් කරන ලදී.`);
      }
    } catch (e: any) {
      showToast('error', `අන්බ්ලොක් කිරීමේදී දෝෂයක් මතු විය: ${e?.message || e}`);
    } finally {
      setProcessingUser(null);
    }
  };

  const handleClearHistory = async (item: any) => {
    const username = item.username;
    if (!confirm(`ඔබට @${username} සිසුවාගේ සියලුම ඩිවයිස් නීති උල්ලංඝනය කිරීමේ වාර්තා සහ Strikes බිංදුවට (0) රීසෙට් කිරීමට අවශ්‍ය බව තහවුරු කරන්නද?`)) {
      return;
    }
    setProcessingUser(username);
    try {
      const res = await adminClearViolationHistory(username, item.student?.id);

      // Update parent students state if available asynchronously
      if (onUpdateStudents) {
        setTimeout(() => {
          onUpdateStudents((prev: any[]) => prev.map(s => {
            if ((s.username || '').toLowerCase().trim() === username.toLowerCase().trim() || (item.student?.id && s.id === item.student.id)) {
              return {
                ...s,
                device_violations_count: 0,
                deviceViolationsCount: 0,
                device_block_until: null,
                deviceBlockUntil: null,
                current_device_id: null,
                currentDeviceId: null
              };
            }
            return s;
          }));
        }, 0);
      }

      await loadData();

      if (res.error) {
        showToast('error', `දත්ත මකාදැමීමේදී Database Error එකක් මතු විය: ${res.error}`);
      } else {
        showToast('success', `සාර්ථකයි! @${username} සිසුවාගේ Strikes සහ සියලුම වාර්තා ඩේටාබේස් එකෙන් මකා දමන ලදී.`);
      }
    } catch (e: any) {
      showToast('error', `වාර්තා පිරිසිදු කිරීමේදී දෝෂයක් මතු විය: ${e?.message || e}`);
    } finally {
      setProcessingUser(null);
    }
  };

  const handleConfirmManualBlock = async () => {
    if (!selectedBlockStudent) return;
    const target = selectedBlockStudent;
    setProcessingUser(target.username);
    try {
      const res = await adminManualBlockStudent(
        target.username,
        target.name,
        customBlockDuration,
        target.student?.id,
        target.strikeCount
      );

      // Update parent students state immediately asynchronously
      if (onUpdateStudents) {
        setTimeout(() => {
          onUpdateStudents((prev: any[]) => prev.map(s => {
            if ((s.username || '').toLowerCase().trim() === target.username.toLowerCase().trim() || (target.student?.id && s.id === target.student.id)) {
              return {
                ...s,
                device_block_until: res.blockedUntil,
                deviceBlockUntil: res.blockedUntil,
                device_violations_count: (target.strikeCount || 0) + 1,
                deviceViolationsCount: (target.strikeCount || 0) + 1
              };
            }
            return s;
          }));
        }, 0);
      }

      await loadData();
      setSelectedBlockStudent(null);

      if (res.error) {
        showToast('error', `බ්ලොක් කිරීමේදී Database Error එකක් මතු විය: ${res.error}. (කරුණාකර Supabase RLS Fix Script එක ක්‍රියාත්මක කරන්න)`);
      } else {
        showToast('success', `සාර්ථකයි! @${target.username} සිසුවාගේ ගිණුම සාර්ථකව බ්ලොක් කරන ලදී.`);
      }
    } catch (e: any) {
      showToast('error', `බ්ලොක් කිරීමේදී දෝෂයක් මතු විය: ${e?.message || e}`);
    } finally {
      setProcessingUser(null);
    }
  };

  const copySupabaseSql = () => {
    const sql = `-- ==============================================================================
-- Smart Physics LMS: Single Device & Bans Full Permissions SQL Fix
-- ==============================================================================
ALTER TABLE IF EXISTS public.students 
ADD COLUMN IF NOT EXISTS current_device_id TEXT,
ADD COLUMN IF NOT EXISTS device_info TEXT,
ADD COLUMN IF NOT EXISTS device_block_until TEXT,
ADD COLUMN IF NOT EXISTS device_violations_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS warning_notification JSONB;

CREATE TABLE IF NOT EXISTS public.student_device_violations (
  id TEXT PRIMARY KEY,
  student_username TEXT NOT NULL,
  student_name TEXT,
  strike_count INTEGER DEFAULT 1,
  blocked_until TEXT,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  device_info_previous TEXT,
  device_info_new TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  warning_notification_shown BOOLEAN DEFAULT FALSE,
  warning_notification_expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.student_active_sessions (
  student_username TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  device_info JSONB,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Grant full public/anon permissions so updates never fail
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all for students" ON public.students;
CREATE POLICY "Allow public all for students" ON public.students FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.student_device_violations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all for student_device_violations" ON public.student_device_violations;
CREATE POLICY "Allow public all for student_device_violations" ON public.student_device_violations FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.student_active_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all for student_active_sessions" ON public.student_active_sessions;
CREATE POLICY "Allow public all for student_active_sessions" ON public.student_active_sessions FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.students TO anon, authenticated, service_role;
GRANT ALL ON public.student_device_violations TO anon, authenticated, service_role;
GRANT ALL ON public.student_active_sessions TO anon, authenticated, service_role;
`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* Toast feedback */}
      {toastMessage && (
        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold shadow-xl animate-fade-in border ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' 
            : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" /> : <AlertCircle size={16} className="text-rose-400 shrink-0" />}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white px-2 py-0.5">✕</button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950/25 to-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <ShieldAlert size={22} />
              </span>
              <h2 className="text-xl md:text-2xl font-black text-white">
                ඩිවයිස් ආරක්ෂාව සහ බ්ලොක් කළ සිසුන් (Device Security &amp; Bans)
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              සිසුන් එක් ගිණුමකින් ඩිවයිස් කිහිපයකින් ලොග් වීම වැළැක්වීම, තාවකාලික/ස්ථිර ගිණුම් අත්හිටුවීම් සහ ක්ෂණික අන්බ්ලොක් පාලනය මෙතැනින් සිදු කළ හැක.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={copySupabaseSql}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Copy Supabase RLS Fix Script to clipboard"
            >
              {copiedSql ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedSql ? 'SQL පිටපත් විය!' : 'Supabase SQL Fix Script'}</span>
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>දත්ත යාවත්කාලීන කරන්න</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>දැනට බ්ලොක් කර ඇති ගිණුම්</span>
            <Lock size={16} className="text-rose-400" />
          </div>
          <div className="text-2xl font-black font-mono text-rose-400">
            {totalBlockedCount}
          </div>
          <p className="text-[11px] text-slate-500">නියමිත කාලය අවසන් වූ පසු ස්වයංක්‍රීයව අන්බ්ලොක් වේ</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>නීති උල්ලංඝනය කළ සිසුන් (Strikes)</span>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-400">
            {totalViolatorsCount}
          </div>
          <p className="text-[11px] text-slate-500">ඩිවයිස් කිහිපයකින් ලොග් වීමට උත්සාහ කළ</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>ස්වයංක්‍රීය විනය පියවර (Ladder)</span>
            <ShieldCheck size={16} className="text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-slate-300">
            පැය 2 ➔ 6 ➔ 24 ➔ දින 3 ➔ සතියයි ➔ සති 2 ➔ මාසය
          </div>
          <p className="text-[11px] text-slate-500">උල්ලංඝනය වන වාර ගණන අනුව ක්‍රියාත්මක වේ</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-md">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              filterType === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            සියලුම සිසුන් ({combinedList.length})
          </button>
          <button
            onClick={() => setFilterType('blocked')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              filterType === 'blocked' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Lock size={12} />
            <span>බ්ලොක් කළ ගිණුම් ({totalBlockedCount})</span>
          </button>
          <button
            onClick={() => setFilterType('multiple_strikes')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              filterType === 'multiple_strikes' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <AlertTriangle size={12} />
            <span>Strikes 2ක් හෝ වැඩි ({combinedList.filter(i => i.strikeCount >= 2).length})</span>
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="නම, Username, දුරකථන අංකය සොයන්න..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-white pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Main Table List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-4 px-5">ශිෂ්‍ය තොරතුරු (Student)</th>
                <th className="py-4 px-4">උල්ලංඝනය කළ වාර (Strikes)</th>
                <th className="py-4 px-4">වත්මන් තත්ත්වය (Status)</th>
                <th className="py-4 px-4">හඳුනාගත් ඩිවයිස් (Device Details)</th>
                <th className="py-4 px-5 text-right">ක්‍රියාමාර්ග (Admin Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 font-semibold">
                    කිසිදු ශිෂ්‍ය වාර්තාවක් හමු නොවීය.
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  const isBusy = processingUser === item.username;
                  const remainingText = formatRemaining(item.blockedUntil);

                  return (
                    <tr 
                      key={item.username}
                      className={`hover:bg-slate-850/50 transition ${
                        item.isBlocked ? 'bg-rose-950/15' : ''
                      }`}
                    >
                      {/* Student info */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-sm shrink-0 ${
                            item.isBlocked ? 'bg-rose-600' : 'bg-blue-600'
                          }`}>
                            {item.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-extrabold text-white text-sm">
                              {item.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                              <span>ID: <strong className="text-blue-400">@{item.username}</strong></span>
                              {item.whatsapp && (
                                <a 
                                  href={`https://wa.me/94${item.whatsapp.replace(/[^0-9]/g, '').replace(/^0/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-400 hover:underline flex items-center gap-1 font-bold"
                                >
                                  <MessageSquare size={11} /> {item.whatsapp}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Strikes */}
                      <td className="py-4 px-4">
                        {item.strikeCount > 0 ? (
                          <div className="space-y-1">
                            <span className={`px-2.5 py-1 rounded-xl font-black text-xs inline-flex items-center gap-1.5 border ${
                              item.strikeCount >= 3 
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}>
                              <AlertTriangle size={12} />
                              Strike {item.strikeCount}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {item.strikeCount} වන වතාව
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle2 size={13} /> පිරිසිදු ගිණුමකි
                          </span>
                        )}
                      </td>

                      {/* Block Status */}
                      <td className="py-4 px-4">
                        {item.isBlocked ? (
                          <div className="space-y-1">
                            <span className="px-2.5 py-1 rounded-xl bg-rose-600 text-white font-extrabold text-[11px] inline-flex items-center gap-1 shadow-sm">
                              <Lock size={12} /> බ්ලොක් කර ඇත
                            </span>
                            {remainingText && (
                              <span className="block text-[10px] font-mono font-bold text-rose-400">
                                {remainingText}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 font-bold text-[11px] border border-emerald-500/30">
                            සක්‍රියයි (Active)
                          </span>
                        )}
                      </td>

                      {/* Device info */}
                      <td className="py-4 px-4 max-w-xs">
                        <div className="space-y-1">
                          <div className="text-[11px] text-slate-300 font-semibold truncate flex items-center gap-1.5" title={item.deviceInfo}>
                            <Smartphone size={13} className="text-blue-400 shrink-0" />
                            <span className="truncate">{item.deviceInfo}</span>
                          </div>
                          {item.latestViolation && (
                            <span className="text-[10px] text-slate-400 block truncate" title={item.latestViolation.reason}>
                              {item.latestViolation.reason}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {item.isBlocked ? (
                            <button
                              disabled={isBusy}
                              onClick={() => handleUnblock(item)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                              title="ගිණුම වහාම අන්බ්ලොක් කරන්න"
                            >
                              <Unlock size={12} />
                              <span>{isBusy ? 'යාවත්කාලීන වේ...' : 'අන්බ්ලොක් කරන්න'}</span>
                            </button>
                          ) : (
                            <button
                              disabled={isBusy}
                              onClick={() => {
                                setSelectedBlockStudent(item);
                                setCustomBlockDuration('2h');
                              }}
                              className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 disabled:opacity-50 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              title="ගිණුම බ්ලොක් කරන්න"
                            >
                              <Lock size={12} />
                              <span>බ්ලොක් කරන්න</span>
                            </button>
                          )}

                          {item.strikeCount > 0 && (
                            <button
                              disabled={isBusy}
                              onClick={() => handleClearHistory(item)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                              title="ඉතිහාසය පිරිසිදු කර Strikes 0 කරන්න"
                            >
                              <Trash2 size={13} />
                              <span className="hidden sm:inline">Strikes මකන්න</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Block Modal */}
      {selectedBlockStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400 font-extrabold text-sm">
                <Lock size={16} />
                <span>ශිෂ්‍ය ගිණුමක් බ්ලොක් කිරීම (Manual Ban)</span>
              </div>
              <button 
                onClick={() => setSelectedBlockStudent(null)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-400">අදාළ ශිෂ්‍යයා:</p>
              <h4 className="text-base font-extrabold text-white">
                {selectedBlockStudent.name} <span className="text-blue-400 font-mono text-xs">(@{selectedBlockStudent.username})</span>
              </h4>
            </div>

            {/* Duration Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">
                බ්ලොක් කරන කාල සීමාව තෝරන්න (Select Duration):
              </label>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: '2h', label: 'පැය 2යි (2 Hours)' },
                  { id: '6h', label: 'පැය 6යි (6 Hours)' },
                  { id: '24h', label: 'පැය 24යි (24 Hours)' },
                  { id: '3d', label: 'දින 3යි (3 Days)' },
                  { id: '1w', label: 'සතියයි (1 Week)' },
                  { id: '2w', label: 'සති 2යි (2 Weeks)' },
                  { id: '1mo', label: 'මාසයයි (1 Month)' },
                  { id: 'permanent', label: 'සදාකාලිකව (Permanent)' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCustomBlockDuration(opt.id as any)}
                    className={`p-2.5 rounded-xl border text-left font-bold transition cursor-pointer ${
                      customBlockDuration === opt.id
                        ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedBlockStudent(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                අවලංගු කරන්න
              </button>
              <button
                type="button"
                disabled={processingUser === selectedBlockStudent.username}
                onClick={handleConfirmManualBlock}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold transition shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Lock size={13} />
                <span>{processingUser === selectedBlockStudent.username ? 'ක්‍රියාත්මක වෙමින්...' : 'නියෝගය ක්‍රියාත්මක කරන්න'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
