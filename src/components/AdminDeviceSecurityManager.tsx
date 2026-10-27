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
  AlertCircle,
  Monitor
} from 'lucide-react';
import { 
  DeviceViolationRecord, 
  fetchDeviceViolations, 
  adminManualBlockStudent, 
  adminInstantUnblockStudent, 
  adminClearViolationHistory,
  formatDeviceInfo,
  parseDeviceBadge,
  isStudentBlocked,
  VIOLATION_LADDER
} from '../deviceSecurityService';
import { supabase } from '../supabaseClient';
import { subscribeRealtimeEvents, emitRealtimeEvent } from '../realtimeSync';

export interface StudentLoginDevice {
  deviceNum: number;
  deviceType: 'Mobile' | 'Tablet' | 'Desktop';
  os: string;
  browser: string;
  loginDate: string;
  loginTime: string;
  isCurrent?: boolean;
}

export const extractStudentDevices = (item: any, studentViolations: DeviceViolationRecord[]): StudentLoginDevice[] => {
  const devices: StudentLoginDevice[] = [];
  const seenKeys = new Set<string>();

  const addDevice = (rawInfo: any, dateStr?: string, isCurrent = false) => {
    if (!rawInfo) return;
    const badge = parseDeviceBadge(rawInfo);
    const key = `${badge.deviceType}_${badge.os}_${badge.browser}`.toLowerCase();
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    let parsedDate = 'නොදනී';
    let parsedTime = '';
    const ts = dateStr || badge.timestamp;
    if (ts) {
      try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          parsedDate = d.toISOString().split('T')[0];
          parsedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      } catch {}
    }

    devices.push({
      deviceNum: devices.length + 1,
      deviceType: badge.deviceType,
      os: badge.os,
      browser: badge.browser,
      loginDate: parsedDate,
      loginTime: parsedTime,
      isCurrent
    });
  };

  // 1. Current active device from student record
  if (item.student?.device_info || item.student?.deviceInfo) {
    addDevice(item.student.device_info || item.student.deviceInfo, undefined, true);
  }

  // 2. Devices from violation records (attempted logins)
  studentViolations.forEach(v => {
    if (v.device_info_new) {
      addDevice(v.device_info_new, v.blocked_at);
    }
    if (v.device_info_previous) {
      addDevice(v.device_info_previous, v.blocked_at);
    }
  });

  // Fallback if none parsed
  if (devices.length === 0) {
    devices.push({
      deviceNum: 1,
      deviceType: 'Desktop',
      os: 'Standard OS',
      browser: 'Web Browser',
      loginDate: new Date().toISOString().split('T')[0],
      loginTime: '',
      isCurrent: true
    });
  }

  return devices;
};

interface AdminDeviceSecurityManagerProps {
  students: any[];
  onUpdateStudents?: (updater: any) => void;
}

export default function AdminDeviceSecurityManager({ students, onUpdateStudents }: AdminDeviceSecurityManagerProps) {
  const [localStudents, setLocalStudents] = useState<any[]>(students || []);

  useEffect(() => {
    setLocalStudents(students || []);
  }, [students]);

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
  const combinedList = localStudents.map(st => {
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

    const approvedDevices: string[] = Array.isArray(st.approved_devices)
      ? st.approved_devices
      : typeof st.approved_devices === 'string'
      ? JSON.parse(st.approved_devices || '[]')
      : [];

    const dualDeviceAllowed = Boolean(
      st.dual_device_allowed ?? 
      st.dualDeviceAllowed ?? 
      (approvedDevices.length > 0) ?? 
      false
    );

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
      deviceInfo: st.device_info || st.deviceInfo ? formatDeviceInfo(st.device_info || st.deviceInfo) : '1 Device (Active)',
      dualDeviceAllowed,
      approvedDevices
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

  // Toggle Dual Device Permission (2 Devices allowed per student - 100% Live Database)
  const handleToggleDualDevice = async (item: any) => {
    const username = item.username;
    const newStatus = !item.dualDeviceAllowed;
    setProcessingUser(username);

    // 1. Instant 0ms local state update
    item.dualDeviceAllowed = newStatus;
    if (item.student) {
      item.student.dual_device_allowed = newStatus;
      item.student.dualDeviceAllowed = newStatus;
    }

    setLocalStudents(prev => prev.map(s => {
      const match = (s.username || '').toLowerCase().trim() === (username || '').toLowerCase().trim() || 
                    (item.student?.id && s.id === item.student.id);
      if (match) {
        return {
          ...s,
          dual_device_allowed: newStatus,
          dualDeviceAllowed: newStatus
        };
      }
      return s;
    }));

    // 2. Update parent state if available
    if (onUpdateStudents) {
      onUpdateStudents((prev: any[]) => prev.map(s => {
        if ((s.username || '').toLowerCase().trim() === (username || '').toLowerCase().trim() || 
            (item.student?.id && s.id === item.student.id)) {
          return {
            ...s,
            dual_device_allowed: newStatus,
            dualDeviceAllowed: newStatus
          };
        }
        return s;
      }));
    }

    // 3. Update Live Database (Supabase)
    try {
      const studentId = item.student?.id;
      const updatePayload: any = { 
        dual_device_allowed: newStatus 
      };

      if (studentId) {
        await supabase.from('students').update(updatePayload).eq('id', studentId);
      }
      await supabase.from('students').update(updatePayload).ilike('username', username);

      // Also ensure approved_devices column aligns
      try {
        const approvedPayload: any = {
          approved_devices: newStatus ? ['device_1', 'device_2'] : []
        };
        if (studentId) {
          await supabase.from('students').update(approvedPayload).eq('id', studentId);
        }
        await supabase.from('students').update(approvedPayload).ilike('username', username);
      } catch (err) {}

      emitRealtimeEvent('student_updated', { username, dual_device_allowed: newStatus });
      showToast('success', newStatus 
        ? `@${username} සිසුවාට ඩිවයිස් 2ක් භාවිතා කිරීමට අවසර (ටික් එක) සාර්ථකව ලබා දෙන ලදී.` 
        : `@${username} සිසුවාගේ ඩිවයිස් 2 අවසරය ඉවත් කර තනි ඩිවයිස් නීතිය ක්‍රියාත්මක කරන ලදී.`);
    } catch (e: any) {
      console.error('Supabase dual device toggle error:', e);
      showToast('error', `අවසරය යාවත්කාලීන කිරීමේදී දෝෂයක්: ${e?.message || e}`);
    } finally {
      setProcessingUser(null);
    }
  };

  // Toggle Approval for a Specific Device (Max 2 devices)
  const normalizeDevKey = (d: StudentLoginDevice | string) => {
    if (typeof d === 'string') return d.trim().toLowerCase().replace(/[\s\-_]+/g, '');
    return `${d.deviceType}_${d.os}_${d.browser}`.trim().toLowerCase().replace(/[\s\-_]+/g, '');
  };

  const handleToggleApproveDevice = async (item: any, dev: StudentLoginDevice) => {
    const rawDevKey = `${dev.deviceType}_${dev.os}_${dev.browser}`.toLowerCase();
    const devKey = normalizeDevKey(dev);
    const username = item.username;
    const uNorm = (username || '').toLowerCase().trim();

    const currentApproved: string[] = Array.isArray(item.approvedDevices)
      ? [...item.approvedDevices]
      : Array.isArray(item.student?.approved_devices)
      ? [...item.student.approved_devices]
      : typeof item.student?.approved_devices === 'string'
      ? JSON.parse(item.student?.approved_devices || '[]')
      : [];

    const isAlreadyApproved = currentApproved.some(k => normalizeDevKey(k) === devKey);
    let updatedApproved: string[] = [];

    if (isAlreadyApproved) {
      updatedApproved = currentApproved.filter(k => normalizeDevKey(k) !== devKey);
    } else {
      if (currentApproved.length >= 2) {
        alert('උපරිම අනුමත කළ හැක්කේ ඩිවයිස් 2ක් පමණි. කරුණාකර තවත් ඩිවයිස් එකක් එක් කිරීමට පෙර කලින් අනුමත කළ ඩිවයිස් එකක ටික් එක ඉවත් කරන්න.');
        return;
      }
      updatedApproved = [...currentApproved, rawDevKey];
    }

    const dualAllowed = updatedApproved.length > 0;
    const updatePayload = {
      approved_devices: updatedApproved,
      dual_device_allowed: dualAllowed,
      dualDeviceAllowed: dualAllowed
    };

    // 1. Instant 0ms local state update
    item.approvedDevices = updatedApproved;
    if (item.student) {
      item.student.approved_devices = updatedApproved;
      item.student.dual_device_allowed = dualAllowed;
    }

    setLocalStudents(prev => prev.map(s => {
      const match = (s.username || '').toLowerCase().trim() === uNorm || (item.student?.id && s.id === item.student.id);
      if (match) {
        return { ...s, ...updatePayload };
      }
      return s;
    }));

    // 3. Callback to parent App.tsx if present
    if (onUpdateStudents) {
      onUpdateStudents((prev: any[]) => prev.map(s => {
        if ((s.username || '').toLowerCase().trim() === uNorm || (item.student?.id && s.id === item.student.id)) {
          return { ...s, ...updatePayload };
        }
        return s;
      }));
    }

    emitRealtimeEvent('student_updated', { username, ...updatePayload });
    showToast('success', isAlreadyApproved 
      ? `@${username} ගේ ${dev.os} (${dev.deviceType}) ඩිවයිස් අනුමැතිය ඉවත් කරන ලදී.`
      : `@${username} සිසුවා සඳහා ${dev.os} (${dev.deviceType}) ඩිවයිස් එක සාර්ථකව අනුමත කරන ලදී (${updatedApproved.length}/2).`
    );

    // 4. Background update to Supabase
    try {
      if (item.student?.id) {
        await supabase.from('students').update(updatePayload).eq('id', item.student.id);
      }
      await supabase.from('students').update(updatePayload).ilike('username', username);
    } catch (e: any) {
      console.warn('Supabase device update fallback:', e);
    }
  };

  // Handlers
  const handleUnblock = async (item: any) => {
    const username = item.username;
    setProcessingUser(username);

    // 0ms instant local optimistic update
    setViolations(prev => prev.map(v => {
      if ((v.student_username || '').toLowerCase().trim() === username.toLowerCase().trim()) {
        return { ...v, is_active: false, blocked_until: new Date(0).toISOString() };
      }
      return v;
    }));

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
        showToast('error', `අන්බ්ලොක් කිරීමේදී Database Error එකක් මතු විය: ${res.error}`);
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

    // 0ms instant local optimistic update to remove all violations for this student
    setViolations(prev => prev.filter(v => (v.student_username || '').toLowerCase().trim() !== username.toLowerCase().trim()));

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
        showToast('error', `බ්ලොක් කිරීමේදී Database Error එකක් මතු විය: ${res.error}`);
      } else {
        showToast('success', `සාර්ථකයි! @${target.username} සිසුවාගේ ගිණුම සාර්ථකව බ්ලොක් කරන ලදී.`);
      }
    } catch (e: any) {
      showToast('error', `බ්ලොක් කිරීමේදී දෝෂයක් මතු විය: ${e?.message || e}`);
    } finally {
      setProcessingUser(null);
    }
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
                <th className="py-4 px-4 text-center">ඩිවයිස් 2 අවසරය (Dual Device)</th>
                <th className="py-4 px-5 text-right">ක්‍රියාමාර්ග (Admin Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-semibold">
                    කිසිදු ශිෂ්‍ය වාර්තාවක් හමු නොවීය.
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  const isBusy = processingUser === item.username;
                  const remainingText = formatRemaining(item.blockedUntil);
                  const uNorm = (item.username || '').toLowerCase().trim();
                  const studentViolations = violations.filter(v => (v.student_username || '').toLowerCase().trim() === uNorm);
                  const studentDevices = extractStudentDevices(item, studentViolations);

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

                      {/* Device info: Sequential Devices with 2-Device Approval Checkboxes */}
                      <td className="py-4 px-4 min-w-[280px] max-w-sm">
                        {(() => {
                          const uNorm = (item.username || '').toLowerCase().trim();
                          const currentApproved: string[] = Array.isArray(item.approvedDevices)
                            ? item.approvedDevices
                            : Array.isArray(item.student?.approved_devices)
                            ? item.student.approved_devices
                            : typeof item.student?.approved_devices === 'string'
                            ? JSON.parse(item.student?.approved_devices || '[]')
                            : [];

                          return (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                                <span className="text-[10px] font-bold text-slate-400">ලොග් වූ ඩිවයිස් රෙකෝඩින්:</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border font-mono ${
                                  currentApproved.length === 2 
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                                    : currentApproved.length === 1 
                                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' 
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                  අනුමත: {currentApproved.length} / 2
                                </span>
                              </div>

                              <div className="space-y-1.5">
                                {studentDevices.map((dev) => {
                                  const devKey = normalizeDevKey(dev);
                                  const isApproved = currentApproved.some(k => normalizeDevKey(k) === devKey);

                                  return (
                                    <div 
                                      key={dev.deviceNum} 
                                      className={`p-2.5 rounded-xl border text-xs space-y-1 transition shadow-sm ${
                                        isApproved 
                                          ? 'bg-emerald-950/30 border-emerald-500/40 ring-1 ring-emerald-500/20' 
                                          : 'bg-slate-950/80 border-slate-800'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="text-blue-400 font-extrabold flex items-center gap-1.5 text-[11px]">
                                          {dev.deviceType === 'Mobile' ? (
                                            <Smartphone size={12} className="text-emerald-400 shrink-0" />
                                          ) : (
                                            <Monitor size={12} className="text-sky-400 shrink-0" />
                                          )}
                                          ඩිවයිස් {dev.deviceNum} ({dev.deviceType})
                                        </span>
                                        {dev.isCurrent ? (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold font-mono">
                                            වත්මන් (Active)
                                          </span>
                                        ) : (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                                            ලොග් වීමට දැරූ
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-200 flex items-center gap-1 font-semibold truncate">
                                        <span className="text-white truncate">{dev.os}</span>
                                        <span className="text-slate-500">•</span>
                                        <span className="text-slate-300 font-mono text-[10px] bg-slate-800/80 px-1 py-0.5 rounded border border-slate-700/60">
                                          {dev.browser}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                        <Clock size={10} className="text-slate-500 shrink-0" />
                                        <span>ලොගින්: {dev.loginDate} {dev.loginTime}</span>
                                      </div>

                                      {/* Approved Device Checkbox (Admin Selection up to 2) */}
                                      <label 
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-2 pt-1.5 mt-1 border-t border-slate-800/80 cursor-pointer select-none group"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={Boolean(isApproved)}
                                          disabled={isBusy}
                                          onChange={() => handleToggleApproveDevice(item, dev)}
                                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-500"
                                        />
                                        <span className={`text-[11px] font-bold ${isApproved ? 'text-emerald-400 font-black' : 'text-slate-400 group-hover:text-white'}`}>
                                          {isApproved ? '✓ අනුමත ඩිවයිස් එකක් (Approved)' : 'මෙම ඩිවයිස් එක අනුමත කරන්න'}
                                        </span>
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Dual Device Permission Checkbox (ඩිවයිස් දෙකක් සඳහා ඇක්සස් ලබා දීමේ ටික් එක) */}
                      <td className="py-4 px-4 text-center">
                        <label 
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl cursor-pointer select-none transition border shadow-sm ${
                            item.dualDeviceAllowed 
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/30 ring-1 ring-emerald-500/30' 
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                          }`}
                          title="සිසුවාට ඩිවයිස් 2ක් භාවිතා කිරීමට අවසර ලබා දීමට ටික් කරන්න"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(item.dualDeviceAllowed)}
                            disabled={isBusy}
                            onChange={() => handleToggleDualDevice(item)}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-500"
                          />
                          <span className={`text-xs font-black ${item.dualDeviceAllowed ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {item.dualDeviceAllowed ? '✓ ඩිවයිස් 2 සක්‍රියයි' : 'ඩිවයිස් 2 අවසරය (ටික)'}
                          </span>
                        </label>
                        <span className="block text-[9px] text-slate-500 mt-1 font-semibold">
                          {item.dualDeviceAllowed 
                            ? 'අනෙක් ඩිවයිස් එකෙන් ලොග් වූ විට පෙර ඩිවයිස් එක තත්. 5න් Logout වේ' 
                            : 'ඩිවයිස් 2කින් ලොග් වුවහොත් Strike එකක් වැටේ'}
                        </span>
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
