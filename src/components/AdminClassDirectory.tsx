import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Users, 
  UserCheck, 
  Search, 
  RefreshCw, 
  Phone, 
  MessageCircle, 
  ShieldCheck, 
  Sparkles, 
  Download, 
  Filter,
  CheckCircle2,
  XCircle,
  GraduationCap
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { subscribeRealtimeEvents } from '../realtimeSync';

interface ClassItem {
  id: string;
  name: string;
  fee: number;
}

interface LecturerInfo {
  id: string;
  name: string;
  username: string;
  whatsapp: string;
  email?: string;
  assignedClasses: string[];
}

interface StudentInfo {
  id: string;
  name: string;
  username: string;
  mobile?: string;
  whatsapp?: string;
  class_types: string[];
  is_free?: boolean;
  is_paid?: boolean;
  created_at?: string;
}

export default function AdminClassDirectory() {
  const [classesList, setClassesList] = useState<ClassItem[]>([]);
  const [lecturersList, setLecturersList] = useState<LecturerInfo[]>([]);
  const [studentsList, setStudentsList] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Class Types
      const { data: clsData } = await supabase.from('class_types').select('*');
      let classes: ClassItem[] = [];
      if (clsData && clsData.length > 0) {
        classes = clsData.map((c: any) => ({
          id: c.id,
          name: c.name || c.class_name,
          fee: Number(c.monthly_fee || c.fee || 3500)
        }));
      }

      // 2. Fetch Lecturers from staff_members
      const { data: stfData } = await supabase.from('staff_members').select('*');
      const lecturers: LecturerInfo[] = [];
      if (stfData) {
        const dbLecturers = stfData.filter((s: any) => s.role === 'lecturer');
        const targetStaff = dbLecturers.length > 0 ? dbLecturers : stfData.filter((s: any) => s.role === 'super_admin');
        
        targetStaff.forEach((s: any) => {
          const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.username;
          const assigned: string[] = Array.isArray(s.assigned_classes)
            ? s.assigned_classes
            : typeof s.assigned_classes === 'string'
            ? JSON.parse(s.assigned_classes || '[]')
            : [];
          
          lecturers.push({
            id: s.id,
            name: fullName,
            username: s.username,
            whatsapp: s.whatsapp || s.mobile || '0779630100',
            email: s.email,
            assignedClasses: assigned
          });
        });
      }

      // 3. Fetch Students
      const { data: stdData } = await supabase.from('students').select('*');
      const students: StudentInfo[] = [];
      if (stdData) {
        stdData.forEach((st: any) => {
          const assigned: string[] = Array.isArray(st.class_types)
            ? st.class_types
            : typeof st.class_types === 'string'
            ? JSON.parse(st.class_types || '[]')
            : st.class ? [st.class] : [];

          students.push({
            id: st.id,
            name: st.name || `${st.first_name || ''} ${st.last_name || ''}`.trim() || st.username,
            username: st.username,
            mobile: st.mobile || st.phone,
            whatsapp: st.whatsapp || st.mobile || st.phone,
            class_types: assigned,
            is_free: Boolean(st.is_free || st.isFreeCard),
            is_paid: Boolean(st.is_paid),
            created_at: st.created_at
          });
        });
      }

      // If class_types was empty, extract classes from students and lecturers
      if (classes.length === 0) {
        const classNamesSet = new Set<string>();
        lecturers.forEach(l => l.assignedClasses.forEach(c => classNamesSet.add(c)));
        students.forEach(s => s.class_types.forEach(c => classNamesSet.add(c)));
        classes = Array.from(classNamesSet).map((name, i) => ({
          id: `cls_${i + 1}`,
          name,
          fee: 3500
        }));
      }

      setClassesList(classes);
      setLecturersList(lecturers);
      setStudentsList(students);
    } catch (err) {
      console.warn('Error loading class directory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeRealtimeEvents((type) => {
      if (['student_updated', 'staff_updated', 'class_updated'].includes(type)) {
        loadData();
      }
    });
    return () => unsub();
  }, []);

  const norm = (s: string) => (s || '').trim().toLowerCase();

  // Filtered classes list
  const filteredClasses = useMemo(() => {
    if (selectedClass === 'all') return classesList;
    return classesList.filter(c => norm(c.name) === norm(selectedClass));
  }, [classesList, selectedClass]);

  // Export CSV for a specific class or all
  const exportCsv = (className: string, students: StudentInfo[]) => {
    const headers = ['Index,Student Name,Username,Phone,WhatsApp,Fee Category,Registered Date\n'];
    const rows = students.map((s, idx) => 
      `"${idx + 1}","${s.name}","@${s.username}","${s.mobile || '-'}","${s.whatsapp || '-'}","${s.is_free ? 'Free Card' : 'Standard'}","${s.created_at ? s.created_at.split('T')[0] : '-'}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${className}_Students_Directory.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* 1. Header & Summary Stats */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2">
              <GraduationCap size={14} />
              <span>පන්ති හා ශිෂ්‍ය නාමාවලිය (Class & Student Directory)</span>
            </div>
            <h2 className="text-2xl font-black text-white">
              🏛️ එක් එක් පන්තිවල දේශකවරුන් හා ශිෂ්‍ය නාම ලැයිස්තුව
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              සෑම පන්තියක් සඳහාම පවරා ඇති දේශකවරුන් සහ එම පන්තියට ලියාපදිංචි වී ඇති සියලුම සිසුන්ගේ නිල තොරතුරු.
            </p>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : ''} />
            <span>නැවත පූරණය කරන්න (Refresh)</span>
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold">
              <BookOpen size={20} />
            </div>
            <div>
              <span className="text-xl font-black font-mono text-white">{classesList.length}</span>
              <p className="text-[11px] text-slate-400">පද්ධතියේ සම්පූර්ණ පන්ති</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold">
              <UserCheck size={20} />
            </div>
            <div>
              <span className="text-xl font-black font-mono text-white">{lecturersList.length}</span>
              <p className="text-[11px] text-slate-400">ලියාපදිංචි දේශකවරුන්</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
              <Users size={20} />
            </div>
            <div>
              <span className="text-xl font-black font-mono text-white">{studentsList.length}</span>
              <p className="text-[11px] text-slate-400">ලියාපදිංචි සිසුන් සංඛ්‍යාව</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Controls: Search & Class Filter */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
        
        {/* Class Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedClass('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              selectedClass === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>සියලුම පන්ති (All {classesList.length})</span>
          </button>
          {classesList.map(cls => (
            <button
              key={cls.id || cls.name}
              type="button"
              onClick={() => setSelectedClass(cls.name)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                selectedClass === cls.name
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span>{cls.name}</span>
            </button>
          ))}
        </div>

        {/* Student Search */}
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="ශිෂ්‍යයා / @username සොයන්න..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

      </div>

      {/* 3. Class Directory Cards */}
      {loading ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <RefreshCw size={28} className="animate-spin text-blue-400 mx-auto" />
          <p className="text-slate-400 text-xs font-bold">දත්ත පූරණය වෙමින් පවතී (Loading Class Directory)...</p>
        </div>
      ) : filteredClasses.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl text-slate-500 text-xs">
          කිසිදු පන්තියක් හමු නොවීය.
        </div>
      ) : (
        <div className="space-y-8">
          {filteredClasses.map(cls => {
            // Find lecturers assigned to this class
            const assignedLecturers = lecturersList.filter(l => 
              l.assignedClasses.some(ac => norm(ac) === norm(cls.name))
            );

            // Find enrolled students in this class
            const enrolledInClass = studentsList.filter(s => {
              const inClass = s.class_types.some(c => norm(c) === norm(cls.name));
              if (!inClass) return false;
              if (!searchQuery.trim()) return true;
              const q = searchQuery.toLowerCase().trim();
              return s.name.toLowerCase().includes(q) || 
                     s.username.toLowerCase().includes(q) || 
                     (s.mobile && s.mobile.includes(q));
            });

            return (
              <div key={cls.id || cls.name} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                
                {/* Class Header Banner */}
                <div className="p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950/40 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                      <BookOpen size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-white">{cls.name}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                          රු. {cls.fee.toLocaleString()} / මසකට
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        ලියාපදිංචි සිසුන් {enrolledInClass.length} දෙනෙකු මෙම පන්තියට සම්බන්ධ වී ඇත.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportCsv(cls.name, enrolledInClass)}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Download size={13} />
                      <span>CSV අපනයනය (Export)</span>
                    </button>
                  </div>
                </div>

                {/* Sub-section: Assigned Lecturers for this Class */}
                <div className="p-6 bg-slate-950/60 border-b border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3 flex items-center gap-1.5">
                    <UserCheck size={14} className="text-purple-400" />
                    <span>මෙම පන්තිය සඳහා පවරා ඇති දේශකවරුන් ({assignedLecturers.length})</span>
                  </span>

                  {assignedLecturers.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs">
                      ⚠️ මෙම පන්තිය සඳහා මෙතෙක් කිසිදු දේශකයෙකු පවරා නොමැත. කාර්යමණ්ඩල කළමනාකරණයෙන් පවරන්න.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {assignedLecturers.map(l => (
                        <div key={l.id || l.name} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-black text-white block">{l.name}</span>
                            <span className="text-[11px] font-mono text-indigo-400 block">@{l.username}</span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-mono">
                              <Phone size={10} className="text-emerald-400" />
                              <span>{l.whatsapp}</span>
                            </span>
                          </div>
                          <a
                            href={`https://wa.me/${l.whatsapp.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition"
                            title="Chat on WhatsApp"
                          >
                            <MessageCircle size={15} />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sub-section: Enrolled Students Table */}
                <div className="overflow-x-auto">
                  {enrolledInClass.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      {searchQuery ? 'සෙවුමට ගැළපෙන සිසුන් හමු නොවීය.' : 'මෙම පන්තිය සඳහා මෙතෙක් කිසිදු ශිෂ්‍යයෙකු ලියාපදිංචි වී නොමැත.'}
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                        <tr>
                          <th className="p-3.5 w-12 text-center">#</th>
                          <th className="p-3.5">ශිෂ්‍යයාගේ නම (Student Name)</th>
                          <th className="p-3.5">පද්ධති නාමය (Username)</th>
                          <th className="p-3.5">දුරකථන අංකය</th>
                          <th className="p-3.5 text-center">ගාස්තු කාණ්ඩය</th>
                          <th className="p-3.5 text-center">ලියාපදිංචි දිනය</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {enrolledInClass.map((s, idx) => (
                          <tr key={s.id || s.username} className="hover:bg-slate-850/50 transition">
                            <td className="p-3.5 text-center font-mono text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="p-3.5 font-bold text-white text-sm">
                              {s.name}
                            </td>
                            <td className="p-3.5 font-mono text-blue-400 font-semibold">
                              @{s.username}
                            </td>
                            <td className="p-3.5 font-mono text-slate-300">
                              {s.mobile || s.whatsapp || '-'}
                            </td>
                            <td className="p-3.5 text-center">
                              {s.is_free ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  Free Card
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  Standard Paid
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-center font-mono text-slate-400 text-[11px]">
                              {s.created_at ? s.created_at.split('T')[0] : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
