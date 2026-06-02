import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, CheckCircle, Gift, Plus, Trash2, Layers } from 'lucide-react';

export default function AdminPaymentManager({ students, setStudents }: { students: any[], setStudents: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [globalClasses, setGlobalClasses] = useState<string[]>([]);
  const [inputMonth, setInputMonth] = useState('2026-06'); // Default Year-Month
  const [inputStatus, setInputStatus] = useState<'paid' | 'free'>('paid');

  // 1. Global Config එකෙන් පන්ති වර්ග ඔටෝ ලෝඩ් කරගැනීම
  useEffect(() => {
    const fetchGlobalConfig = async () => {
      const { data, error } = await supabase.from('site_config').select('class_rates_text').eq('id', 1).single();
      if (!error && data?.class_rates_text) {
        const classes = data.class_rates_text.split(',').map((item: string) => item.split(':')[0].trim());
        setGlobalClasses(classes);
      } else {
        setGlobalClasses(['2027 Theory', '2027 Revision']);
      }
    };
    fetchGlobalConfig();
  }, []); // <-- මෙතන තිබ්බ bracket එකේ අවුල දැන් සම්පූර්ණයෙන්ම හැදුවා!

  // 2. ඇක්ටිව් (Approved) සිසුන් පමණක් ෆිල්ටර් කර ගැනීම
  const activeStudents = students.filter(s => {
    const isApproved = s.is_approved || s.isApproved;
    if (!isApproved) return false;

    return (
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.nic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.whatsapp?.includes(searchTerm) ||
      s.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // 3. කාඩ් එකක් මාක් කිරීමේ ප්‍රධාන Function එක (Mark Card Logic)
  const handleMarkCard = async (studentId: string, className: string, monthStr: string, status: 'paid' | 'free') => {
    if (!monthStr) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let currentPaid = [...(student.active_months || student.activeMonths || [])];
    let currentFree = [...(student.free_months || student.freeMonths || [])];

    const paymentKey = `${className}:${monthStr}`;

    currentPaid = currentPaid.filter(m => m !== paymentKey);
    currentFree = currentFree.filter(m => m !== paymentKey);

    if (status === 'paid') currentPaid.push(paymentKey);
    if (status === 'free') currentFree.push(paymentKey);

    const { error } = await supabase
      .from('students')
      .update({
        active_months: currentPaid,
        free_months: currentFree
      })
      .eq('id', studentId);

    if (error) {
      alert("කාඩ්පත මාක් කිරීම අසාර්ථකයි: " + error.message);
    } else {
      setStudents((prev: any) => prev.map((s: any) => {
        if (s.id === studentId) {
          return { ...s, active_months: currentPaid, activeMonths: currentPaid, free_months: currentFree, freeMonths: currentFree };
        }
        return s;
      }));
    }
  };

  // 4. මාක් කරන ලද මාසයක් නැවත ඉවත් කිරීම (Unmark / Delete Month)
  const handleRemoveMonth = async (studentId: string, paymentKey: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const currentPaid = (student.active_months || student.activeMonths || []).filter((m: string) => m !== paymentKey);
    const currentFree = (student.free_months || student.freeMonths || []).filter((m: string) => m !== paymentKey);

    const { error } = await supabase
      .from('students')
      .update({ active_months: currentPaid, free_months: currentFree })
      .eq('id', studentId);

    if (!error) {
      setStudents((prev: any) => prev.map((s: any) => s.id === studentId ? { ...s, active_months: currentPaid, activeMonths: currentPaid, free_months: currentFree, freeMonths: currentFree } : s));
    }
  };

  // 5. මැනුවල් ලෙස සිසුවෙකුගේ පන්ති (Class Types) ඇඩ්/රිමූව් කිරීම
  const handleToggleStudentClass = async (studentId: string, className: string, currentClasses: string[]) => {
    let updatedClasses = [...currentClasses];
    if (updatedClasses.includes(className)) {
      updatedClasses = updatedClasses.filter(c => c !== className);
    } else {
      updatedClasses.push(className);
    }

    const { error } = await supabase
      .from('students')
      .update({ class_types: updatedClasses })
      .eq('id', studentId);

    if (error) {
      alert("පන්ති යාවත්කාලීන කිරීමේ දෝෂයක්: " + error.message);
    } else {
      setStudents((prev: any) => prev.map((s: any) => {
        if (s.id === studentId) {
          return { ...s, class_types: updatedClasses, classTypes: updatedClasses };
        }
        return s;
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* 🔍 සෙවුම් බාධකය */}
      <div className="bg-slate-900/60 p-4 rounded-3xl border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="නම, යූසර්නේම්, NIC මගින් සොයන්න..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="text-xs text-slate-400">
          සක්‍රීය සිසුන් සංඛ්‍යාව: <span className="text-emerald-400 font-bold">{activeStudents.length}</span>
        </div>
      </div>

      {/* 📊 මාස්ටර් වගුව */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-300 font-bold">
                <th className="p-4">සිසුවාගේ විස්තර (Student Details)</th>
                <th className="p-4">පන්ති වර්ග (Enrolled Classes)</th>
                <th className="p-4">කාඩ් පත් මාක් කිරීම (Mark Class Card)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {activeStudents.map(st => {
                const studentClasses = st.class_types || st.classTypes || [];
                const paidMonths = st.active_months || st.activeMonths || [];
                const freeMonths = st.free_months || st.freeMonths || [];

                return (
                  <tr key={st.id} className="hover:bg-slate-900/40 transition">
                    <td className="p-4 space-y-1 max-w-[220px]">
                      <div className="font-bold text-white text-sm">{st.name}</div>
                      <div className="flex gap-1.5 items-center">
                        <span className="bg-slate-950 text-blue-400 px-2 py-0.5 rounded text-[10px] border border-blue-500/20 font-mono">{st.username}</span>
                        <span className="text-slate-500 text-[10px]">NIC: {st.nic || 'N/A'}</span>
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                        {globalClasses.map(cls => {
                          const isEnrolled = studentClasses.includes(cls);
                          return (
                            <button
                              key={cls}
                              onClick={() => handleToggleStudentClass(st.id, cls, studentClasses)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition flex items-center gap-1 cursor-pointer border ${
                                isEnrolled 
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 font-bold' 
                                  : 'bg-slate-950 text-slate-600 border-transparent hover:border-slate-800'
                              }`}
                            >
                              <Layers size={10} />
                              {cls}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    <td className="p-4 space-y-3">
                      {studentClasses.length === 0 ? (
                        <span className="text-slate-600 italic text-[11px]">කිසිදු පන්තියක් තෝරාගෙන නැත.</span>
                      ) : (
                        studentClasses.map((studentClass: string) => {
                          const classPaidMonths = paidMonths.filter((m: string) => m.startsWith(`${studentClass}:`));
                          const classFreeMonths = freeMonths.filter((m: string) => m.startsWith(`${studentClass}:`));

                          return (
                            <div key={studentClass} className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                              <div className="space-y-1.5">
                                <span className="text-slate-300 font-bold text-[11px] block">{studentClass}</span>
                                <div className="flex flex-wrap gap-1">
                                  {classPaidMonths.length === 0 && classFreeMonths.length === 0 && (
                                    <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold">UNPAID (මුලික අවස්ථාව)</span>
                                  )}
                                  
                                  {classPaidMonths.map((m: string) => {
                                    const monthVal = m.split(':')[1];
                                    return (
                                      <span key={m} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1">
                                        <CheckCircle size={10} /> Paid ({monthVal})
                                        <Trash2 size={10} className="text-red-400 hover:text-red-500 cursor-pointer ml-1" onClick={() => handleRemoveMonth(st.id, m)} />
                                      </span>
                                    );
                                  })}

                                  {classFreeMonths.map((m: string) => {
                                    const monthVal = m.split(':')[1];
                                    return (
                                      <span key={m} className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1">
                                        <Gift size={10} /> Free ({monthVal})
                                        <Trash2 size={10} className="text-red-400 hover:text-red-500 cursor-pointer ml-1" onClick={() => handleRemoveMonth(st.id, m)} />
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                                <input
                                  type="month"
                                  className="bg-transparent border-none text-white text-[11px] focus:outline-none font-mono"
                                  defaultValue={inputMonth}
                                  onChange={(e) => setInputMonth(e.target.value || '2026-06')}
                                />
                                <select
                                  className="bg-slate-900 border border-slate-800 text-slate-300 rounded text-[10px] p-0.5 focus:outline-none"
                                  defaultValue={inputStatus}
                                  onChange={(e) => setInputStatus(e.target.value as any)}
                                >
                                  <option value="paid">Paid</option>
                                  <option value="free">Free</option>
                                </select>
                                <button
                                  onClick={() => handleMarkCard(st.id, studentClass, inputMonth, inputStatus)}
                                  className="bg-blue-600 hover:bg-blue-500 text-white p-1 rounded transition cursor-pointer"
                                  title="කාඩ්පත මාක් කරන්න"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </td>
                  </tr>
                );
              })}
              {activeStudents.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500 italic">කිසිදු සක්‍රීය සිසුවෙකු හමු නොවීය.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}