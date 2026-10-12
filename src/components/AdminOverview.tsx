import React, { useState, useEffect } from 'react';
import { StaffMember } from '../types';
import { supabase } from '../supabaseClient';
import { fetchAllPendingPayments, PendingPaymentRequest } from '../pendingPaymentsService';
import { fetchAllStaff } from '../staffService';
import { subscribeRealtimeEvents } from '../realtimeSync';
import { 
  Briefcase, GraduationCap, ShieldCheck, UserCheck, Users, 
  Clock, CheckCircle, BookOpen, Video, FileText, ArrowRight, 
  Sparkles, Calendar, DollarSign, UserPlus, Layers, ExternalLink, RefreshCw
} from 'lucide-react';

interface AdminOverviewProps {
  currentStaff: StaffMember | null;
  students: any[];
  onTabChange: (tabId: string) => void;
  availableClasses?: string[];
}

export default function AdminOverview({
  currentStaff,
  students = [],
  onTabChange,
  availableClasses = []
}: AdminOverviewProps) {
  const [loading, setLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingPaymentRequest[]>([]);
  const [lecturersList, setLecturersList] = useState<StaffMember[]>([]);
  const [scheduledLivesCount, setScheduledLivesCount] = useState(0);
  const [recordingsCount, setRecordingsCount] = useState(0);
  const [tutesCount, setTutesCount] = useState(0);
  const cleanInitialClasses = Array.from(new Set((availableClasses || []).map(c => String(c || '').trim()).filter(Boolean)));
  const [classTypesList, setClassTypesList] = useState<string[]>(cleanInitialClasses);

  // Sync availableClasses prop updates
  useEffect(() => {
    if (availableClasses && availableClasses.length > 0) {
      const clean = Array.from(new Set(availableClasses.map(c => String(c || '').trim()).filter(Boolean)));
      setClassTypesList(clean);
    }
  }, [availableClasses]);

  const role = currentStaff?.role || 'super_admin';
  const isManager = role === 'manager';
  const isLecturer = role === 'lecturer';
  const isAdmin = role === 'admin';
  const isSuperAdmin = role === 'super_admin';

  const loadOverviewData = async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      // 1. Fetch pending payment requests
      const pList = await fetchAllPendingPayments();
      setPendingRequests(pList || []);

      // 2. Fetch subordinate staff (Lecturers for Manager/Admin)
      const allStaff = await fetchAllStaff();
      const lecturers = (allStaff || []).filter(s => s.role === 'lecturer');
      setLecturersList(lecturers);

      // 3. Class types config
      const { data: ctData } = await supabase
        .from('class_types_config')
        .select('class_type')
        .eq('is_active', true)
        .order('class_type', { ascending: true });
      if (ctData && ctData.length > 0) {
        const uniqueDbClasses = Array.from(new Set(ctData.map((c: any) => String(c.class_type || '').trim()).filter(Boolean)));
        setClassTypesList(uniqueDbClasses);
      }

      // 4. Counts for lives and resources
      const { count: liveCount } = await supabase
        .from('scheduled_lives')
        .select('*', { count: 'exact', head: true });
      setScheduledLivesCount(liveCount || 0);

      const { count: resCount } = await supabase
        .from('class_resources')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'recording');
      setRecordingsCount(resCount || 0);

      const { count: tutCount } = await supabase
        .from('class_resources')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'tute');
      setTutesCount(tutCount || 0);

    } catch (err) {
      console.warn('Error loading overview data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverviewData();

    // Live continuous 1.5s database synchronization
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadOverviewData();
    }, 1500);

    const unsub = subscribeRealtimeEvents((type) => {
      if (['pending_payment_submitted', 'pending_payment_deleted', 'payment_approved', 'payment_rejected', 'student_updated', 'staff_updated'].includes(type)) {
        loadOverviewData();
      }
    });

    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [currentStaff]);

  // Derived metrics
  const totalStudents = students.length;
  const activePaidStudents = students.filter(s => s.is_paid || s.isPaid).length;
  const pendingPaymentsCount = pendingRequests.filter(p => p.status === 'pending').length;

  // For Lecturer: students in their assigned classes
  const lecturerClasses = currentStaff?.assigned_classes || [];
  const lecturerStudents = students.filter(s => {
    if (lecturerClasses.length === 0) return true;
    const sClasses = Array.isArray(s.class_types) 
      ? s.class_types 
      : Array.isArray(s.classTypes) 
        ? s.classTypes 
        : [s.class_type || s.class].filter(Boolean);
    return sClasses.some((c: string) => lecturerClasses.includes(c));
  });

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Header Profile Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className={`p-4 rounded-2xl border shadow-lg ${
              isSuperAdmin ? 'bg-purple-600/20 text-purple-400 border-purple-500/40' :
              isAdmin ? 'bg-blue-600/20 text-blue-400 border-blue-500/40' :
              isManager ? 'bg-amber-600/20 text-amber-400 border-amber-500/40' :
              'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
            }`}>
              {isSuperAdmin ? <ShieldCheck size={36} /> :
               isAdmin ? <UserCheck size={36} /> :
               isManager ? <Briefcase size={36} /> :
               <GraduationCap size={36} />}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-white">
                  {currentStaff 
                    ? `${currentStaff.first_name || ''} ${currentStaff.last_name || ''}`.trim() || currentStaff.username
                    : 'ප්‍රධාන පරිපාලක (Super Admin)'}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider border ${
                  isSuperAdmin ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                  isAdmin ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                  isManager ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {isSuperAdmin ? 'Super Admin (ප්‍රධාන පරිපාලක)' :
                   isAdmin ? 'Admin (පරිපාලක)' :
                   isManager ? 'Manager (කළමනාකරු)' :
                   'Lecturer (දේශක)'}
                </span>
              </div>

              <p className="text-xs text-slate-400">
                {currentStaff?.title || (
                  isManager ? 'ආයතනික මෙහෙයුම් කළමනාකරු (Operations & Staff Management)' :
                  isLecturer ? 'භෞතික විද්‍යා දේශක (Physics Academic Lecturer)' :
                  'පද්ධති අධීක්ෂක (System Administrator)'
                )}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400 font-mono">
                <span>👤 Username: <b className="text-blue-400">{currentStaff?.username || 'superadmin'}</b></span>
                {currentStaff?.whatsapp && (
                  <span>📱 WhatsApp: <b className="text-emerald-400">{currentStaff.whatsapp}</b></span>
                )}
                {currentStaff?.nic && (
                  <span>🆔 NIC: <b className="text-slate-300">{currentStaff.nic}</b></span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => loadOverviewData(true)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
              title="Refresh Stats"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Students */}
        <div 
          onClick={() => onTabChange('registry')}
          className="p-5 bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl transition cursor-pointer group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              {isLecturer ? 'දේශකගේ සිසුන්' : 'ලියාපදිංචි සිසුන්'}
            </span>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition">
              <Users size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              {isLecturer ? lecturerStudents.length : totalStudents}
            </span>
            <span className="text-[11px] text-emerald-400 font-bold">
              ({activePaidStudents} සක්‍රීය)
            </span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">ශිෂ්‍ය ලේඛනය බලන්න →</span>
        </div>

        {/* Metric 2: Pending Enrollments */}
        <div 
          onClick={() => onTabChange('pending_payments')}
          className="p-5 bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl transition cursor-pointer group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400">පොරොත්තු අයදුම්පත්</span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400">{pendingPaymentsCount}</span>
            {pendingPaymentsCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold animate-pulse">
                Action Required
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">අනුමත කිරීමට යන්න →</span>
        </div>

        {/* Metric 3: Subordinate Lecturers or Assigned Classes */}
        {isLecturer ? (
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">අයත් පන්ති වර්ග</span>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                <BookOpen size={18} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-white">{lecturerClasses.length}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {lecturerClasses.join(', ') || 'පන්ති නියම කර නැත'}
            </span>
          </div>
        ) : (
          <div 
            onClick={() => onTabChange('staff')}
            className="p-5 bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl transition cursor-pointer group shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-400">ලියාපදිංචි දේශකවරුන්</span>
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition">
                <GraduationCap size={18} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-purple-300">{lecturersList.length}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">කාර්යමණ්ඩලය කළමනාකරණය →</span>
          </div>
        )}

        {/* Metric 4: Live Classes & Content */}
        <div 
          onClick={() => onTabChange('live_classes')}
          className="p-5 bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl transition cursor-pointer group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">සජීවී පන්ති & රෙකෝඩින්</span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition">
              <Video size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{scheduledLivesCount}</span>
            <span className="text-[11px] text-slate-400">
              ({recordingsCount} Lessons / {tutesCount} Tutes)
            </span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">සජීවී පන්ති පාලනය →</span>
        </div>

      </div>

      {/* 3. Action Shortcuts (කළමනාකරුගේ හෝ පරිපාලකගේ ඉක්මන් මෙහෙයුම්) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
          <Sparkles className="text-amber-400" size={18} />
          <span>ඉක්මන් මෙහෙයුම් සහ ක්‍රියාමාර්ග (Quick Action Hub)</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Action 1: Add Lecturer / Staff */}
          {(isSuperAdmin || isAdmin || isManager) && (
            <button
              onClick={() => onTabChange('staff')}
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-850/80 text-left transition flex items-center justify-between group cursor-pointer"
            >
              <div className="space-y-1">
                <span className="text-xs font-extrabold text-white group-hover:text-purple-300 block">
                  {isManager ? '➕ නව Lecturer එක් කරන්න' : '👥 කාර්යමණ්ඩලය කළමනාකරණය'}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {isManager ? 'දේශකවරුන් එකතු කර පන්ති බාරදෙන්න' : 'Admin, Manager, Lecturer පාලනය'}
                </span>
              </div>
              <ArrowRight size={16} className="text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition shrink-0" />
            </button>
          )}

          {/* Action 2: Review Pending Enrollments */}
          <button
            onClick={() => onTabChange('pending_payments')}
            className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850/80 text-left transition flex items-center justify-between group cursor-pointer"
          >
            <div className="space-y-1">
              <span className="text-xs font-extrabold text-white group-hover:text-amber-300 flex items-center gap-1.5">
                <span>⏳ පොරොත්තු අයදුම්පත් අනුමත කරන්න</span>
                {pendingPaymentsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black">
                    {pendingPaymentsCount}
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-400 block">
                බැංකු රිසීට් පත් පරීක්ෂා කර සක්‍රිය කරන්න
              </span>
            </div>
            <ArrowRight size={16} className="text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition shrink-0" />
          </button>

          {/* Action 3: Manual Student Register */}
          <button
            onClick={() => onTabChange('manual_student')}
            className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850/80 text-left transition flex items-center justify-between group cursor-pointer"
          >
            <div className="space-y-1">
              <span className="text-xs font-extrabold text-white group-hover:text-emerald-300 block">
                🎓 නව ශිෂ්‍ය ලියාපදිංචිය
              </span>
              <span className="text-[11px] text-slate-400 block">
                ඇඩ්මින් විසින් සෘජුව ශිෂ්‍ය ගිණුම් සෑදීම
              </span>
            </div>
            <ArrowRight size={16} className="text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition shrink-0" />
          </button>

          {/* Action 4: Schedule Live Session */}
          <button
            onClick={() => onTabChange('live_classes')}
            className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-850/80 text-left transition flex items-center justify-between group cursor-pointer"
          >
            <div className="space-y-1">
              <span className="text-xs font-extrabold text-white group-hover:text-blue-300 block">
                🎥 සජීවී Zoom පන්ති & විභාග
              </span>
              <span className="text-[11px] text-slate-400 block">
                සජීවී පන්ති සකස් කිරීම සහ Exam Push
              </span>
            </div>
            <ArrowRight size={16} className="text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition shrink-0" />
          </button>

        </div>
      </div>

      {/* 4. Two Column Content: Class Enrolled Stats & Pending Requests Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left: Class-wise student distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Layers size={16} className="text-blue-400" />
              <span>පන්ති වර්ග අනුව ශිෂ්‍ය සහභාගීත්වය (Class Breakdown)</span>
            </h3>
            <span className="text-xs font-mono text-slate-500">{classTypesList.length} Classes</span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {Array.from(new Set(classTypesList.map(c => String(c || '').trim()).filter(Boolean))).map((cls, idx) => {
              const enrolledCount = students.filter(s => {
                const sClasses = Array.isArray(s.class_types) 
                  ? s.class_types 
                  : Array.isArray(s.classTypes) 
                    ? s.classTypes 
                    : [s.class_type || s.class].filter(Boolean);
                return sClasses.includes(cls);
              }).length;

              const percent = totalStudents > 0 ? Math.round((enrolledCount / totalStudents) * 100) : 0;

              return (
                <div key={`overview-cls-${cls}-${idx}`} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-white">{cls}</span>
                    <span className="text-blue-400 font-mono">{enrolledCount} සිසුන් ({percent}%)</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(5, percent))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Subordinate Lecturers List */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <GraduationCap size={18} className="text-purple-400" />
              <span>පද්ධතියේ ලියාපදිංචි දේශකවරුන් (Lecturers List)</span>
            </h3>
            <button
              onClick={() => onTabChange('staff')}
              className="text-xs text-purple-400 hover:underline font-bold"
            >
              සියල්ල බලන්න →
            </button>
          </div>

          {lecturersList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs space-y-2">
              <p>දැනට ලියාපදිංචි කළ කිසිදු Lecturer කෙනෙකු නොමැත.</p>
              {(isSuperAdmin || isAdmin || isManager) && (
                <button
                  onClick={() => onTabChange('staff')}
                  className="px-3.5 py-2 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold hover:bg-purple-600/30 transition cursor-pointer"
                >
                  ➕ නව Lecturer කෙනෙකු එක් කරන්න
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {lecturersList.map((lec, idx) => {
                const uniqueLecKey = lec.id ? `lec-id-${lec.id}` : `lec-user-${lec.username || idx}-${idx}`;
                return (
                  <div key={uniqueLecKey} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold text-xs">
                        {(lec.first_name || '')[0] || 'L'}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">
                          {lec.first_name} {lec.last_name}
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          {lec.title || 'Lecturer'} • <span className="font-mono text-purple-300">{lec.username}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800">
                        {(lec.assigned_classes || []).length} පන්ති
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
