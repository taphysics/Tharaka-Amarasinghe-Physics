import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { UserCheck, Trash2, Send, CheckCircle, Search, Clock, Save, Lock, AlertTriangle } from 'lucide-react';

export default function AdminRegistryTable({ students, setStudents }: { students: any[], setStudents: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [adminDelPass, setAdminDelPass] = useState('');
  const [selectedPending, setSelectedPending] = useState<string[]>([]);
  const [selectedActive, setSelectedActive] = useState<string[]>([]);
  const [reminderUserIds, setReminderUserIds] = useState('');
  const [reminderFees, setReminderFees] = useState('');
  const [reminderTotal, setReminderTotal] = useState('');
  const [reminderMonth, setReminderMonth] = useState('May');
  
  // Basic filtering. For a real app, query supabase directly for better performance.
  const filteredStudents = students.filter(s => 
    s.nic?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.whatsapp?.includes(searchTerm) ||
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingStudents = filteredStudents.filter(s => !s.is_approved).sort((a,b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime());
  const activeStudents = filteredStudents.filter(s => s.is_approved).sort((a,b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());

const handleActivate = async (ids: string[]) => {
    try {
      let activatedRecords: any[] = [];

      for (const id of ids) {
        const { data, error } = await supabase
          .from('students')
          .update({ 
            is_approved: true,
            is_paid: true 
          })
          .eq('id', id)
          .select();

        if (error) {
          console.error("Supabase Error:", error);
          alert('සමාවෙන්න, ගිණුම සක්‍රිය කිරීමේදී දෝෂයක් මතු විය!');
          continue; 
        }

        if (data && data.length > 0) {
          activatedRecords.push(data[0]);
        }
      }

      setStudents((prev: any) => 
        prev.map((s: any) => {
          const updatedStudent = activatedRecords.find((act: any) => act.id === s.id);
          return updatedStudent ? updatedStudent : s;
        })
      );
      
      setSelectedPending([]);
      alert('ගිණුම් සාර්ථකව සක්‍රිය කරන ලදී!');

    } catch (err) {
      console.error(err);
      alert('පද්ධතියේ දෝෂයක් ඇත!');
    }
  };

  const handleDeletePending = async (ids: string[]) => {
    if (!confirm('මෙම පෙන්ඩින් දත්ත මැකීමට අවශ්‍යද?')) return;
    for (const id of ids) {
      await supabase.from('students').delete().eq('id', id);
    }
    setStudents((prev: any) => prev.filter((s: any) => !ids.includes(s.id)));
    setSelectedPending([]);
  };

  const handleDeleteActive = async (ids: string[]) => {
    const pass = prompt('ඇඩ්මින් මුරපදය ඇතුලත් කරන්න (Admin Password Required):');
    if (pass !== 'admin123') {
      alert('මුරපදය වැරදියි!');
      return;
    }
    if (!confirm(`මෙම ක්‍රියාකාරී ගිණුම් ${ids.length}ක් මැකීමට අවශ්‍යද?`)) return;
    for (const id of ids) {
      await supabase.from('students').delete().eq('id', id);
    }
    setStudents((prev: any) => prev.filter((s: any) => !ids.includes(s.id)));
    setSelectedActive([]);
  };

  const handleAddPaidMonth = async (id: string, currentMonths: string[]) => {
    const month = prompt('ගෙවීම් කළ මාසය ඇතුලත් කරන්න (e.g. 2026-05):');
    if (!month) return;
    const newMonths = [...(currentMonths || []), month];
    await supabase.from('students').update({ active_months: newMonths }).eq('id', id);
    setStudents((prev: any) => prev.map((s: any) => s.id === id ? { ...s, active_months: newMonths } : s));
  };

  const toggleSelectAll = (isPending: boolean) => {
    if (isPending) {
      setSelectedPending(prev => prev.length === pendingStudents.length ? [] : pendingStudents.map(s => s.id));
    } else {
      setSelectedActive(prev => prev.length === activeStudents.length ? [] : activeStudents.map(s => s.id));
    }
  };

  const toggleSelection = (id: string, isPending: boolean) => {
    if (isPending) {
      setSelectedPending(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
      setSelectedActive(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm">
        <label className="text-xs text-slate-400 font-bold mb-2 block flex items-center gap-2"><Search size={14}/> NIC හෝ WhatsApp අංකයෙන් සොයන්න</label>
        <input 
          type="text" 
          placeholder="e.g. 200...V or 071..."
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Pending Box */}
        <div className="bg-amber-900/10 border border-amber-800/30 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm flex flex-col h-[500px]">
          <div className="border-b border-amber-800/50 pb-3 flex justify-between items-center shrink-0">
            <h3 className="text-md font-bold text-white flex items-center gap-1.5 font-display"><Clock size={16} className="text-amber-400" /> Pending Registrations ({pendingStudents.length})</h3>
            <div className="flex gap-2">
              <button onClick={() => toggleSelectAll(true)} className="text-[10px] text-slate-400 hover:text-white px-2 cursor-pointer border border-slate-700 rounded-md">All</button>
              {selectedPending.length > 0 && (
                <>
                  <button onClick={() => handleActivate(selectedPending)} className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 object-fit rounded-md cursor-pointer transition">Activate</button>
                  <button onClick={() => handleDeletePending(selectedPending)} className="text-[10px] bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-1 rounded-md cursor-pointer transition"><Trash2 size={12}/></button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 mt-3 scrollbar-thin scrollbar-thumb-slate-700">
            {pendingStudents.map(st => (
              <div key={st.id} className="bg-slate-950/40 p-3 flex gap-3 border border-slate-800/50 rounded-xl">
                 <input type="checkbox" checked={selectedPending.includes(st.id)} onChange={() => toggleSelection(st.id, true)} className="mt-1" />
                 <div className="flex-1 space-y-1">
                    <div className="font-bold text-amber-100 text-sm">{st.name}</div>
                    <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                      <span><b className="text-slate-300">NIC:</b> {st.nic}</span>
                      <span><b className="text-slate-300">WA:</b> {st.whatsapp}</span>
                      <span><b className="text-slate-300">Mobile:</b> {st.mobile}</span>
                      <span><b className="text-slate-300">Class:</b> {st.class_types?.join(', ')}</span>
                      <span><b className="text-slate-300">Dist:</b> {st.district}</span>
                    </div>
                    <div className="text-[9px] text-amber-500/80 font-mono flex justify-end">Reg: {new Date(st.joined_at).toLocaleString()}</div>
                 </div>
              </div>
            ))}
            {pendingStudents.length === 0 && <div className="text-xs text-slate-500 text-center py-10">No pending requests</div>}
          </div>
        </div>

        {/* Active Box */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm flex flex-col h-[500px]">
          <div className="border-b border-slate-800 pb-3 flex justify-between items-center shrink-0">
            <h3 className="text-md font-bold text-white flex items-center gap-1.5 font-display"><UserCheck size={16} className="text-emerald-400" /> Active Students ({activeStudents.length})</h3>
            <div className="flex gap-2">
              <button onClick={() => toggleSelectAll(false)} className="text-[10px] text-slate-400 hover:text-white px-2 cursor-pointer border border-slate-700 rounded-md">All</button>
              {selectedActive.length > 0 && (
                <button onClick={() => handleDeleteActive(selectedActive)} className="text-[10px] bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-1 rounded-md cursor-pointer transition flex items-center gap-1"><Lock size={12}/> Delete</button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 mt-3 scrollbar-thin scrollbar-thumb-slate-700">
            {activeStudents.map(st => (
              <div key={st.id} className="bg-slate-900/60 p-3 flex gap-3 border border-slate-800/80 rounded-xl group hover:border-emerald-500/30 transition">
                 <input type="checkbox" checked={selectedActive.includes(st.id)} onChange={() => toggleSelection(st.id, false)} className="mt-1" />
                 <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <div className="font-bold text-emerald-100 text-sm flex items-center gap-2">
                        {st.name} <span className="bg-slate-950 text-blue-400 px-2 py-0.5 rounded text-[10px] border border-blue-500/20">{st.username}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${st.isPaid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-500'}`}>
                        {st.isPaid ? 'PAID' : 'UNPAID current month'}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1 mt-1 font-mono">
                      <span><b className="text-slate-300">PW:</b> {st.password}</span>
                      <span><b className="text-slate-300">NIC:</b> {st.nic}</span>
                      <span><b className="text-slate-300">WA:</b> {st.whatsapp}</span>
                      <span><b className="text-slate-300">Class:</b> {st.class_types?.join(', ')}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono mt-1 pt-1 border-t border-slate-800/50 flex justify-between items-center">
                      <span>{(st.active_months || st.activeMonths)?.length > 0 ? `Paid: ${(st.active_months || st.activeMonths).join(', ')}` : 'No paid months yet.'}</span>
                      <button onClick={() => handleAddPaidMonth(st.id, st.active_months)} className="text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded hover:bg-blue-600/20">Add Month +</button>
                    </div>
                 </div>
              </div>
            ))}
            {activeStudents.length === 0 && <div className="text-xs text-slate-500 text-center py-10">No active students found</div>}
          </div>
        </div>
      </div>

      {/* Unpaid Students Section */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm mt-6 flex flex-col xl:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <h3 className="text-md font-bold text-white flex items-center gap-1.5 font-display"><AlertTriangle size={16} className="text-rose-400" /> Unpaid Students (Current Month)</h3>
          <p className="text-xs text-slate-400">වත්මන් මාසයේ ගෙවීම් කර නොමැති සිසුන් පහතින් දැක්වේ.</p>
          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700">
             {activeStudents.filter(s => {
                const now = new Date();
                const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                return !(s.activeMonths || []).includes(currentMonthStr);
             }).map(st => (
               <div key={st.id} className="bg-slate-900/60 p-3 flex justify-between items-center border border-slate-800/80 rounded-xl">
                 <div>
                   <div className="font-bold text-slate-200 text-sm">{st.name} <span className="text-rose-400 text-[10px] ml-2 font-mono">[{st.username}]</span></div>
                   <div className="text-[10px] text-slate-400 mt-1">Class: {st.class_types?.join(', ')} | WA: {st.whatsapp}</div>
                 </div>
                 <button onClick={() => setReminderUserIds(prev => prev.includes(st.username) ? prev : [...prev, st.username].join(', '))} className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-2 py-1 object-fit rounded-md cursor-pointer hover:bg-indigo-600 hover:text-white transition">Select</button>
               </div>
             ))}
          </div>
        </div>

        <div className="flex-1 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><Send size={14} className="text-blue-400" /> Send WhatsApp Reminder</h3>
          <input 
            type="text" 
            placeholder="User IDs (e.g. NUAM2507, SAMA1234)"
            value={reminderUserIds}
            onChange={(e) => setReminderUserIds(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
          />
          <input 
            type="text" 
            placeholder="Class Fee (e.g. Physics 2026: 2500, Chemistry: 2000)"
            value={reminderFees}
            onChange={(e) => setReminderFees(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
          />
          <input 
            type="number" 
            placeholder="Total Amount (e.g. 4500)"
            value={reminderTotal}
            onChange={(e) => setReminderTotal(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
          />
          <select 
            value={reminderMonth}
            onChange={(e) => setReminderMonth(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition"
          >
            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button onClick={() => {
            if(!reminderUserIds) return;
            const message = `*TA Physics Online Hub - Payment Reminder*\n\nDear Student,\nYour payment for the month of *${reminderMonth}* is pending.\n\n*Fees Breakdown:*\n${reminderFees}\n*Total Due: Rs. ${reminderTotal}*\n\nPlease make the payment to restore your portal access. Thank you!`;
            // Normally you would integrate with a WhatsApp API here to send it to all numbers automatically based on IDs.
            // For now we will just pop one up as a mailto/wa.me link or alert since we are client side.
            alert(`Message Ready to Send to IDs: ${reminderUserIds}\n\n${message}\n\n(In a full backend setup this triggers the WhatsApp cloud API)`);
          }} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-xl transition mt-2 text-xs">
            Generate &amp; Send Notifications
          </button>
        </div>
      </div>
    </div>
  );
}
