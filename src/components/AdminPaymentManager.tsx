import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Search, UserCheck, Settings2, Trash2 } from 'lucide-react';

export default function AdminPaymentManager({ students }: { students: any[] }) {
  const [filterMonth, setFilterMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [filterClass, setFilterClass] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Automatically categorize students
  const filteredStudents = students.filter(s => {
    const matchesSearch = s.nic?.includes(searchTerm) || s.username?.toLowerCase().includes(searchTerm.toLowerCase()) || s.mobile?.includes(searchTerm);
    const matchesClass = filterClass ? s.class_types?.includes(filterClass) : true;
    return matchesSearch && matchesClass;
  });

  const unpaidStudents = filteredStudents.filter(s => s.plan_type === 'paid' && !s.active_months?.includes(filterMonth));
  const paidStudents = filteredStudents.filter(s => s.plan_type === 'paid' && s.active_months?.includes(filterMonth));
  const freeStudents = filteredStudents.filter(s => s.plan_type === 'free');

  const handleMarkPaid = async (studentId: string, currentMonths: string[] = []) => {
    if (!currentMonths.includes(filterMonth)) {
      const newMonths = [...currentMonths, filterMonth];
      await supabase.from('students').update({ active_months: newMonths, is_approved: true }).eq('id', studentId);
    }
  };

  const handleMarkUnpaid = async (studentId: string, currentMonths: string[] = []) => {
    const newMonths = currentMonths.filter(m => m !== filterMonth);
    await supabase.from('students').update({ active_months: newMonths }).eq('id', studentId);
  };
  
  const handleDeleteFreePlan = async (studentId: string) => {
    if(window.confirm('මෙම සිසුවාගේ Free ප්ලෑන් එක අවලංගු කිරීමට අවශ්‍යද? එසේ වුවහොත් මොහුව ගාස්තු ගෙවන කාණ්ඩයට (Unpaid) මාරු වේ.')) {
       await supabase.from('students').update({ plan_type: 'paid' }).eq('id', studentId);
    }
  };

  const handleSendReminder = () => {
     alert('WhatsApp API connection needed to send bulk messages. Not configured yet.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <Settings2 size={20} className="text-amber-500" /> Payment & Access Manager
        </h3>
        <div className="flex gap-2">
           <input 
             type="month"
             value={filterMonth}
             onChange={(e) => setFilterMonth(e.target.value)}
             className="bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 focus:border-amber-500 focus:outline-none text-sm"
           />
           <select
             value={filterClass}
             onChange={(e) => setFilterClass(e.target.value)}
             className="bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 focus:border-amber-500 focus:outline-none text-sm"
           >
              <option value="">All Classes</option>
              {['2026 Theory', '2026 Revision', '2027 Theory', '2027 Revision', '2028 Theory'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
           </select>
        </div>
      </div>

      <div className="relative mb-6">
        <input 
          type="text"
          placeholder="Search by Username, NIC, Mobile..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900/60 border border-slate-800 text-white pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500"
        />
        <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Unpaid Column */}
        <div className="bg-slate-900/40 rounded-2xl border border-red-500/20 p-4 space-y-3">
          <div className="flex justify-between items-center border-b border-red-500/20 pb-2">
            <h4 className="font-bold text-red-400">Unpaid ({filterMonth})</h4>
            <button onClick={handleSendReminder} className="text-[10px] bg-red-500/20 text-red-500 px-2 py-1 rounded hover:bg-red-500/30">
              Send Mass Reminder
            </button>
          </div>
          <div className="max-h-[500px] overflow-y-auto pr-2 space-y-2">
             {unpaidStudents.map(s => (
               <div key={s.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center group">
                 <div>
                   <div className="text-white text-xs font-bold">{s.username}</div>
                   <div className="text-[10px] text-slate-400">{s.nic || s.mobile}</div>
                 </div>
                 <button onClick={() => handleMarkPaid(s.id, s.active_months)} className="text-green-500 opacity-0 group-hover:opacity-100 transition px-2 hover:bg-slate-900 rounded cursor-pointer">
                   <UserCheck size={16} />
                 </button>
               </div>
             ))}
             {unpaidStudents.length === 0 && <div className="text-center text-slate-500 text-xs py-10">No unpaid students</div>}
          </div>
        </div>

        {/* Paid Column */}
        <div className="bg-slate-900/40 rounded-2xl border border-green-500/20 p-4 space-y-3">
          <div className="border-b border-green-500/20 pb-2">
            <h4 className="font-bold text-green-400">Paid ({filterMonth})</h4>
          </div>
          <div className="max-h-[500px] overflow-y-auto pr-2 space-y-2">
             {paidStudents.map(s => (
               <div key={s.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center group">
                 <div>
                   <div className="text-white text-xs font-bold">{s.username}</div>
                   <div className="text-[10px] text-slate-400">{s.class_types?.join(', ')}</div>
                 </div>
                 <button onClick={() => handleMarkUnpaid(s.id, s.active_months)} className="text-red-500 opacity-0 group-hover:opacity-100 transition px-2 hover:bg-slate-900 rounded cursor-pointer text-[10px]">
                   Undo
                 </button>
               </div>
             ))}
             {paidStudents.length === 0 && <div className="text-center text-slate-500 text-xs py-10">No paid students found</div>}
          </div>
        </div>

        {/* Free Students Column */}
        <div className="bg-slate-900/40 rounded-2xl border border-blue-500/20 p-4 space-y-3">
          <div className="border-b border-blue-500/20 pb-2">
            <h4 className="font-bold text-blue-400">Free Card Students</h4>
          </div>
          <div className="max-h-[500px] overflow-y-auto pr-2 space-y-2">
             {freeStudents.map(s => (
               <div key={s.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center group">
                 <div>
                   <div className="text-white text-xs font-bold flex items-center gap-1">{s.username} <span className="bg-blue-500 text-[8px] text-white px-1.5 rounded uppercase">Free</span></div>
                   <div className="text-[10px] text-slate-400">{s.nic || s.mobile}</div>
                 </div>
                 <button onClick={() => handleDeleteFreePlan(s.id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition px-2 hover:bg-slate-900 rounded cursor-pointer">
                   <Trash2 size={14} />
                 </button>
               </div>
             ))}
             {freeStudents.length === 0 && <div className="text-center text-slate-500 text-xs py-10">No free students</div>}
          </div>
        </div>

      </div>
    </div>
  );
}
